# Paperstrike — project handoff

Open-source (AGPL-3.0) NSE index-options paper-trading terminal. Users bring
their own Upstox or Groww API keys; market data is real, money is virtual.
This file is the state of play; read it before changing anything.

## Layout

    data/   FastAPI data service (Python)          → port 8000
      providers/   one adapter per broker behind base.Provider (upstox, groww)
      relay.py     one upstream feed → snapshots for every browser tab
      config.py    the user's keys in DATA_DIR/.env (never sent to the browser)
    web/    Next.js 16 app (React 19, Tailwind v4) → port 3000

`web/AGENTS.md` applies to the frontend: **this is not the Next.js you know** —
check `node_modules/next/dist/docs/` before writing framework code.

## Running it

    docker compose up --build            # or, by hand:
    cd data && python -m uvicorn server:app --host 127.0.0.1 --port 8000
    cd web && npm install && npm run dev

Connect a broker in Settings. Without one the UI shows "No data available"
everywhere — deliberate, see the house rules.

## Not in git (and why)

| File | Contains |
|---|---|
| `data/.env` | the user's broker keys (written by Settings → Connect) |
| `data/paper.db` | the user's paper account: balance, positions, trades |

`paper.db` is the source of truth for accounts; browser localStorage is only an
offline cache that rehydrates from it.

## House rules (learned the hard way — don't undo these)

- **Never invent a price.** No demo/simulated data anywhere. If the feed is
  down, say "No data available". A previous simulator was deleted for this.
- **Numbers swap, they don't count up.** No rolling-odometer animations on live
  values — brokers change the digits directly. See `components/num.tsx`.
- **Never commit `.env` or `paper.db`.**
- Charges and margin are modelled for real: don't "simplify" them away.

## What's built

**Engine** (`web/src/lib/`)
- `paper.tsx` — orders, fills (100-300ms delay), positions, P&L, brackets,
  square-off at close. SQLite-backed via `/paper` endpoints.
- `charges.ts` — FY 2026-27 brokerage, STT, exchange txn, SEBI, IPFT, GST,
  stamp duty.
- `margin.ts` — SPAN + exposure on notional (~₹1.5-2L per written leg).
- `strategies.ts` — 19 deployable multi-leg structures as ATM-relative legs;
  payoff/breakevens computed numerically, so every structure shares one path.
- `breakout.ts` + `autotrade.tsx` — 9:16 / 9:20 / ORB are one monitor with a
  different window. Armed plans survive navigation and refresh, fire once, and
  refuse to chase a range that had already broken.

**Pages** — dashboard, option chain (+ scalp mode: one-tap market orders),
charts (drag SL/TP lines on the chart), positions (mid-trade bracket editor),
portfolio, strategies, settings, landing.

**Indices** — NIFTY, BANKNIFTY, SENSEX. Nearest expiry only, ±25 strikes.

## Checks

    cd web && npm run check     # charges, margin, strategies, breakout, contrast
    cd data && python -m pytest tests

These assert against hand-computed values (a long call's max loss is its
premium, a spread's max profit is width − debit, and so on). They have caught
real arithmetic errors. Run them after touching money or payoff code.

## Known issues / next up

- `paper.tsx` has 2 pre-existing `set-state-in-effect` lint errors. Structural
  (tick-driven engine), build is clean, don't "fix" without restructuring.
- Breakout plans have unit coverage but have **never fired against a live
  session** — arm one at 09:15 IST and watch it.
- Calendar/diagonal spreads need a second expiry; the relay carries one.
- Covered call / collar / protective put need an equity leg that doesn't exist.
- SL/TP on a multi-leg strategy is applied per-leg as a % of that leg's premium.
  A true basket stop watching combined premium needs a basket-level bracket.

## Brokers

- Instrument keys are canonical: `NSE_FO|<exchange token>` / `BSE_FO|<token>`
  for options, fixed keys in `providers/base.INDICES` for indices. Upstox and
  Groww share exchange tokens, so positions survive a broker switch.
- Groww's option chain has no bid/ask or previous OI: bid/ask come from the
  market-depth feed, previous OI/close from one quote per contract per day.
- The Groww adapter is tested against documented payloads only — it has not yet
  run against a live Groww account with a live-data plan.
- Adapters must only read market data. Never add an order-placing call.
