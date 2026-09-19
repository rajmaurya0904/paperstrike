// Self-check for option-writing margin. Run: npm run check:margin
// .mts so node treats it as ESM without forcing "type":"module" on the app.
import assert from "node:assert/strict";
import { sellMargin, buyCost } from "../src/lib/margin.ts";

const inLakh = (v: number) => v / 1e5;

// One Nifty leg: 65 × ~23,900 ≈ ₹15.5L notional. Brokers quote ₹1.5-2L.
const nifty = sellMargin("NIFTY", 23900, 65);
assert.ok(
  inLakh(nifty.total) > 1.5 && inLakh(nifty.total) < 2.0,
  `Nifty 1 lot should be ₹1.5-2L, got ₹${inLakh(nifty.total).toFixed(2)}L`
);
assert.ok(nifty.span > nifty.exposure, "SPAN is the larger component");
assert.equal(nifty.span + nifty.exposure, nifty.total);

// Bank Nifty: 30 × ~56,600 ≈ ₹17L notional, and a higher rate on top.
const bn = sellMargin("BANKNIFTY", 56600, 30);
assert.ok(
  inLakh(bn.total) > 1.5 && inLakh(bn.total) < 2.5,
  `Bank Nifty 1 lot should be ₹1.5-2.5L, got ₹${inLakh(bn.total).toFixed(2)}L`
);
assert.ok(
  bn.total / bn.notional > nifty.total / nifty.notional,
  "Bank Nifty should demand a higher rate than Nifty"
);

// Sensex: 20 × ~76,400 ≈ ₹15.3L notional.
const sx = sellMargin("SENSEX", 76400, 20);
assert.ok(
  inLakh(sx.total) > 1.5 && inLakh(sx.total) < 2.0,
  `Sensex 1 lot should be ₹1.5-2L, got ₹${inLakh(sx.total).toFixed(2)}L`
);

// Scales linearly with size, and an unknown index still gets a sane number.
assert.equal(sellMargin("NIFTY", 23900, 130).total, nifty.total * 2);
assert.ok(sellMargin("MYSTERY", 23900, 65).total > 0, "unknown index needs a fallback");
assert.equal(sellMargin("NIFTY", 23900, 0).total, 0);

// Margin is about notional, not premium — that's the whole point.
assert.ok(
  nifty.total > 65 * 120 * 5,
  "margin must dwarf the premium collected, or the model is wrong"
);

// Buying blocks no margin: it costs premium + charges, full stop.
assert.equal(buyCost(65, 120, 26.53), 65 * 120 + 26.53);

console.log(
  "margin ok — NIFTY ₹%sL, BANKNIFTY ₹%sL, SENSEX ₹%sL per lot",
  inLakh(nifty.total).toFixed(2),
  inLakh(bn.total).toFixed(2),
  inLakh(sx.total).toFixed(2)
);
