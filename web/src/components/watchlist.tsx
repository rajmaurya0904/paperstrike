"use client";
// Index watchlist with intraday sparklines.
// Layout adapted from 21st.dev "Stats cards with links" (ephraimduncan) — the
// recharts area chart is replaced with a plain SVG path; three sparklines don't
// justify a charting dependency.
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useAllMarkets } from "@/lib/market";
import { Num } from "@/components/num";
import { pct, plClass, px, signed } from "@/lib/format";
import { cn } from "@/lib/utils";

const DATA_URL = process.env.NEXT_PUBLIC_DATA_URL ?? "http://localhost:8000";

const INDICES: { key: string; name: string; symbol: string }[] = [
  { key: "NSE_INDEX|Nifty 50", name: "NIFTY 50", symbol: "NIFTY" },
  { key: "NSE_INDEX|Nifty Bank", name: "Bank Nifty", symbol: "BANKNIFTY" },
  { key: "BSE_INDEX|SENSEX", name: "Sensex", symbol: "SENSEX" },
];

interface Series {
  points: number[];
  last: number;
  open: number;
}

export function Watchlist() {
  const all = useAllMarkets();
  const [series, setSeries] = useState<Record<string, Series>>({});

  useEffect(() => {
    let dead = false;
    const load = async () => {
      const out: Record<string, Series> = {};
      await Promise.all(
        INDICES.map(async (idx) => {
          try {
            const r = await fetch(
              `${DATA_URL}/candles?key=${encodeURIComponent(idx.key)}&interval=1m`,
              { signal: AbortSignal.timeout(6000) }
            );
            if (!r.ok) return;
            const c: { close: number; open: number }[] = await r.json();
            if (!c.length) return;
            // thin to ~60 points — plenty for a sparkline
            const step = Math.max(1, Math.floor(c.length / 60));
            out[idx.key] = {
              points: c.filter((_, i) => i % step === 0).map((x) => x.close),
              last: c[c.length - 1].close,
              open: c[0].open,
            };
          } catch {
            /* index unavailable — card falls back to the live tick only */
          }
        })
      );
      if (!dead) setSeries(out);
    };
    load();
    const t = setInterval(load, 60000); // candles only change once a minute
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {INDICES.map((idx) => {
        const s = series[idx.key];
        // every index streams now; candles are only the sparkline history
        const ix = all?.[idx.symbol];
        const live = ix ? ix.spot : s?.last;
        const base = ix ? ix.prevClose : s?.open;
        if (live == null || base == null)
          return (
            <Card key={idx.key} className="rounded-3xl">
              <CardContent className="flex h-28 flex-col justify-center p-4">
                <div className="text-sm font-semibold">{idx.name}</div>
                <div className="text-xs text-mute">No data available</div>
              </CardContent>
            </Card>
          );

        const chg = live - base;
        const chgPct = base ? (chg / base) * 100 : 0;
        return (
          <Card key={idx.key} className="overflow-hidden rounded-3xl">
            <CardContent className="p-4 pb-0">
              <div className="text-sm font-semibold">
                {idx.name}{" "}
                <span className="font-normal text-mute">({idx.symbol})</span>
              </div>
              <div className="flex items-baseline justify-between">
                <Num
                  value={live}
                  format={px}
                  flash={!!ix}
                  className="font-mono text-xl font-bold tabular-nums"
                />
                <div className={cn("text-sm font-semibold", plClass(chg))}>
                  {signed(chg)}{" "}
                  <span className="text-xs">({pct(chgPct)})</span>
                </div>
              </div>
              <Sparkline points={s?.points ?? []} up={chg >= 0} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <div className="h-16" />;
  const W = 300;
  const H = 60;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map(
    (v, i) =>
      [
        (i / (points.length - 1)) * W,
        H - 4 - ((v - min) / span) * (H - 8),
      ] as const
  );
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const color = up ? "var(--positive)" : "var(--negative)";
  const id = `spark-${up ? "up" : "dn"}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-16 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
