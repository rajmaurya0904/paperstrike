"use client";
// Equity curve with a period switch and pointer scrubbing.
//
// Adapted from 21st.dev "Market Snapshot" (ssicevs). Its framer-motion path
// draw and value swap are done with GSAP + a CSS transition here — GSAP is
// already a dependency and framer-motion would be a new one for two effects.
// Its hardcoded green also becomes the positive/negative tokens, so a losing
// account doesn't render in profit colours.
import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { inr, pct, plClass } from "@/lib/format";
import { reducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const PERIODS = [
  { id: "1D", ms: 864e5 },
  { id: "1W", ms: 7 * 864e5 },
  { id: "1M", ms: 30 * 864e5 },
  { id: "3M", ms: 90 * 864e5 },
  { id: "All", ms: Infinity },
] as const;

const W = 800;
const H = 200;
const PAD = 12;
const MAX_POINTS = 90; // beyond this the line is just noise at this width

export function EquityCurve({
  history,
  startingBalance,
}: {
  history: { ts: number; equity: number }[];
  startingBalance: number;
}) {
  const [period, setPeriod] = useState<string>("All");
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const line = useRef<SVGPathElement>(null);

  const data = useMemo(() => {
    const span = PERIODS.find((p) => p.id === period)?.ms ?? Infinity;
    // window off the latest entry, not the wall clock: keeps this pure, and the
    // window stays meaningful when the market has been shut for a while
    const last = history[history.length - 1]?.ts ?? 0;
    let pts = history.filter((p) => p.ts >= last - span);
    // a fresh account has almost no history — an empty chart is worse than a wider one
    if (pts.length < 2) pts = history;
    if (pts.length < 2) pts = [{ ts: last, equity: startingBalance }, ...pts];
    const step = Math.ceil(pts.length / MAX_POINTS);
    return step > 1 ? pts.filter((_, i) => i % step === 0 || i === pts.length - 1) : pts;
  }, [history, period, startingBalance]);

  const values = data.map((p) => p.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const path = data
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.equity).toFixed(1)}`)
    .join(" ");

  const active = hover ?? data.length - 1;
  const value = data[active]?.equity ?? startingBalance;
  const base = values[0];
  const delta = value - base;
  const deltaPct = base ? (delta / base) * 100 : 0;
  const up = delta >= 0;
  const stroke = up ? "var(--positive)" : "var(--negative)";

  // redraw whenever the period changes, not just on mount
  useGSAP(() => {
    const el = line.current;
    if (!el || reducedMotion()) return;
    const len = el.getTotalLength();
    gsap.fromTo(
      el,
      { strokeDasharray: len, strokeDashoffset: len },
      { strokeDashoffset: 0, duration: 0.7, ease: "power2.out" }
    );
  }, [period]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const frac = (e.clientX - box.left) / box.width;
    setHover(
      Math.max(0, Math.min(data.length - 1, Math.round(frac * (data.length - 1))))
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-mute">
            {hover == null ? "Current equity" : new Date(data[active].ts).toLocaleString()}
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-2xl font-black tabular-nums transition-colors duration-200">
              {inr(value)}
            </span>
            <span className={cn("font-mono text-sm font-bold", plClass(delta))}>
              {up ? "+" : ""}
              {inr(delta)} ({pct(deltaPct)})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 rounded-full bg-secondary p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              aria-pressed={p.id === period}
              onClick={() => {
                setPeriod(p.id);
                setHover(null);
              }}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
                p.id === period ? "bg-card shadow-sm" : "text-mute hover:text-body"
              )}
            >
              {p.id}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Equity ${inr(value)} over ${period}`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + f * (H - PAD * 2)}
            y2={PAD + f * (H - PAD * 2)}
            stroke="var(--border)"
            strokeDasharray="2 6"
          />
        ))}
        {/* starting balance — the line that says whether the account is up */}
        {startingBalance >= min && startingBalance <= max && (
          <line
            x1={PAD}
            x2={W - PAD}
            y1={y(startingBalance)}
            y2={y(startingBalance)}
            stroke="var(--mute)"
            strokeDasharray="5 5"
            strokeWidth="1"
          />
        )}
        <path
          ref={line}
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hover != null && (
          <>
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD}
              y2={H - PAD}
              stroke="var(--mute)"
            />
            <circle
              cx={x(active)}
              cy={y(value)}
              r="4"
              fill={stroke}
              stroke="var(--card)"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
    </div>
  );
}
