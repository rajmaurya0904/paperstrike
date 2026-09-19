// Self-check for account valuation. Run: npm run check:equity
import assert from "node:assert/strict";
import { markToMarket, unrealizedPnl } from "../src/lib/equity.ts";

const near = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${what}: expected ${b}, got ${a}`);

const start = 1_000_000;
const charges = 26.53;
const long = [{ instrumentKey: "NSE_FO|1", qty: 65, avgPrice: 100 }];
const cashAfterBuy = start - 65 * 100 - charges;

// Buying 1 NIFTY lot at 100 costs the charges, not the ₹6,500 premium — the
// option is still held and worth its price.
near(markToMarket(cashAfterBuy, long, () => 100), start - charges, "long at entry");
near(markToMarket(cashAfterBuy, long, () => 110), start - charges + 650, "long +10");
near(unrealizedPnl(long, () => 110), 650, "long unrealised");

// Writing: the premium arrives as cash but is owed back, so it's a liability.
const short = [{ instrumentKey: "NSE_FO|2", qty: -65, avgPrice: 100 }];
const cashAfterSell = start + 65 * 100 - charges;
near(markToMarket(cashAfterSell, short, () => 100), start - charges, "short at entry");
near(markToMarket(cashAfterSell, short, () => 90), start - charges + 650, "short -10");
near(unrealizedPnl(short, () => 90), 650, "short unrealised");

// No quote, or an untraded 0, holds the position at cost instead of at zero.
near(markToMarket(cashAfterBuy, long, () => undefined), start - charges, "no quote");
near(markToMarket(cashAfterBuy, long, () => 0), start - charges, "zero quote");
near(unrealizedPnl(long, () => 0), 0, "zero quote unrealised");

// Flat account: its value is its cash.
near(markToMarket(start, [], () => 1), start, "flat");

console.log("equity ok — premium paid counts as an asset, premium received as a liability");
