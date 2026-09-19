// Derived chain analytics: which strikes are actually moving, and how the
// whole chain is leaning. All computed off a single snapshot — no history.
import { MarketSnapshot, OptionQuote } from "./types";

export interface Hot {
  key: string;
  label: string;
  side: "CE" | "PE";
  strike: number;
  q: OptionQuote;
  changePct: number;
  turnover: number; // volume × premium — the real "money traded" measure
}

export interface ChainMetrics {
  pcrOi: number;
  pcrVolume: number;
  callVolume: number;
  putVolume: number;
  callOiChange: number;
  putOiChange: number;
  atmIv: number;
  ivSkew: number; // put IV − call IV at ATM: >0 means puts bid up (fear)
  maxPain: number;
  totalTurnover: number;
  bias: "Bullish" | "Bearish" | "Neutral";
  biasWhy: string;
}

export function flatten(snap: MarketSnapshot): Hot[] {
  const out: Hot[] = [];
  for (const r of snap.rows) {
    for (const [side, q] of [
      ["CE", r.ce],
      ["PE", r.pe],
    ] as const) {
      if (!q) continue;
      out.push({
        key: q.instrumentKey,
        label: `${r.strike} ${side}`,
        side,
        strike: r.strike,
        q,
        changePct: q.close > 0 ? ((q.ltp - q.close) / q.close) * 100 : 0,
        turnover: q.volume * q.ltp,
      });
    }
  }
  return out;
}

export function metrics(snap: MarketSnapshot): ChainMetrics {
  const rows = snap.rows;
  let callOi = 0,
    putOi = 0,
    callVolume = 0,
    putVolume = 0,
    callOiChange = 0,
    putOiChange = 0,
    totalTurnover = 0;

  for (const r of rows) {
    callOi += r.ce.oi;
    putOi += r.pe.oi;
    callVolume += r.ce.volume;
    putVolume += r.pe.volume;
    callOiChange += r.ce.changeOi;
    putOiChange += r.pe.changeOi;
    totalTurnover += r.ce.volume * r.ce.ltp + r.pe.volume * r.pe.ltp;
  }

  const atm = rows.reduce((a, b) =>
    Math.abs(a.strike - snap.spot) < Math.abs(b.strike - snap.spot) ? a : b
  );

  // max pain: strike where total option writer payout is smallest
  let maxPain = atm.strike;
  let least = Infinity;
  for (const at of rows) {
    let pain = 0;
    for (const r of rows) {
      pain += Math.max(at.strike - r.strike, 0) * r.ce.oi;
      pain += Math.max(r.strike - at.strike, 0) * r.pe.oi;
    }
    if (pain < least) {
      least = pain;
      maxPain = at.strike;
    }
  }

  const pcrOi = callOi ? putOi / callOi : 0;
  const pcrVolume = callVolume ? putVolume / callVolume : 0;

  // Bias: PCR above 1 = more puts written (support) = bullish, and vice versa.
  // OI-change direction breaks the tie because it reflects today's positioning.
  let bias: ChainMetrics["bias"] = "Neutral";
  let biasWhy = "PCR near 1 — no clear positioning";
  if (pcrOi >= 1.15) {
    bias = "Bullish";
    biasWhy = `PCR ${pcrOi.toFixed(2)} — put writers dominant`;
  } else if (pcrOi <= 0.85) {
    bias = "Bearish";
    biasWhy = `PCR ${pcrOi.toFixed(2)} — call writers dominant`;
  } else if (putOiChange > callOiChange * 1.2) {
    bias = "Bullish";
    biasWhy = "Puts adding OI faster than calls";
  } else if (callOiChange > putOiChange * 1.2) {
    bias = "Bearish";
    biasWhy = "Calls adding OI faster than puts";
  }

  return {
    pcrOi,
    pcrVolume,
    callVolume,
    putVolume,
    callOiChange,
    putOiChange,
    atmIv: (atm.ce.iv + atm.pe.iv) / 2,
    ivSkew: atm.pe.iv - atm.ce.iv,
    maxPain,
    totalTurnover,
    bias,
    biasWhy,
  };
}

export const topBy = (hot: Hot[], pick: (h: Hot) => number, n = 5) =>
  [...hot].sort((a, b) => pick(b) - pick(a)).slice(0, n);
