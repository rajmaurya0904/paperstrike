// Statutory and broker charges on Indian index-option trades.
//
// Rates as of FY 2026-27, for a discount broker on index options (premium
// turnover, not notional). Everything lives in RATES so a rate change is a
// one-line edit. Run `npm run check:charges` after touching any of it.
//
// Two changes landed for this financial year:
//   - Budget 2026 raised options STT from 0.10% to 0.15% on the sell side,
//     effective 1 Apr 2026.
//   - NSE's 27 Feb 2026 circular (effective 1 Mar) cut IPFT to ₹0.01/crore and
//     raised transaction charges to match, leaving the total unchanged:
//     0.03503% + 0.0005% = 0.03553%. Sources that list 0.03503% alongside
//     ₹50/crore IPFT are pre-March 2026.
//
// Not modelled: exercise STT (0.15% of intrinsic value on in-the-money options
// held to expiry — this one can be large), call-and-trade fees, DP charges
// (equity only), and the auto-square-off penalty some brokers levy. Nothing
// here is a quote — real bills differ by broker.

export type Exchange = "NSE" | "BSE";

const RATES = {
  /** Flat per executed order, both legs. The discount-broker standard. */
  brokeragePerOrder: 20,
  /** Securities Transaction Tax — SELL side only, on premium. 0.1% → 0.15% from 1 Apr 2026. */
  stt: 0.0015,
  /** Exchange transaction charges, on premium. */
  exchangeTxn: {
    NSE: 0.0003553, // ₹3,553 per crore — absorbed the old IPFT, 1 Mar 2026
    BSE: 0.000325, // ₹3,250 per crore, Sensex/Bankex options
  } as Record<Exchange, number>,
  /** SEBI turnover fee — ₹10 per crore. */
  sebi: 0.000001,
  /** NSE Investor Protection Fund Trust — cut to ₹0.01 per crore on 1 Mar 2026. */
  ipft: { NSE: 0.000000001, BSE: 0 } as Record<Exchange, number>,
  /** GST on brokerage + exchange + SEBI + IPFT. */
  gst: 0.18,
  /** Stamp duty — BUY side only, ₹300 per crore. */
  stampDuty: 0.00003,
} as const;

export interface Charges {
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  ipft: number;
  gst: number;
  stampDuty: number;
  total: number;
  turnover: number;
}

/** NSE_FO|... / BSE_FO|... — Sensex options are BSE, Nifty and Bank Nifty NSE. */
export function exchangeOf(instrumentKey: string): Exchange {
  return instrumentKey.startsWith("BSE") ? "BSE" : "NSE";
}

export function orderCharges({
  instrumentKey,
  side,
  qty,
  price,
}: {
  instrumentKey: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
}): Charges {
  const ex = exchangeOf(instrumentKey);
  const turnover = qty * price;
  const sell = side === "SELL";

  const brokerage = RATES.brokeragePerOrder;
  const stt = sell ? turnover * RATES.stt : 0;
  const exchange = turnover * RATES.exchangeTxn[ex];
  const sebi = turnover * RATES.sebi;
  const ipft = turnover * RATES.ipft[ex];
  // GST applies to the service components only — never to STT or stamp duty
  const gst = (brokerage + exchange + sebi + ipft) * RATES.gst;
  const stampDuty = sell ? 0 : turnover * RATES.stampDuty;

  const total = brokerage + stt + exchange + sebi + ipft + gst + stampDuty;
  return { brokerage, stt, exchange, sebi, ipft, gst, stampDuty, total, turnover };
}

/**
 * Premium move needed to cover both legs' charges — what a broker's ticket
 * calls "breakeven". Assumes the exit leg costs about what this one does.
 */
export function breakevenMove(c: Charges, qty: number, price: number): number {
  const exitish = orderCharges({
    instrumentKey: "NSE_FO|x",
    side: "SELL",
    qty,
    price,
  });
  return qty ? (c.total + exitish.total) / qty : 0;
}
