"use client";
// Paper trading engine: accounts, orders, positions, P&L. Persisted per-profile
// in localStorage (PRD wants 2-5 local users — profiles, not real auth).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Account, Order, OrderSide, OrderType, Position, Trade } from "./types";
import { findIndexOf, findQuote, latestMarkets, useAllMarkets } from "./market";
import { orderCharges } from "./charges";
import { sellMargin } from "./margin";
import { marketOpen, marketStatus } from "./hours";
import { inr } from "./format";

interface PaperState {
  account: Account;
  positions: Position[];
  orders: Order[];
  trades: Trade[];
}

interface PaperApi extends PaperState {
  profiles: string[];
  activeProfile: string;
  switchProfile: (name: string) => void;
  createProfile: (name: string, startingBalance: number) => void;
  resetAccount: () => void;
  placeOrder: (p: {
    instrumentKey: string;
    label: string;
    side: OrderSide;
    type: OrderType;
    lots: number;
    limitPrice?: number;
    stopLoss?: number;
    target?: number;
    trail?: number;
  }) => void;
  /** attach / edit / clear the bracket on an open position mid-trade */
  setBracket: (
    instrumentKey: string,
    patch: { stopLoss?: number; target?: number; trail?: number }
  ) => void;
  cancelOrder: (id: string) => void;
  squareOff: (instrumentKey: string) => void;
  squareOffAll: () => void;
  unrealized: number;
  equity: number;
  usedMargin: number;
  availableMargin: number;
}

const freshAccount = (name: string, startingBalance: number): Account => ({
  name,
  startingBalance,
  balance: startingBalance,
  createdAt: Date.now(),
  equityHistory: [{ ts: Date.now(), equity: startingBalance }],
});

const freshState = (name: string, bal: number): PaperState => ({
  account: freshAccount(name, bal),
  positions: [],
  orders: [],
  trades: [],
});

/** Accounts saved before charges existed have no `charges` field; without this
 *  the first fill against an old position turns its P&L into NaN. */
function normalize(s: PaperState): PaperState {
  return {
    ...s,
    positions: s.positions.map((p) => ({ ...p, charges: p.charges ?? 0, margin: p.margin ?? 0 })),
    trades: s.trades.map((t) => ({ ...t, charges: t.charges ?? 0 })),
  };
}

function hydrate(raw: string | null, name: string): PaperState {
  return raw ? normalize(JSON.parse(raw)) : freshState(name, 1000000);
}

const LS_PROFILES = "pt.profiles";
const LS_ACTIVE = "pt.active";
const lsKey = (p: string) => `pt.state.${p}`;

// SQLite on the data server is the durable store; localStorage is an offline
// cache so the app still works when the server is down. Reads prefer the server,
// writes go to both (localStorage now, server debounced).
const DATA_URL = process.env.NEXT_PUBLIC_DATA_URL ?? "http://localhost:8000";

async function fetchMeta(): Promise<{ profiles: string[]; active: string } | null> {
  try {
    const r = await fetch(`${DATA_URL}/paper`, { signal: AbortSignal.timeout(4000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function fetchState(profile: string): Promise<PaperState | null> {
  try {
    const r = await fetch(`${DATA_URL}/paper/${encodeURIComponent(profile)}`, {
      signal: AbortSignal.timeout(4000),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function putState(profile: string, state: PaperState) {
  fetch(`${DATA_URL}/paper/${encodeURIComponent(profile)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: state }),
  }).catch(() => {}); // offline: localStorage already has it, retry on next change
}

function putMeta(profiles: string[], active: string) {
  fetch(`${DATA_URL}/paper/__meta__`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { profiles, active } }),
  }).catch(() => {});
}

const PaperCtx = createContext<PaperApi | null>(null);

export function PaperProvider({ children }: { children: React.ReactNode }) {
  const snap = useAllMarkets();
  const [profiles, setProfiles] = useState<string[]>([]);
  const [activeProfile, setActiveProfile] = useState("");
  const [state, setState] = useState<PaperState | null>(null);

  // load once — prefer the server, fall back to localStorage when it's down
  useEffect(() => {
    let dead = false;
    (async () => {
      const meta = await fetchMeta();
      if (dead) return;
      if (meta?.profiles.length) {
        const active = meta.active || meta.profiles[0];
        setProfiles(meta.profiles);
        setActiveProfile(active);
        const rs = await fetchState(active);
        if (dead) return;
        if (rs) {
          localStorage.setItem(lsKey(active), JSON.stringify(rs));
          setState(normalize(rs));
        } else {
          setState(hydrate(localStorage.getItem(lsKey(active)), active));
        }
        return;
      }
      // no server (or nothing saved there yet) → localStorage
      const ps: string[] = JSON.parse(localStorage.getItem(LS_PROFILES) ?? "[]");
      const active = localStorage.getItem(LS_ACTIVE) ?? ps[0] ?? "";
      setProfiles(ps);
      setActiveProfile(active);
      if (active) setState(hydrate(localStorage.getItem(lsKey(active)), active));
    })();
    return () => {
      dead = true;
    };
  }, []);

  // persist the profile roster whenever it changes
  useEffect(() => {
    if (!activeProfile) return;
    localStorage.setItem(LS_PROFILES, JSON.stringify(profiles));
    localStorage.setItem(LS_ACTIVE, activeProfile);
    putMeta(profiles, activeProfile);
  }, [profiles, activeProfile]);

  // persist state on change: localStorage instantly, server debounced
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!state || !activeProfile) return;
    localStorage.setItem(lsKey(activeProfile), JSON.stringify(state));
    clearTimeout(saveTimer.current);
    const s = state;
    const p = activeProfile;
    saveTimer.current = setTimeout(() => putState(p, s), 800);
  }, [state, activeProfile]);

  const createProfile = useCallback((name: string, startingBalance: number) => {
    setProfiles((ps) => (ps.includes(name) ? ps : [...ps, name]));
    setActiveProfile(name);
    const fresh = freshState(name, startingBalance);
    setState(fresh);
    putState(name, fresh); // seed the server row immediately
  }, []);

  const switchProfile = useCallback((name: string) => {
    setActiveProfile(name);
    (async () => {
      const rs = await fetchState(name);
      setState(rs ? normalize(rs) : hydrate(localStorage.getItem(lsKey(name)), name));
    })();
  }, []);

  const resetAccount = useCallback(() => {
    setState((s) =>
      s ? freshState(s.account.name, s.account.startingBalance) : s
    );
    toast("Account reset", { description: "Balance restored, history cleared." });
  }, []);

  // core fill: mutates positions/balance for an executed trade
  const applyFill = useCallback(
    (s: PaperState, o: Order, price: number): PaperState => {
      const signedQty = o.side === "BUY" ? o.qty : -o.qty;
      const cost = orderCharges({
        instrumentKey: o.instrumentKey,
        side: o.side,
        qty: o.qty,
        price,
      }).total;
      // margin is quoted off the index notional, so it needs spot, not premium
      const ix = findIndexOf(latestMarkets.current, o.instrumentKey);
      const marginFor = (units: number) =>
        ix ? sellMargin(ix.id, ix.spot, units).total : 0;

      const positions = [...s.positions];
      const i = positions.findIndex((p) => p.instrumentKey === o.instrumentKey);
      let realized = 0;
      if (i === -1) {
        positions.push({
          instrumentKey: o.instrumentKey,
          label: o.label,
          qty: signedQty,
          avgPrice: price,
          realized: 0,
          charges: cost, // carried until this qty is closed
          margin: signedQty < 0 ? marginFor(o.qty) : 0,
          stopLoss: o.stopLoss,
          target: o.target,
          trail: o.trail,
        });
      } else {
        const p = { ...positions[i] };
        if (Math.sign(p.qty) === Math.sign(signedQty) || p.qty === 0) {
          p.avgPrice =
            (p.avgPrice * Math.abs(p.qty) + price * Math.abs(signedQty)) /
            (Math.abs(p.qty) + Math.abs(signedQty));
          p.qty += signedQty;
          p.charges += cost;
          if (p.qty < 0) p.margin += marginFor(o.qty); // writing more
          if (o.stopLoss !== undefined) p.stopLoss = o.stopLoss;
          if (o.target !== undefined) p.target = o.target;
          if (o.trail !== undefined) p.trail = o.trail;
        } else {
          const closing = Math.min(Math.abs(p.qty), Math.abs(signedQty));
          // charges booked when this qty was opened, pro-rated to the part closing
          const frac = closing / Math.abs(p.qty);
          const openShare = p.charges * frac;
          p.charges -= openShare;
          p.margin -= p.margin * frac; // covering releases margin pro-rata
          realized =
            (price - p.avgPrice) * closing * Math.sign(p.qty) - cost - openShare;
          p.realized += realized;
          p.qty += signedQty;
          if (Math.sign(p.qty) === Math.sign(signedQty) && p.qty !== 0) {
            // flipped through zero — the reopened side carries no prior charges
            p.avgPrice = price;
            p.charges = 0;
            p.margin = p.qty < 0 ? marginFor(Math.abs(p.qty)) : 0;
          }
        }
        if (p.qty === 0) positions.splice(i, 1);
        else positions[i] = p;
      }
      // premium cash flow alone nets out to realized P&L across open+close — don't add realized again
      const balance = s.account.balance - signedQty * price - cost;
      const trade: Trade = {
        id: o.id + "-t",
        ts: Date.now(),
        instrumentKey: o.instrumentKey,
        label: o.label,
        side: o.side,
        qty: o.qty,
        price,
        realized,
        charges: cost,
      };
      const equityHistory = [
        ...s.account.equityHistory,
        { ts: Date.now(), equity: balance },
      ].slice(-500);
      return {
        ...s,
        positions,
        trades: [trade, ...s.trades],
        account: { ...s.account, balance, equityHistory },
      };
    },
    []
  );

  const placeOrder = useCallback<PaperApi["placeOrder"]>(
    ({ instrumentKey, label, side, type, lots, limitPrice, stopLoss, target, trail }) => {
      if (!marketOpen()) {
        const { label: why } = marketStatus();
        toast.error("Market closed", {
          description: `${why} — orders accepted 09:15–15:30 IST, Mon–Fri.`,
        });
        return;
      }
      const lot = findIndexOf(snap, instrumentKey)?.lot;
      if (!lot) {
        toast.error("No live quote", { description: `${label} isn't in the feed right now.` });
        return;
      }
      const qty = lots * lot;
      const q = findQuote(snap, instrumentKey);

      // Funds check, the way a broker rejects before routing. Selling blocks
      // SPAN + exposure on the notional; buying just needs the premium.
      const ix = findIndexOf(snap, instrumentKey);
      const held = state?.positions.find(
        (p) => p.instrumentKey === instrumentKey
      )?.qty ?? 0;
      const est = q ? (side === "BUY" ? q.ask || q.ltp : q.bid || q.ltp) : 0;
      const fees = orderCharges({ instrumentKey, side, qty, price: est }).total;

      if (side === "SELL") {
        // only the part beyond any long already held opens a short
        const opening = Math.max(0, qty - Math.max(held, 0));
        const need = opening && ix ? sellMargin(ix.id, ix.spot, opening).total : 0;
        const blocked = (state?.positions ?? []).reduce((n, p) => n + p.margin, 0);
        const free = Math.max(0, (state?.account.balance ?? 0) - blocked);
        if (need > free) {
          toast.error("Insufficient margin", {
            description: `${label} needs ${inr(need)} to write ${
              opening / lot
            } lot(s). Available ${inr(free)}.`,
          });
          return;
        }
      } else if (qty * est + fees > (state?.account.balance ?? 0)) {
        toast.error("Insufficient funds", {
          description: `${label} costs ${inr(qty * est + fees)} including charges. Balance ${inr(
            state?.account.balance ?? 0
          )}.`,
        });
        return;
      }
      const o: Order = {
        id: crypto.randomUUID().slice(0, 8),
        ts: Date.now(),
        instrumentKey,
        label,
        side,
        type,
        qty,
        limitPrice,
        stopLoss,
        target,
        trail,
        status: "PENDING",
      };
      setState((s) => (s ? { ...s, orders: [o, ...s.orders] } : s));

      if (type !== "MARKET" || !q) {
        toast(`Limit order placed`, {
          description: `${side} ${qty} ${label} @ ${limitPrice?.toFixed(2)}`,
        });
        return;
      }

      // Real brokers take a moment to route and confirm; filling in the same
      // frame as the click made the app feel fake, and hid the fact that the
      // price can move between placing and filling.
      setTimeout(
        () =>
          setState((s) => {
            if (!s) return s;
            const live = s.orders.find((x) => x.id === o.id);
            if (live?.status !== "PENDING") return s; // cancelled mid-flight
            const now = findQuote(latestMarkets.current, instrumentKey) ?? q;
            const price = side === "BUY" ? now.ask || now.ltp : now.bid || now.ltp;
            const filled = { ...o, status: "FILLED" as const, fillPrice: price };
            const cost = orderCharges({ instrumentKey, side, qty, price }).total;
            toast.success(`${side} ${lots} lot ${label}`, {
              description: `Filled ${qty} @ ${price.toFixed(2)} · ${inr(
                price * qty
              )} + ${inr(cost)} charges`,
            });
            return {
              ...applyFill(s, filled, price),
              orders: s.orders.map((x) => (x.id === o.id ? filled : x)),
            };
          }),
        100 + Math.random() * 200
      );
    },
    [snap, state, applyFill]
  );

  // limit-order matching on every tick
  useEffect(() => {
    if (!snap) return;
    setState((s) => {
      if (!s || !s.orders.some((o) => o.status === "PENDING")) return s;
      let next = s;
      const orders = s.orders.map((o) => {
        if (o.status !== "PENDING" || o.limitPrice == null) return o;
        const q = findQuote(snap, o.instrumentKey);
        if (!q) return o;
        const crossed =
          o.side === "BUY" ? q.ltp <= o.limitPrice : q.ltp >= o.limitPrice;
        if (!crossed) return o;
        const filled = { ...o, status: "FILLED" as const, fillPrice: o.limitPrice };
        next = applyFill(next, filled, o.limitPrice);
        toast.success(`Limit filled: ${o.side} ${o.label} @ ${o.limitPrice.toFixed(2)}`);
        return filled;
      });
      return next === s && orders.every((o, i) => o === s.orders[i])
        ? s
        : { ...next, orders };
    });
  }, [snap, applyFill]);

  // SL / target auto-exit — checked on every tick, like a broker's bracket leg.
  // Trailing stops ratchet the SL toward price first (long: up only, short: down
  // only), then the same hit-check fires the exit.
  useEffect(() => {
    if (!snap) return;
    setState((s) => {
      if (!s || !s.positions.some((p) => p.stopLoss || p.target || p.trail)) return s;
      let trailed = false;
      const positions = s.positions.map((p) => {
        if (!p.trail) return p;
        const q = findQuote(snap, p.instrumentKey);
        if (!q) return p;
        const long = p.qty > 0;
        const wants = long ? q.ltp - p.trail : q.ltp + p.trail;
        const sl =
          p.stopLoss == null ? wants : long ? Math.max(p.stopLoss, wants) : Math.min(p.stopLoss, wants);
        if (sl === p.stopLoss) return p;
        trailed = true;
        return { ...p, stopLoss: sl };
      });
      let next: PaperState = trailed ? { ...s, positions } : s;
      for (const p of positions) {
        const q = findQuote(snap, p.instrumentKey);
        if (!q || (!p.stopLoss && !p.target)) continue;
        const long = p.qty > 0;
        // long: SL below entry, target above. short: mirrored.
        const hitSl =
          p.stopLoss != null &&
          (long ? q.ltp <= p.stopLoss : q.ltp >= p.stopLoss);
        const hitTarget =
          p.target != null && (long ? q.ltp >= p.target : q.ltp <= p.target);
        if (!hitSl && !hitTarget) continue;

        const side: OrderSide = long ? "SELL" : "BUY";
        const price = side === "BUY" ? q.ask || q.ltp : q.bid || q.ltp;
        const o: Order = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          instrumentKey: p.instrumentKey,
          label: p.label,
          side,
          type: "MARKET",
          qty: Math.abs(p.qty),
          status: "FILLED",
          fillPrice: price,
        };
        next = { ...applyFill(next, o, price), orders: [o, ...next.orders] };
        const what = hitSl ? "Stop-loss" : "Target";
        (hitSl ? toast.error : toast.success)(`${what} hit — ${p.label}`, {
          description: `Exited ${Math.abs(p.qty)} @ ${price.toFixed(2)}`,
        });
      }
      return next;
    });
  }, [snap, applyFill]);

  // square everything off at the close, so nothing carries overnight.
  // only on a real open→closed transition — never on a page load while shut,
  // otherwise reopening the app on a weekend would nuke Friday's positions.
  const sawOpen = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      if (marketOpen()) {
        sawOpen.current = true;
        return;
      }
      if (!sawOpen.current) return;
      sawOpen.current = false;
      setState((s) => {
        if (!s?.positions.length) return s;
        toast("Market closed — positions squared off at last price");
        let next = s;
        for (const p of s.positions) {
          const q = findQuote(latestMarkets.current, p.instrumentKey);
          if (!q) continue;
          const side: OrderSide = p.qty > 0 ? "SELL" : "BUY";
          const o: Order = {
            id: crypto.randomUUID().slice(0, 8),
            ts: Date.now(),
            instrumentKey: p.instrumentKey,
            label: p.label,
            side,
            type: "MARKET",
            qty: Math.abs(p.qty),
            status: "FILLED",
            fillPrice: q.ltp,
          };
          next = { ...applyFill(next, o, q.ltp), orders: [o, ...next.orders] };
        }
        return next;
      });
    }, 30000);
    return () => clearInterval(t);
  }, [applyFill]);

  // edit a live position's bracket — pass a value to set, undefined to clear a leg
  const setBracket = useCallback<PaperApi["setBracket"]>((instrumentKey, patch) => {
    setState((s) =>
      s
        ? {
            ...s,
            positions: s.positions.map((p) =>
              p.instrumentKey === instrumentKey ? { ...p, ...patch } : p
            ),
          }
        : s
    );
  }, []);

  const cancelOrder = useCallback((id: string) => {
    setState((s) =>
      s
        ? {
            ...s,
            orders: s.orders.map((o) =>
              o.id === id && o.status === "PENDING"
                ? { ...o, status: "CANCELLED" as const }
                : o
            ),
          }
        : s
    );
  }, []);

  const squareOff = useCallback(
    (instrumentKey: string) => {
      setState((s) => {
        if (!s) return s;
        const p = s.positions.find((x) => x.instrumentKey === instrumentKey);
        const q = findQuote(latestMarkets.current, instrumentKey);
        if (!p || !q) return s;
        const side: OrderSide = p.qty > 0 ? "SELL" : "BUY";
        const price = side === "BUY" ? q.ask || q.ltp : q.bid || q.ltp;
        const o: Order = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          instrumentKey,
          label: p.label,
          side,
          type: "MARKET",
          qty: Math.abs(p.qty),
          status: "FILLED",
          fillPrice: price,
        };
        toast(`Squared off ${p.label}`, { description: `@ ${price.toFixed(2)}` });
        return { ...applyFill(s, o, price), orders: [o, ...s.orders] };
      });
    },
    [applyFill]
  );

  const squareOffAll = useCallback(() => {
    setState((s) => {
      if (!s) return s;
      let next = s;
      for (const p of s.positions) {
        const q = findQuote(latestMarkets.current, p.instrumentKey);
        if (!q) continue;
        const side: OrderSide = p.qty > 0 ? "SELL" : "BUY";
        const price = side === "BUY" ? q.ask || q.ltp : q.bid || q.ltp;
        const o: Order = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          instrumentKey: p.instrumentKey,
          label: p.label,
          side,
          type: "MARKET",
          qty: Math.abs(p.qty),
          status: "FILLED",
          fillPrice: price,
        };
        next = { ...applyFill(next, o, price), orders: [o, ...next.orders] };
      }
      toast("All positions squared off");
      return next;
    });
  }, [applyFill]);

  // derived
  const unrealized = (state?.positions ?? []).reduce((sum, p) => {
    const q = findQuote(snap, p.instrumentKey);
    return sum + (q ? (q.ltp - p.avgPrice) * p.qty : 0);
  }, 0);
  const usedMargin = (state?.positions ?? []).reduce((sum, p) => sum + p.margin, 0);
  const equity = (state?.account.balance ?? 0) + unrealized;
  // margin is blocked, not spent — it comes off what you can open next
  const availableMargin = Math.max(0, (state?.account.balance ?? 0) - usedMargin);

  const api: PaperApi | null = state
    ? {
        ...state,
        profiles,
        activeProfile,
        switchProfile,
        createProfile,
        resetAccount,
        placeOrder,
        setBracket,
        cancelOrder,
        squareOff,
        squareOffAll,
        unrealized,
        equity,
        usedMargin,
        availableMargin,
      }
    : null;

  return (
    <PaperCtx.Provider value={api}>
      {api ? children : <Onboard createProfile={createProfile} />}
    </PaperCtx.Provider>
  );
}

export function usePaper() {
  const ctx = useContext(PaperCtx);
  if (!ctx) throw new Error("usePaper outside PaperProvider");
  return ctx;
}

// Minimal onboarding: pick name + dummy capital. Lives here to keep the guard simple.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

function Onboard({
  createProfile,
}: {
  createProfile: (n: string, b: number) => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("1000000");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm rounded-3xl">
        <CardContent className="flex flex-col gap-4 p-6">
          <div>
            <h1 className="text-2xl font-black">Create your account</h1>
            <p className="text-sm text-body">
              Pick a name and virtual capital. No real money, ever.
            </p>
          </div>
          <Input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Virtual capital (₹)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="flex gap-2">
            {[500000, 1000000, 5000000].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(String(v))}
                className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold hover:bg-accent"
              >
                {inr(v)}
              </button>
            ))}
          </div>
          <Button
            className="h-11 rounded-3xl text-base font-semibold"
            disabled={!name.trim() || +amount <= 0}
            onClick={() => createProfile(name.trim(), +amount)}
          >
            Start paper trading
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
