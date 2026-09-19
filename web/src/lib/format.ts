const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrFmt2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numFmt = new Intl.NumberFormat("en-IN");

export const inr = (v: number) => inrFmt.format(v);
export const inr2 = (v: number) => inrFmt2.format(v);
export const num = (v: number) => numFmt.format(v);

export const px = (v: number) => v.toFixed(2);

export const signed = (v: number, f: (n: number) => string = px) =>
  `${v > 0 ? "+" : ""}${f(v)}`;

export const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

// OI in Indian compact form: 1.2Cr / 34.5L / 8.2K
export function compact(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
}

export const plClass = (v: number) =>
  v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-mute";
