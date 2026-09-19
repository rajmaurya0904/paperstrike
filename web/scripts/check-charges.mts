// Self-check for the charge math. Run: npm run check:charges
// .mts so node treats it as ESM without forcing "type":"module" on the app.
import assert from "node:assert/strict";
import { orderCharges } from "../src/lib/charges.ts";

const NIFTY = "NSE_FO|63937";
const SENSEX = "BSE_FO|835858";
const near = (a: number, b: number, eps = 0.01) =>
  assert.ok(Math.abs(a - b) < eps, `expected ~${b}, got ${a}`);

// 1 Nifty lot (65) bought at 100 → ₹6,500 premium turnover
const buy = orderCharges({ instrumentKey: NIFTY, side: "BUY", qty: 65, price: 100 });
assert.equal(buy.stt, 0, "STT is sell-side only");
near(buy.brokerage, 20);
near(buy.exchange, 6500 * 0.0003553);
near(buy.stampDuty, 6500 * 0.00003);
near(buy.gst, (buy.brokerage + buy.exchange + buy.sebi + buy.ipft) * 0.18);
near(buy.total, 26.53);

// same lot sold at 120 → ₹7,800
const sell = orderCharges({ instrumentKey: NIFTY, side: "SELL", qty: 65, price: 120 });
assert.equal(sell.stampDuty, 0, "stamp duty is buy-side only");
near(sell.stt, 7800 * 0.0015); // 0.15% from 1 Apr 2026
near(sell.total, 38.58);

// GST must never be levied on STT or stamp duty
near(sell.gst, (sell.brokerage + sell.exchange + sell.sebi + sell.ipft) * 0.18);
assert.ok(sell.gst < sell.stt * 10, "GST base must exclude STT");

// round trip on a 20-point gain: gross 1300, charges eat ~65
const gross = (120 - 100) * 65;
near(gross - buy.total - sell.total, 1234.89, 0.02);

// Sensex is BSE: no IPFT, lower exchange rate
const bse = orderCharges({ instrumentKey: SENSEX, side: "BUY", qty: 20, price: 100 });
assert.equal(bse.ipft, 0, "IPFT is NSE only");
assert.ok(buy.ipft > 0 && buy.ipft < 0.001, "NSE IPFT is now token-sized, not ₹50/crore");
assert.ok(
  bse.exchange / bse.turnover < buy.exchange / buy.turnover,
  "BSE exchange rate should be below NSE's"
);

// a tiny order is dominated by flat brokerage, and charges are never negative
const tiny = orderCharges({ instrumentKey: NIFTY, side: "BUY", qty: 65, price: 0.05 });
assert.ok(tiny.total > 20 && tiny.total < 24, `tiny order ${tiny.total}`);
for (const [k, v] of Object.entries(tiny)) assert.ok(v >= 0, `${k} went negative`);

console.log("charges ok — buy %s, sell %s, round trip net %s",
  buy.total.toFixed(2), sell.total.toFixed(2), (gross - buy.total - sell.total).toFixed(2));
