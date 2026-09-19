"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { IndexPicker } from "@/components/index-picker";
import { NoData } from "@/components/no-data";
import { Card, CardContent } from "@/components/ui/card";
import { useMarket } from "@/lib/market";
import { usePaper } from "@/lib/paper";
import { cn } from "@/lib/utils";

const DATA_URL = process.env.NEXT_PUBLIC_DATA_URL ?? "http://localhost:8000";
const INTERVALS = ["1m", "5m", "15m", "1d"] as const;
type Interval = (typeof INTERVALS)[number];
const BUCKET_SEC: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1d": 86400,
};

interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi?: number;
}

// Classic OI-buildup read: price direction × open-interest direction.
const BUILDUP = {
  long: { label: "Long buildup", color: "#2ead4b", hint: "Price ↑ · OI ↑" },
  short: { label: "Short buildup", color: "#d03238", hint: "Price ↓ · OI ↑" },
  covering: { label: "Short covering", color: "#9fe870", hint: "Price ↑ · OI ↓" },
  unwinding: { label: "Long unwinding", color: "#ffc091", hint: "Price ↓ · OI ↓" },
  flat: { label: "—", color: "#c9ccc7", hint: "" },
} as const;
type BuildupKind = keyof typeof BUILDUP;

function classify(dPrice: number, dOi: number): BuildupKind {
  if (dOi === 0 || dPrice === 0) return "flat";
  if (dPrice > 0) return dOi > 0 ? "long" : "covering";
  return dOi > 0 ? "short" : "unwinding";
}

export default function ChartsPage() {
  const snap = useMarket();
  const paper = usePaper();
  const [interval, setInterval] = useState<Interval>("5m");
  const [selKey, setSelKey] = useState("INDEX");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [showOi, setShowOi] = useState(true);
  const indexKey = snap?.key ?? "NSE_INDEX|Nifty 50";

  // instrument choices: index + ATM±2 strikes both sides
  const choices = useMemo(() => {
    const out: { key: string; label: string; anchor: number }[] = [
      { key: "INDEX", label: snap?.label ?? "NIFTY 50", anchor: snap?.spot ?? 24000 },
    ];
    if (snap) {
      const atmIdx = snap.rows.reduce(
        (best, r, i) =>
          Math.abs(r.strike - snap.spot) < Math.abs(snap.rows[best].strike - snap.spot)
            ? i
            : best,
        0
      );
      for (let d = -2; d <= 2; d++) {
        const r = snap.rows[atmIdx + d];
        if (!r) continue;
        out.push(
          { key: r.ce.instrumentKey, label: `${r.strike} CE`, anchor: r.ce.ltp },
          { key: r.pe.instrumentKey, label: `${r.strike} PE`, anchor: r.pe.ltp }
        );
      }
    }
    // options sorted: CEs ascending then PEs — group by side for the pill row
    return [out[0], ...out.slice(1).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))];
  }, [snap]);

  const selected = choices.find((c) => c.key === selKey) ?? choices[0];

  // open position on the charted instrument, if any — its bracket becomes the
  // draggable SL/TGT lines. Index isn't tradeable, so it never has one.
  const pos = paper.positions.find((p) => p.instrumentKey === selected.key) ?? null;
  const onBracket = useCallback(
    (patch: { stopLoss?: number; target?: number }) => {
      if (pos) paper.setBracket(pos.instrumentKey, patch);
    },
    [paper, pos]
  );

  const hasOi = !!candles?.some((c) => (c.oi ?? 0) > 0);

  // buildup state of the most recent completed bar, for the legend readout
  const latestBuildup = useMemo<BuildupKind | null>(() => {
    if (!candles || candles.length < 2 || !hasOi) return null;
    const a = candles[candles.length - 2];
    const b = candles[candles.length - 1];
    return classify(b.close - a.close, (b.oi ?? 0) - (a.oi ?? 0));
  }, [candles, hasOi]);

  // live price for the in-progress candle, straight off the relay stream
  const livePrice = useMemo(() => {
    if (!snap) return null;
    if (selected.key === "INDEX") return snap.spot;
    for (const r of snap.rows) {
      if (r.ce.instrumentKey === selected.key) return r.ce.ltp;
      if (r.pe.instrumentKey === selected.key) return r.pe.ltp;
    }
    return null;
  }, [snap, selected.key]);

  useEffect(() => {
    let dead = false;
    async function load() {
      setCandles(null);
      const key = selected.key === "INDEX" ? indexKey : selected.key;
      try {
        const r = await fetch(
          `${DATA_URL}/candles?key=${encodeURIComponent(key)}&interval=${interval}`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (!r.ok) throw new Error();
        const data: Candle[] = await r.json();
        if (!dead) setCandles(data); // an empty array is a real answer: no candles
      } catch {
        if (!dead) setCandles([]); // no invented bars — the chart says so instead
      }
    }
    load();
    return () => {
      dead = true;
    };
  }, [selKey, interval, selected.key, indexKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-black">Charts</h1>
        <IndexPicker />
        <div className="ml-auto flex items-center rounded-full bg-secondary p-0.5">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                interval === iv ? "bg-card shadow-sm" : "text-mute"
              )}
            >
              {iv.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* instrument pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {choices.map((c) => (
          <button
            key={c.key}
            onClick={() => setSelKey(c.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              c.key === selected.key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-body ring-1 ring-border hover:bg-secondary"
            )}
          >
            {c.label}
          </button>
        ))}
        {hasOi && (
          <button
            onClick={() => setShowOi((v) => !v)}
            className={cn(
              "ml-auto rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              showOi ? "bg-ink-dark text-primary" : "bg-secondary text-body"
            )}
          >
            OI buildup {showOi ? "on" : "off"}
          </button>
        )}
      </div>

      {/* buildup legend — only meaningful on option instruments */}
      {hasOi && showOi && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-card px-4 py-2 ring-1 ring-border">
          {(["long", "short", "covering", "unwinding"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[11px]">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: BUILDUP[k].color }}
              />
              <span className="font-semibold">{BUILDUP[k].label}</span>
              <span className="text-mute">{BUILDUP[k].hint}</span>
            </span>
          ))}
          {latestBuildup && (
            <span className="ml-auto text-[11px] font-bold" style={{ color: BUILDUP[latestBuildup].color }}>
              Now: {BUILDUP[latestBuildup].label}
            </span>
          )}
        </div>
      )}

      {candles?.length ? (
        <Card className="rounded-3xl">
          <CardContent className="p-2 sm:p-4">
            <CandleChart
              candles={candles}
              intraday={interval !== "1d"}
              livePrice={livePrice}
              bucketSec={BUCKET_SEC[interval]}
              showOi={showOi && hasOi}
              entry={pos?.avgPrice ?? null}
              sl={pos?.stopLoss ?? null}
              tp={pos?.target ?? null}
              long={(pos?.qty ?? 0) > 0}
              onBracket={onBracket}
            />
          </CardContent>
        </Card>
      ) : candles === null ? (
        <div className="flex h-[420px] items-center justify-center rounded-3xl bg-card text-sm text-mute ring-1 ring-border">
          Loading candles…
        </div>
      ) : (
        <NoData what="Candles" />
      )}
      <p className="text-center text-[11px] text-mute">
        {selected.label} · {interval.toUpperCase()} ·{" "}
        {showOi && hasOi ? "bars show open interest" : "bars show volume"} · live candle
        updates on every tick · scroll to zoom, drag to pan
        {pos && (pos.stopLoss || pos.target) ? " · drag the SL / TGT line to adjust" : ""}
      </p>
    </div>
  );
}

function CandleChart({
  candles,
  intraday,
  livePrice,
  bucketSec,
  showOi,
  entry,
  sl,
  tp,
  long,
  onBracket,
}: {
  candles: Candle[];
  intraday: boolean;
  livePrice: number | null;
  bucketSec: number;
  showOi: boolean;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  long: boolean;
  onBracket: (patch: { stopLoss?: number; target?: number }) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const liveBar = useRef<Candle | null>(null);
  const lineRefs = useRef<{ entry?: IPriceLine; sl?: IPriceLine; tp?: IPriceLine }>({});
  // drag handlers read the latest bracket via this ref, so they don't need re-binding every tick
  const vals = useRef({ entry, sl, tp, long, onBracket });
  // false whenever the chart is torn down. Touching a series or price line after
  // chart.remove() throws "Object is disposed", so every access checks this first.
  const alive = useRef(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!el.current) return;
    const styles = getComputedStyle(document.documentElement);
    // --border is already an alpha colour that reads on either canvas
    const gridColor = styles.getPropertyValue("--border").trim() || "rgba(14,15,12,0.05)";
    const chart = createChart(el.current, {
      height: 420,
      layout: {
        background: { color: "transparent" },
        textColor: styles.getPropertyValue("--mute").trim() || "#868685",
        fontFamily: "var(--font-geist-mono), monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: intraday,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#2ead4b",
      downColor: "#d03238",
      borderVisible: false,
      wickUpColor: "#2ead4b",
      wickDownColor: "#d03238",
    });
    series.setData(candles);
    seriesRef.current = series;
    liveBar.current = candles[candles.length - 1] ?? null;

    if (showOi) {
      // OI bars tinted by buildup quadrant vs the previous bar
      const oi = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "oi",
        color: BUILDUP.flat.color,
      });
      chart.priceScale("oi").applyOptions({ scaleMargins: { top: 0.72, bottom: 0 } });
      oi.setData(
        candles.map((c, i) => {
          const prev = candles[i - 1];
          const kind = prev
            ? classify(c.close - prev.close, (c.oi ?? 0) - (prev.oi ?? 0))
            : "flat";
          return { time: c.time, value: c.oi ?? 0, color: BUILDUP[kind].color };
        })
      );
    } else if (candles.some((c) => c.volume > 0)) {
      const vol = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
        color: "rgba(134,134,133,0.35)",
      });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(candles.map((c) => ({ time: c.time, value: c.volume })));
    }
    chart.timeScale().fitContent();
    alive.current = true;

    const ro = new ResizeObserver(() => {
      if (el.current) chart.applyOptions({ width: el.current.clientWidth });
    });
    ro.observe(el.current);
    return () => {
      alive.current = false; // before remove(), so nothing else touches the corpse
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // theme is a dep so the chart is rebuilt with the new CSS vars on toggle
  }, [candles, intraday, showOi, resolvedTheme]);

  // fold each incoming tick into the current bar, opening a new one at bucket boundaries
  useEffect(() => {
    const series = seriesRef.current;
    const bar = liveBar.current;
    if (!series || !bar || livePrice == null) return;

    const bucket = (Math.floor(Date.now() / 1000 / bucketSec) * bucketSec) as UTCTimestamp;
    const next: Candle =
      bucket > bar.time
        ? {
            time: bucket,
            open: livePrice,
            high: livePrice,
            low: livePrice,
            close: livePrice,
            volume: 0,
          }
        : {
            ...bar,
            high: Math.max(bar.high, livePrice),
            low: Math.min(bar.low, livePrice),
            close: livePrice,
          };
    liveBar.current = next;
    series.update(next);
  }, [livePrice, bucketSec]);

  // keep drag handlers current, and slide existing lines when the bracket moves
  // (e.g. a trailing stop ratcheting) without tearing the lines down each tick
  useEffect(() => {
    vals.current = { entry, sl, tp, long, onBracket };
    if (!alive.current) return; // chart was torn down; lines below it are dead
    const l = lineRefs.current;
    if (l.entry && entry != null) l.entry.applyOptions({ price: entry });
    if (l.sl && sl != null) l.sl.applyOptions({ price: sl, title: `SL ${sl.toFixed(2)}` });
    if (l.tp && tp != null) l.tp.applyOptions({ price: tp, title: `TGT ${tp.toFixed(2)}` });
  }, [entry, sl, tp, long, onBracket]);

  // draw the bracket lines and make SL / TGT draggable, broker-style. Recreated
  // only when a line appears/disappears or the chart itself rebuilds — not on
  // every price change (that's handled above).
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const host = el.current;
    if (!chart || !series || !host) return;

    const lines = lineRefs.current;
    const mk = (price: number, color: string, title: string, draggable: boolean) =>
      series.createPriceLine({
        price,
        color,
        lineWidth: 2,
        lineStyle: draggable ? 2 : 1, // dashed for SL/TGT, dotted for entry
        axisLabelVisible: true,
        title,
      });
    if (entry != null) lines.entry = mk(entry, "#868685", "ENTRY", false);
    if (sl != null) lines.sl = mk(sl, "#d03238", `SL ${sl.toFixed(2)}`, true);
    if (tp != null) lines.tp = mk(tp, "#2ead4b", `TGT ${tp.toFixed(2)}`, true);

    const yOf = (e: MouseEvent) => e.clientY - host.getBoundingClientRect().top;
    const near = (y: number, price: number | null) => {
      if (price == null || !alive.current) return false;
      const c = series.priceToCoordinate(price);
      return c != null && Math.abs(c - y) <= 6;
    };
    let drag: "sl" | "tp" | null = null;

    // capture phase so we can stop the chart from panning only when grabbing a line
    const down = (e: MouseEvent) => {
      if (!alive.current) return;
      const y = yOf(e);
      drag = near(y, vals.current.sl) ? "sl" : near(y, vals.current.tp) ? "tp" : null;
      if (!drag) return;
      e.preventDefault();
      e.stopPropagation();
      chart.applyOptions({ handleScroll: false, handleScale: false });
    };
    const move = (e: MouseEvent) => {
      if (!alive.current) return;
      if (!drag) {
        const y = yOf(e);
        host.style.cursor =
          near(y, vals.current.sl) || near(y, vals.current.tp) ? "ns-resize" : "default";
        return;
      }
      const price = series.coordinateToPrice(yOf(e));
      if (price == null) return;
      const line = drag === "sl" ? lines.sl : lines.tp;
      line?.applyOptions({ price, title: `${drag === "sl" ? "SL" : "TGT"} ${price.toFixed(2)}` });
    };
    const up = (e: MouseEvent) => {
      if (!drag) return;
      if (!alive.current) {
        drag = null;
        return;
      }
      const price = series.coordinateToPrice(yOf(e));
      const kind = drag;
      drag = null;
      chart.applyOptions({ handleScroll: true, handleScale: true });
      const { entry: en, long: lng } = vals.current;
      if (price == null || price <= 0) return;
      // keep the leg on the right side of entry, or it would exit instantly
      if (en != null) {
        const below = price < en;
        if (kind === "sl" && (lng ? !below : below)) return;
        if (kind === "tp" && (lng ? below : !below)) return;
      }
      vals.current.onBracket(
        kind === "sl" ? { stopLoss: +price.toFixed(2) } : { target: +price.toFixed(2) }
      );
    };

    host.addEventListener("mousedown", down, true);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      host.removeEventListener("mousedown", down, true);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      host.style.cursor = "default";
      // if the chart went first it took the lines with it — removing them then throws
      if (alive.current) {
        if (lines.entry) series.removePriceLine(lines.entry);
        if (lines.sl) series.removePriceLine(lines.sl);
        if (lines.tp) series.removePriceLine(lines.tp);
      }
      lineRefs.current = {};
    };
    // must re-run on every chart rebuild (same triggers as the build effect) or the
    // lines would be left attached to a disposed series; plus line presence changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry != null, sl != null, tp != null, candles, intraday, showOi, resolvedTheme]);

  return <div ref={el} className="w-full" />;
}
