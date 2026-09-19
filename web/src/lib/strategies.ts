// Prebuilt option strategies.
//
// One generic multi-leg builder rather than thirty hand-written strategies: a
// strategy is just a list of legs expressed as offsets from the ATM strike, and
// everything else (premium, payoff, breakevens, margin) falls out of the same
// numeric routines. Adding a strategy means adding a row to CATALOG.
//
// Payoff is computed by scanning the expiry P&L across a price range instead of
// per-structure algebra — that way a jade lizard and a long call go through the
// exact same code path. Run `npm run check:strategies` after editing.

// type-only, so Node's type stripping erases it when the self-check runs this file directly
import type { MarketSnapshot, OptionSide, OrderSide } from "./types";

export interface LegSpec {
  side: OrderSide;
  opt: OptionSide;
  /** strikes away from ATM: -2 = two strikes below, +2 = two above */
  offset: number;
  /** lot multiplier for this leg (2 = twice the base lots) */
  ratio: number;
}

export type StrategyGroup = "buy" | "sell" | "neutral";

export interface Strategy {
  id: string;
  name: string;
  group: StrategyGroup;
  outlook: string;
  about: string;
  legs: LegSpec[];
  /**
   * Set for the intraday breakout plans (9:16 / 9:20 / ORB). These aren't leg
   * structures at all — they're monitors that arm and fire one option buy when
   * the index breaks its opening range, so they carry no legs and are run by
   * autotrade.tsx instead. The value is the default reference window in minutes.
   */
  breakout?: { rangeMinutes: number };
  /** set when the strategy can't be deployed here, explaining why */
  unavailable?: string;
}

const leg = (side: OrderSide, opt: OptionSide, offset: number, ratio = 1): LegSpec => ({
  side,
  opt,
  offset,
  ratio,
});

// Why some are disabled: this feed carries a single (nearest) expiry, and the
// account trades index options only — there is no equity leg to write against.
const NEEDS_EXPIRIES = "Needs two expiries — the feed carries only the nearest one.";
const NEEDS_EQUITY = "Needs an underlying equity holding; this account trades index options only.";
const IS_A_SIGNAL = "An entry-timing rule, not an option structure — needs an intraday signal engine.";

export const CATALOG: Strategy[] = [
  // ── buying / net debit ────────────────────────────────────────────
  {
    id: "long-call",
    name: "Long Call",
    group: "buy",
    outlook: "Bullish",
    about: "Pay premium for unlimited upside. Loss capped at the premium.",
    legs: [leg("BUY", "CE", 0)],
  },
  {
    id: "long-put",
    name: "Long Put",
    group: "buy",
    outlook: "Bearish",
    about: "Pay premium for downside to zero. Loss capped at the premium.",
    legs: [leg("BUY", "PE", 0)],
  },
  {
    id: "bull-call-spread",
    name: "Bull Call Spread",
    group: "buy",
    outlook: "Moderately bullish",
    about: "Buy a call, sell a higher one. Cheaper than a long call, capped upside.",
    legs: [leg("BUY", "CE", 0), leg("SELL", "CE", 2)],
  },
  {
    id: "bear-put-spread",
    name: "Bear Put Spread",
    group: "buy",
    outlook: "Moderately bearish",
    about: "Buy a put, sell a lower one. Defined risk and defined reward.",
    legs: [leg("BUY", "PE", 0), leg("SELL", "PE", -2)],
  },
  {
    id: "long-straddle",
    name: "Long Straddle",
    group: "buy",
    outlook: "Big move, either way",
    about: "Buy ATM call and put. Needs a move bigger than the combined premium.",
    legs: [leg("BUY", "CE", 0), leg("BUY", "PE", 0)],
  },
  {
    id: "long-strangle",
    name: "Long Strangle",
    group: "buy",
    outlook: "Big move, either way",
    about: "Cheaper than a straddle using OTM strikes, but needs a larger move.",
    legs: [leg("BUY", "CE", 2), leg("BUY", "PE", -2)],
  },
  {
    id: "call-ratio-backspread",
    name: "Call Ratio Backspread",
    group: "buy",
    outlook: "Sharply bullish",
    about: "Sell one near call, buy two further out. Profits on a violent up-move.",
    legs: [leg("SELL", "CE", 0), leg("BUY", "CE", 2, 2)],
  },
  {
    id: "put-ratio-backspread",
    name: "Put Ratio Backspread",
    group: "buy",
    outlook: "Sharply bearish",
    about: "Sell one near put, buy two further out. Profits on a crash.",
    legs: [leg("SELL", "PE", 0), leg("BUY", "PE", -2, 2)],
  },
  {
    id: "calendar-long",
    name: "Calendar Spread",
    group: "buy",
    outlook: "Neutral, time decay",
    about: "Sell the near expiry, buy the far one.",
    legs: [],
    unavailable: NEEDS_EXPIRIES,
  },
  {
    id: "diagonal",
    name: "Diagonal Spread",
    group: "neutral",
    outlook: "Directional + decay",
    about: "Different strikes and different expiries.",
    legs: [],
    unavailable: NEEDS_EXPIRIES,
  },
  {
    id: "protective-put",
    name: "Protective Put",
    group: "buy",
    outlook: "Hedge a holding",
    about: "Long stock plus a long put as insurance.",
    legs: [],
    unavailable: NEEDS_EQUITY,
  },
  {
    id: "collar",
    name: "Collar",
    group: "neutral",
    outlook: "Hedge a holding",
    about: "Long stock, long put, short call to fund it.",
    legs: [],
    unavailable: NEEDS_EQUITY,
  },
  {
    id: "candle-breakout",
    name: "9:16 / 9:20 Breakout",
    group: "buy",
    outlook: "Momentum",
    about:
      "Arms at the open. Buys a call when the index clears the first candle's high, a put when it loses the low.",
    legs: [],
    breakout: { rangeMinutes: 1 },
  },
  {
    id: "orb",
    name: "Opening Range Breakout",
    group: "buy",
    outlook: "Momentum",
    about:
      "Same trigger on a wider window — the first 15 minutes of the session sets the range.",
    legs: [],
    breakout: { rangeMinutes: 15 },
  },

  // ── selling / net credit ──────────────────────────────────────────
  {
    id: "short-call",
    name: "Naked Short Call",
    group: "sell",
    outlook: "Bearish / flat",
    about: "Collect premium. Unlimited loss if the index rallies — margin heavy.",
    legs: [leg("SELL", "CE", 0)],
  },
  {
    id: "short-put",
    name: "Naked Short Put",
    group: "sell",
    outlook: "Bullish / flat",
    about: "Collect premium. Large loss if the index falls — margin heavy.",
    legs: [leg("SELL", "PE", 0)],
  },
  {
    id: "short-straddle",
    name: "Short Straddle",
    group: "sell",
    outlook: "Range-bound",
    about: "Sell ATM call and put. Max credit, unlimited risk both ways.",
    legs: [leg("SELL", "CE", 0), leg("SELL", "PE", 0)],
  },
  {
    id: "short-strangle",
    name: "Short Strangle",
    group: "sell",
    outlook: "Range-bound",
    about: "Sell OTM call and put. Wider safe zone than a straddle, less credit.",
    legs: [leg("SELL", "CE", 2), leg("SELL", "PE", -2)],
  },
  {
    id: "bull-put-spread",
    name: "Bull Put Spread",
    group: "sell",
    outlook: "Moderately bullish",
    about: "Sell a put, buy a lower one. Credit taken, risk defined by the width.",
    legs: [leg("SELL", "PE", 0), leg("BUY", "PE", -2)],
  },
  {
    id: "bear-call-spread",
    name: "Bear Call Spread",
    group: "sell",
    outlook: "Moderately bearish",
    about: "Sell a call, buy a higher one. Credit taken, risk defined by the width.",
    legs: [leg("SELL", "CE", 0), leg("BUY", "CE", 2)],
  },
  {
    id: "covered-call",
    name: "Covered Call",
    group: "sell",
    outlook: "Flat / mildly up",
    about: "Write a call against stock you own.",
    legs: [],
    unavailable: NEEDS_EQUITY,
  },
  {
    id: "cash-secured-put",
    name: "Cash-Secured Put",
    group: "sell",
    outlook: "Willing to buy lower",
    about: "Short put fully backed by cash rather than margin.",
    legs: [],
    unavailable: NEEDS_EQUITY,
  },
  {
    id: "gap-fade",
    name: "Gap Fade",
    group: "sell",
    outlook: "Mean reversion",
    about: "Sell premium into a gap open expecting it to fill.",
    legs: [],
    unavailable: IS_A_SIGNAL,
  },

  // ── defined-risk, both sides ──────────────────────────────────────
  {
    id: "iron-condor",
    name: "Iron Condor",
    group: "neutral",
    outlook: "Range-bound",
    about: "Short strangle with wings. Credit taken, loss capped by the wings.",
    legs: [
      leg("BUY", "PE", -4),
      leg("SELL", "PE", -2),
      leg("SELL", "CE", 2),
      leg("BUY", "CE", 4),
    ],
  },
  {
    id: "iron-butterfly",
    name: "Iron Butterfly",
    group: "neutral",
    outlook: "Pinned at ATM",
    about: "Short straddle with wings. Bigger credit than a condor, narrower zone.",
    legs: [
      leg("BUY", "PE", -2),
      leg("SELL", "PE", 0),
      leg("SELL", "CE", 0),
      leg("BUY", "CE", 2),
    ],
  },
  {
    id: "jade-lizard",
    name: "Jade Lizard",
    group: "neutral",
    outlook: "Neutral to bullish",
    about: "Short put plus a call spread. No upside risk if credit beats the width.",
    legs: [leg("SELL", "PE", -2), leg("SELL", "CE", 2), leg("BUY", "CE", 4)],
  },
  {
    id: "broken-wing-butterfly",
    name: "Broken Wing Butterfly",
    group: "neutral",
    outlook: "Neutral to bullish",
    about: "Put butterfly with one wing pushed out, skewed for a net credit.",
    legs: [leg("BUY", "PE", 0), leg("SELL", "PE", -2, 2), leg("BUY", "PE", -5)],
  },
  {
    id: "call-ratio-spread",
    name: "Call Ratio Spread",
    group: "neutral",
    outlook: "Mildly bullish",
    about: "Buy one call, sell two higher. Net credit, risk above the short strikes.",
    legs: [leg("BUY", "CE", 0), leg("SELL", "CE", 2, 2)],
  },
];

/* ── resolution against a live chain ──────────────────────────────── */

export interface ResolvedLeg {
  side: OrderSide;
  opt: OptionSide;
  strike: number;
  instrumentKey: string;
  label: string;
  /** per-unit entry premium, taken from the side of the book we'd hit */
  price: number;
  /** units, i.e. lots × ratio × lot size */
  qty: number;
  lots: number;
}

/** Gap between adjacent strikes — 50 on Nifty, 100 on Bank Nifty, etc. */
export function strikeStep(snap: MarketSnapshot): number {
  if (snap.rows.length < 2) return 50;
  return Math.abs(snap.rows[1].strike - snap.rows[0].strike) || 50;
}

export function atmStrike(snap: MarketSnapshot): number {
  return snap.rows.reduce((a, b) =>
    Math.abs(a.strike - snap.spot) < Math.abs(b.strike - snap.spot) ? a : b
  ).strike;
}

/**
 * Turn a strategy's relative legs into real contracts. `shift` nudges every leg
 * by n strikes (so the user can re-centre the structure); returns null when any
 * leg falls outside the loaded chain.
 */
export function resolve(
  snap: MarketSnapshot,
  s: Strategy,
  lots: number,
  shift = 0
): ResolvedLeg[] | null {
  if (!s.legs.length || !snap.rows.length) return null;
  const step = strikeStep(snap);
  const atm = atmStrike(snap);
  const out: ResolvedLeg[] = [];
  for (const l of s.legs) {
    const strike = atm + (l.offset + shift) * step;
    const row = snap.rows.find((r) => r.strike === strike);
    if (!row) return null;
    const q = l.opt === "CE" ? row.ce : row.pe;
    // hit the side of the book the order would actually cross
    const price = (l.side === "BUY" ? q.ask : q.bid) || q.ltp;
    if (!price) return null;
    const legLots = lots * l.ratio;
    out.push({
      side: l.side,
      opt: l.opt,
      strike,
      instrumentKey: q.instrumentKey,
      label: `${snap.id} ${strike} ${l.opt}`,
      price,
      qty: legLots * snap.lot,
      lots: legLots,
    });
  }
  return out;
}

/** Positive = net debit you pay; negative = net credit you receive. */
export function netPremium(legs: ResolvedLeg[]): number {
  return legs.reduce((n, l) => n + (l.side === "BUY" ? 1 : -1) * l.price * l.qty, 0);
}

/** Total P&L at expiry if the index settles at `s`. */
export function payoffAt(legs: ResolvedLeg[], s: number): number {
  return legs.reduce((sum, l) => {
    const intrinsic = l.opt === "CE" ? Math.max(0, s - l.strike) : Math.max(0, l.strike - s);
    const sign = l.side === "BUY" ? 1 : -1;
    return sum + sign * (intrinsic - l.price) * l.qty;
  }, 0);
}

export interface Analysis {
  netPremium: number;
  /** null means unbounded in that direction */
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
  curve: { s: number; pnl: number }[];
}

const STEPS = 240;

/**
 * Scan the expiry payoff across a price band around the strikes. Numeric rather
 * than closed-form so every structure — including ratios and broken wings —
 * uses the same code.
 */
export function analyse(legs: ResolvedLeg[], spot: number): Analysis {
  const strikes = legs.map((l) => l.strike);
  const lo = Math.min(spot, ...strikes) * 0.85;
  const hi = Math.max(spot, ...strikes) * 1.15;
  const dx = (hi - lo) / STEPS;
  const curve: { s: number; pnl: number }[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const s = lo + i * dx;
    curve.push({ s, pnl: payoffAt(legs, s) });
  }

  const pnls = curve.map((c) => c.pnl);
  // a payoff still sloping at the edge of the scan keeps going — unbounded
  const risingAtTop = pnls[STEPS] - pnls[STEPS - 1] > 1e-6;
  const fallingAtTop = pnls[STEPS] - pnls[STEPS - 1] < -1e-6;
  const risingAtBottom = pnls[0] - pnls[1] > 1e-6; // payoff grows as price falls
  const fallingAtBottom = pnls[0] - pnls[1] < -1e-6;

  const breakevens: number[] = [];
  for (let i = 1; i <= STEPS; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (a.pnl === 0) breakevens.push(a.s);
    else if (a.pnl < 0 !== b.pnl < 0) {
      // linear interpolation between the two samples that straddle zero
      breakevens.push(a.s + ((0 - a.pnl) / (b.pnl - a.pnl)) * (b.s - a.s));
    }
  }

  return {
    netPremium: netPremium(legs),
    maxProfit: risingAtTop || risingAtBottom ? null : Math.max(...pnls),
    maxLoss: fallingAtTop || fallingAtBottom ? null : Math.min(...pnls),
    breakevens,
    curve,
  };
}

/**
 * Per-leg bracket levels from a percentage of each leg's own premium.
 *
 * ponytail: a real basket stop watches the *combined* premium and exits every
 * leg at once; the engine's brackets are per-instrument, so this scales each leg
 * by the same percentage instead. Close enough for single-leg and symmetric
 * structures, rough on ratios. Upgrade path is a basket-level bracket in paper.tsx.
 */
export function legBracket(l: ResolvedLeg, slPct: number, tpPct: number) {
  const long = l.side === "BUY";
  return {
    stopLoss: slPct > 0 ? +(l.price * (long ? 1 - slPct / 100 : 1 + slPct / 100)).toFixed(2) : undefined,
    target: tpPct > 0 ? +(l.price * (long ? 1 + tpPct / 100 : 1 - tpPct / 100)).toFixed(2) : undefined,
  };
}
