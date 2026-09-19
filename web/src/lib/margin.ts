// Margin blocked for writing (selling) index options.
//
// Buying an option costs the premium and nothing more. Writing one exposes you
// to unlimited loss, so the exchange blocks SPAN + exposure margin against the
// *notional* value of the contract — which is why one Nifty leg costs roughly
// ₹1.5-2 lakh to sell while the premium collected might be ₹8,000.
//
// SPAN is really a portfolio risk-array calculation the exchange publishes
// intraday; percentage-of-notional is the approximation every broker margin
// calculator falls back on, and it lands in the right range. Run
// `npm run check:margin` after changing the rates.
//
// Not modelled: spread/hedge benefit (a bought leg against a sold leg cuts the
// requirement dramatically at a real broker), intraday MIS leverage, margin
// revision as spot moves, and the extra delivery margin on expiry day.

interface Rate {
  span: number;
  exposure: number;
}

// Bank Nifty carries more because it moves more.
const RATES: Record<string, Rate> = {
  NIFTY: { span: 0.085, exposure: 0.025 },
  BANKNIFTY: { span: 0.095, exposure: 0.03 },
  SENSEX: { span: 0.085, exposure: 0.025 },
};
const FALLBACK: Rate = { span: 0.09, exposure: 0.03 };

export interface Margin {
  notional: number;
  span: number;
  exposure: number;
  total: number;
}

export const ZERO_MARGIN: Margin = { notional: 0, span: 0, exposure: 0, total: 0 };

/** Margin to write `qty` units (lots × lot size) with the index at `spot`. */
export function sellMargin(indexId: string, spot: number, qty: number): Margin {
  const r = RATES[indexId] ?? FALLBACK;
  const notional = spot * Math.abs(qty);
  const span = notional * r.span;
  const exposure = notional * r.exposure;
  return { notional, span, exposure, total: span + exposure };
}

/** Cash a buy needs: premium plus charges. Writers post margin instead. */
export function buyCost(qty: number, price: number, charges: number): number {
  return qty * price + charges;
}
