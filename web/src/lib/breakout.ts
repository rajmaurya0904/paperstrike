// Opening-range breakout maths.
//
// 9:16 breakout, 9:20 breakout and ORB are the same strategy with a different
// reference window, so there is one implementation parameterised by minutes:
//   1  → the first 1-minute candle (evaluate from 09:16)
//   5  → 09:15-09:20 (evaluate from 09:20)
//   15 → the classic opening range (evaluate from 09:30)
//
// Pure functions only — the React side lives in autotrade.tsx. Run
// `npm run check:breakout` after changing anything here.

export const SESSION_OPEN_MIN = 9 * 60 + 15; // 09:15 IST
export const SESSION_CLOSE_MIN = 15 * 60 + 30;

export interface Bar {
  time: number; // unix seconds
  high: number;
  low: number;
}

export interface Range {
  high: number;
  low: number;
  bars: number;
}

/** Minute-of-day in IST for a unix timestamp, independent of machine timezone. */
export function istMinutesOf(unixSec: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(unixSec * 1000));
  const get = (t: string) => +(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** IST minute-of-day right now. */
export function istNowMinutes(): number {
  return istMinutesOf(Date.now() / 1000);
}

/** Same calendar day in IST? Guards against yesterday's padded candles. */
export function isSameIstDay(unixSec: number, now = Date.now()): boolean {
  const day = (ms: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ms));
  return day(unixSec * 1000) === day(now);
}

/**
 * High/low of today's bars inside [09:15, 09:15+minutes).
 *
 * Returns null when the window hasn't produced any of today's bars yet — the
 * caller keeps waiting rather than arming against yesterday's range (the
 * /candles endpoint pads with the previous session before the open).
 */
export function openingRange(bars: Bar[], minutes: number, now = Date.now()): Range | null {
  const from = SESSION_OPEN_MIN;
  const to = SESSION_OPEN_MIN + minutes;
  let high = -Infinity;
  let low = Infinity;
  let count = 0;
  for (const b of bars) {
    if (!isSameIstDay(b.time, now)) continue;
    const m = istMinutesOf(b.time);
    if (m < from || m >= to) continue;
    high = Math.max(high, b.high);
    low = Math.min(low, b.low);
    count++;
  }
  return count ? { high, low, bars: count } : null;
}

/** Which option to buy given where spot sits vs the range; null = still inside. */
export function breakoutSide(spot: number, r: Range): "CE" | "PE" | null {
  if (spot > r.high) return "CE";
  if (spot < r.low) return "PE";
  return null;
}

/** The range window is complete once the clock passes 09:15 + minutes. */
export function rangeReady(minutes: number, nowMin = istNowMinutes()): boolean {
  return nowMin >= SESSION_OPEN_MIN + minutes;
}
