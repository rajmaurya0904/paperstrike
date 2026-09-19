// Self-check for opening-range breakout maths. Run: npm run check:breakout
// The windowing is timezone-sensitive and fires real orders, so it gets tested.
import assert from "node:assert/strict";
import {
  SESSION_OPEN_MIN,
  breakoutSide,
  isSameIstDay,
  istMinutesOf,
  openingRange,
  rangeReady,
  type Bar,
} from "../src/lib/breakout.ts";

// 09:15 IST on 2026-07-24 = 03:45 UTC
const OPEN = Date.UTC(2026, 6, 24, 3, 45, 0) / 1000;
const NOW = (OPEN + 3600) * 1000; // 10:15 IST, same day

assert.equal(istMinutesOf(OPEN), SESSION_OPEN_MIN, "09:15 IST is minute 555");
assert.equal(istMinutesOf(OPEN + 60), SESSION_OPEN_MIN + 1, "one minute later");
assert.ok(isSameIstDay(OPEN, NOW), "same IST day");
assert.ok(!isSameIstDay(OPEN - 86400, NOW), "yesterday is not today");

const bar = (min: number, high: number, low: number): Bar => ({
  time: OPEN + min * 60,
  high,
  low,
});

// 09:15 candle is the widest; later candles must not widen a 1-minute range
const bars: Bar[] = [
  bar(0, 23700, 23600), // 09:15
  bar(1, 23680, 23650), // 09:16
  bar(2, 23900, 23400), // 09:17 — way outside, must be excluded from short windows
  bar(14, 23750, 23500), // 09:29
];

const r1 = openingRange(bars, 1, NOW)!;
assert.deepEqual(
  { high: r1.high, low: r1.low, bars: r1.bars },
  { high: 23700, low: 23600, bars: 1 },
  "1-minute range is only the 09:15 candle"
);

const r5 = openingRange(bars, 5, NOW)!;
assert.equal(r5.bars, 3, "5-minute window covers 09:15, 09:16, 09:17");
assert.equal(r5.high, 23900, "widened by the 09:17 candle");
assert.equal(r5.low, 23400);

const r15 = openingRange(bars, 15, NOW)!;
assert.equal(r15.bars, 4, "15-minute window takes them all");

// yesterday's padded candles must never form today's range
const stale = bars.map((b) => ({ ...b, time: b.time - 86400 }));
assert.equal(openingRange(stale, 15, NOW), null, "yesterday's bars are ignored");
assert.equal(openingRange([], 15, NOW), null, "no bars, no range");

// pre-open: nothing recorded yet
const preOpen: Bar[] = [bar(-30, 23800, 23300)]; // 08:45, before the session
assert.equal(openingRange(preOpen, 15, NOW), null, "bars before 09:15 don't count");

// ── trigger direction ────────────────────────────────────────────────
assert.equal(breakoutSide(23701, r1), "CE", "above the high buys a call");
assert.equal(breakoutSide(23599, r1), "PE", "below the low buys a put");
assert.equal(breakoutSide(23650, r1), null, "inside the range does nothing");
assert.equal(breakoutSide(r1.high, r1), null, "touching the high is not a break");
assert.equal(breakoutSide(r1.low, r1), null, "touching the low is not a break");

// ── the window has to have elapsed ───────────────────────────────────
assert.ok(!rangeReady(15, SESSION_OPEN_MIN + 14), "ORB isn't ready at 09:29");
assert.ok(rangeReady(15, SESSION_OPEN_MIN + 15), "ORB is ready at 09:30");
assert.ok(rangeReady(1, SESSION_OPEN_MIN + 1), "9:16 breakout is ready at 09:16");
assert.ok(!rangeReady(1, SESSION_OPEN_MIN), "not at 09:15 itself");

console.log(
  "breakout ok — 1m %d-%d, 5m %d-%d, 15m %d-%d",
  r1.low,
  r1.high,
  r5.low,
  r5.high,
  r15.low,
  r15.high
);
