// Self-check for the strategy payoff engine. Run: npm run check:strategies
// Payoffs are checked against hand-computed values — if the generic scan is
// wrong, a long call is wrong, and that's caught here.
import assert from "node:assert/strict";
import {
  CATALOG,
  analyse,
  atmStrike,
  netPremium,
  payoffAt,
  resolve,
  strikeStep,
  legBracket,
  type ResolvedLeg,
} from "../src/lib/strategies.ts";
import type { MarketSnapshot, OptionQuote } from "../src/lib/types.ts";

const LOT = 65;

const q = (key: string, ltp: number): OptionQuote => ({
  instrumentKey: key,
  ltp,
  bid: ltp,
  ask: ltp,
  oi: 0,
  changeOi: 0,
  iv: 12,
  delta: 0.5,
  volume: 0,
  close: ltp,
});

// synthetic chain: 23600 spot, 50-point strikes, premiums fall as you go OTM
const snap: MarketSnapshot = {
  id: "NIFTY",
  key: "NSE_INDEX|Nifty 50",
  label: "NIFTY 50",
  lot: LOT,
  spot: 23600,
  prevClose: 23500,
  expiry: "2026-07-28",
  updatedAt: Date.now(),
  rows: Array.from({ length: 21 }, (_, i) => {
    const strike = 23600 + (i - 10) * 50;
    return {
      strike,
      ce: q(`CE${strike}`, Math.max(5, 150 - (strike - 23600) / 10)),
      pe: q(`PE${strike}`, Math.max(5, 150 + (strike - 23600) / 10)),
    };
  }),
};

assert.equal(strikeStep(snap), 50, "strike step read off the chain");
assert.equal(atmStrike(snap), 23600, "ATM is the strike nearest spot");

// ── long call: loss capped at premium, upside unbounded ──────────────
const lc = resolve(snap, CATALOG.find((s) => s.id === "long-call")!, 1)!;
assert.equal(lc.length, 1);
assert.equal(lc[0].strike, 23600);
assert.equal(lc[0].qty, LOT);
const prem = lc[0].price;
assert.equal(netPremium(lc), prem * LOT, "a long call is a net debit");
// below the strike the whole premium is lost, and no more
assert.equal(payoffAt(lc, 23000), -prem * LOT);
// 200 points in the money
assert.equal(payoffAt(lc, 23800), (200 - prem) * LOT);
const lcA = analyse(lc, snap.spot);
assert.equal(lcA.maxProfit, null, "long call upside is unbounded");
assert.ok(
  Math.abs(lcA.maxLoss! - -prem * LOT) < 1e-6,
  `long call max loss should be the premium, got ${lcA.maxLoss}`
);
assert.equal(lcA.breakevens.length, 1, "one breakeven");
assert.ok(
  Math.abs(lcA.breakevens[0] - (23600 + prem)) < 5,
  `breakeven ≈ strike + premium, got ${lcA.breakevens[0]}`
);

// ── short put: credit up front, loss when it falls ───────────────────
const sp = resolve(snap, CATALOG.find((s) => s.id === "short-put")!, 1)!;
assert.ok(netPremium(sp) < 0, "selling takes a credit");
assert.equal(payoffAt(sp, 24500), sp[0].price * LOT, "expires worthless, keep it all");

// ── bull call spread: both max profit and max loss are capped ────────
const bcs = resolve(snap, CATALOG.find((s) => s.id === "bull-call-spread")!, 1)!;
assert.equal(bcs.length, 2);
assert.equal(bcs[1].strike, 23700, "short leg two strikes up");
const bcsA = analyse(bcs, snap.spot);
assert.ok(bcsA.maxProfit != null && bcsA.maxLoss != null, "a debit spread is bounded both ways");
const width = (23700 - 23600) * LOT;
assert.ok(
  Math.abs(bcsA.maxProfit! - (width - netPremium(bcs))) < 1,
  "max profit = width − debit paid"
);
assert.ok(
  Math.abs(bcsA.maxLoss! + netPremium(bcs)) < 1,
  "max loss = the debit paid"
);

// ── iron condor: four legs, bounded, two breakevens ──────────────────
const ic = resolve(snap, CATALOG.find((s) => s.id === "iron-condor")!, 1)!;
assert.equal(ic.length, 4);
assert.deepEqual(
  ic.map((l) => l.strike),
  [23400, 23500, 23700, 23800],
  "wings outside the short strikes"
);
const icA = analyse(ic, snap.spot);
assert.ok(icA.maxProfit != null && icA.maxLoss != null, "a condor is defined-risk both ways");
assert.equal(icA.breakevens.length, 2, "a condor has two breakevens");

// ── ratios scale, and out-of-chain legs are refused ──────────────────
const bwb = resolve(snap, CATALOG.find((s) => s.id === "broken-wing-butterfly")!, 1)!;
assert.equal(bwb.find((l) => l.strike === 23500)!.lots, 2, "the middle leg is doubled");
const two = resolve(snap, CATALOG.find((s) => s.id === "long-call")!, 2)!;
assert.equal(two[0].qty, 2 * LOT, "lots scale the quantity");
// shifting far enough walks off the loaded chain
assert.equal(resolve(snap, CATALOG.find((s) => s.id === "iron-condor")!, 1, 40), null);

// every deployable strategy must resolve on a normal chain
for (const s of CATALOG) {
  if (s.unavailable) {
    assert.equal(s.legs.length, 0, `${s.id} is disabled so it should carry no legs`);
    continue;
  }
  if (s.breakout) {
    // monitors, not structures — no legs until they fire (see autotrade.tsx)
    assert.equal(s.legs.length, 0, `${s.id} is a breakout plan so it should carry no legs`);
    assert.ok(s.breakout.rangeMinutes > 0, `${s.id} needs a reference window`);
    continue;
  }
  const legs = resolve(snap, s, 1);
  assert.ok(legs?.length, `${s.id} failed to resolve`);
  assert.ok(analyse(legs!, snap.spot).curve.length > 0, `${s.id} produced no payoff curve`);
}

// ── bracket levels sit on the correct side of entry ──────────────────
const long: ResolvedLeg = { ...lc[0] };
const lb = legBracket(long, 30, 50);
assert.ok(lb.stopLoss! < long.price && lb.target! > long.price, "long: SL below, target above");
const short: ResolvedLeg = { ...lc[0], side: "SELL" };
const sb = legBracket(short, 30, 50);
assert.ok(sb.stopLoss! > short.price && sb.target! < short.price, "short: SL above, target below");
assert.equal(legBracket(long, 0, 0).stopLoss, undefined, "0% means no bracket");

console.log(
  "strategies ok — %d deployable, %d disabled",
  CATALOG.filter((s) => !s.unavailable).length,
  CATALOG.filter((s) => s.unavailable).length
);
