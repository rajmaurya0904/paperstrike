"""Live tick relay: one upstream broker feed → shared state → many browser clients.

The three index chains share one upstream connection. Open interest, volume,
IV and previous close are refreshed from REST every few seconds because feeds
don't carry them reliably. Switching broker (or reconnecting) calls restart(),
which stops the current feed and loads everything again from the new provider.
"""
import threading
import time

import providers
from providers.base import INDICES, NotConnected

# Strikes either side of ATM to subscribe per index: 3 x (2*25+1) x 2 = 306 keys.
WINDOW = 25

# Fields the REST refresh owns — the feed either doesn't carry them or zeroes
# them between ticks, so a tick must never overwrite what REST wrote.
REST_FIELDS = ("oi", "change_oi", "volume", "iv")


class Chain:
    """Nearest-expiry option chain for a single index."""

    def __init__(self, iid, key, label):
        self.id = iid
        self.key = key
        self.label = label
        self.expiry = None
        self.lot = 0
        self.spot = 0.0
        self.prev_close = 0.0
        self.strikes = {}  # instrument key -> {"strike": float, "side": "CE"|"PE"}
        self.state = {}    # instrument key -> field dict


class Relay:
    def __init__(self):
        self.lock = threading.Lock()
        self.version = 0  # bumped on every upstream tick
        self.error = None
        self._started = False
        self._stop = threading.Event()
        self._gen = 0
        self._reset()

    def _reset(self):
        self.chains = {i: Chain(i, v[0], v[1]) for i, v in INDICES.items()}
        self.owner = {}  # instrument key -> Chain, for routing ticks

    # ── lifecycle ────────────────────────────────────────────────
    def start(self):
        with self.lock:
            if self._started:
                return
            self._started = True
            gen = self._gen
        threading.Thread(target=self._run_feed, args=(gen, self._stop), daemon=True).start()
        threading.Thread(target=self._run_rest, args=(gen,), daemon=True).start()

    def restart(self):
        """Drop all state and reconnect — after a broker switch or new credentials."""
        with self.lock:
            self._stop.set()
            self._stop = threading.Event()
            self._gen += 1
            self._started = False
            self._reset()
            self.error = None
            self.version += 1
        self.start()

    def _live(self, gen):
        return gen == self._gen

    def _load(self, p, chain: Chain):
        """Seed one chain from REST and return the keys to subscribe."""
        expiry, lot = p.nearest_expiry(chain.id)
        full = p.chain(chain.id, expiry)
        rows = full.rows
        if not rows:
            raise RuntimeError("empty option chain")
        atm = min(range(len(rows)), key=lambda i: abs(rows[i].strike - full.spot))
        rows = rows[max(0, atm - WINDOW): atm + WINDOW + 1]
        prev_close = chain.prev_close
        if not prev_close:
            try:
                prev_close = p.prev_close(chain.id)
            except Exception:
                pass

        # build off to the side, then swap in under the lock so a snapshot
        # never sees a half-loaded chain (a re-subscribe may shift the window)
        strikes, state, keys = {}, {}, [chain.key]
        for row in rows:
            for side, leg in (("CE", row.ce), ("PE", row.pe)):
                strikes[leg.key] = {"strike": row.strike, "side": side}
                state[leg.key] = _fields(leg)
                keys.append(leg.key)
        with self.lock:
            chain.expiry, chain.lot, chain.spot, chain.prev_close = expiry, lot, full.spot, prev_close
            chain.strikes, chain.state = strikes, state
        return keys

    def _run_feed(self, gen, stop):
        while self._live(gen) and not stop.is_set():
            try:
                p = providers.active()
                if p is None:
                    raise NotConnected("No broker connected")
                keys = []
                with self.lock:
                    self.owner.clear()
                for chain in list(self.chains.values()):
                    try:
                        got = self._load(p, chain)
                    except NotConnected:
                        raise
                    except Exception as e:
                        # one bad index (holiday, no contracts) must not kill the others
                        self.error = f"{chain.id}: {e}"
                        continue
                    with self.lock:
                        for k in got:
                            self.owner[k] = chain
                    keys += got
                if not keys:
                    raise RuntimeError(self.error or "no chains could be loaded")
                with self.lock:
                    self.version += 1
                p.stream(keys, lambda t: self._on_tick(gen, t), stop)
            except NotConnected as e:
                self.error = str(e)
                stop.wait(15)
            except Exception as e:  # token expiry, network drop → back off and retry
                self.error = str(e)
                stop.wait(5)

    def _on_tick(self, gen, tick):
        if not tick or not self._live(gen):
            return
        with self.lock:
            for key, fields in tick.items():
                chain = self.owner.get(key)
                if chain is None:
                    continue
                if key == chain.key:  # the index itself, not an option
                    if fields.get("ltp"):
                        chain.spot = fields["ltp"]
                    if fields.get("close"):
                        chain.prev_close = fields["close"]
                    continue
                cur = chain.state.setdefault(key, {})
                for f, v in fields.items():
                    if f not in REST_FIELDS:
                        cur[f] = v
            self.version += 1

    def _run_rest(self, gen):
        while self._live(gen):
            time.sleep(5)
            p = providers.active()
            if p is None:
                continue
            for chain in list(self.chains.values()):
                if not chain.expiry or not self._live(gen):
                    continue
                try:
                    full = p.chain(chain.id, chain.expiry)
                except Exception:
                    continue
                with self.lock:
                    for row in full.rows:
                        for leg in (row.ce, row.pe):
                            cur = chain.state.get(leg.key)
                            if cur is not None:
                                cur.update(oi=leg.oi, change_oi=leg.change_oi, volume=leg.volume,
                                           iv=leg.iv, delta=leg.delta)
                                if leg.close:
                                    cur["close"] = leg.close

    # ── read side ────────────────────────────────────────────────
    def _rows(self, chain: Chain):
        rows = {}
        for key, meta in chain.strikes.items():
            q = chain.state.get(key)
            if not q:
                continue
            row = rows.setdefault(meta["strike"], {})
            ltp = q.get("ltp", 0)
            # illiquid strikes quote one side or neither; a 0 isn't a price, so
            # fall back to the last trade rather than handing the UI a free option
            row[meta["side"]] = {
                "instrumentKey": key,
                "ltp": ltp,
                "bid": q.get("bid") or ltp,
                "ask": q.get("ask") or ltp,
                "oi": q.get("oi", 0), "changeOi": q.get("change_oi", 0),
                "iv": q.get("iv", 0), "delta": q.get("delta", 0),
                "volume": q.get("volume", 0), "close": q.get("close", 0),
            }
        return [
            {"strike": s, "ce": r["CE"], "pe": r["PE"]}
            for s, r in sorted(rows.items())
            if r.get("CE") and r.get("PE")
        ]

    def snapshot(self):
        with self.lock:
            return {
                "version": self.version,
                "indices": {
                    c.id: {
                        "id": c.id,
                        "key": c.key,
                        "label": c.label,
                        "lot": c.lot,
                        "spot": c.spot,
                        "prevClose": c.prev_close or c.spot,
                        "expiry": c.expiry,
                        "rows": self._rows(c),
                    }
                    for c in self.chains.values()
                    if c.expiry and c.strikes
                },
            }


def _fields(leg):
    return {"ltp": leg.ltp, "bid": leg.bid, "ask": leg.ask, "oi": leg.oi, "change_oi": leg.change_oi,
            "iv": leg.iv, "delta": leg.delta, "volume": leg.volume, "close": leg.close}


relay = Relay()
