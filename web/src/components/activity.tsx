"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NoData } from "@/components/no-data";
import { useSlowMarket } from "@/lib/market";
import { flatten, metrics, topBy, type Hot } from "@/lib/activity";
import { compact, inr, pct, plClass, px } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "traded", label: "Most traded", pick: (h: Hot) => h.turnover },
  { id: "gainers", label: "Top gainers", pick: (h: Hot) => h.changePct },
  { id: "losers", label: "Top losers", pick: (h: Hot) => -h.changePct },
  { id: "buildup", label: "OI buildup", pick: (h: Hot) => h.q.changeOi },
] as const;

export function MostTraded({ limit = 5 }: { limit?: number }) {
  const snap = useSlowMarket();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("traded");

  const rows = useMemo(() => {
    if (!snap?.rows.length) return [];
    const hot = flatten(snap).filter((h) => h.q.volume > 0);
    const t = TABS.find((x) => x.id === tab)!;
    return topBy(hot, t.pick, limit);
  }, [snap, tab, limit]);

  return (
    <Card className="rounded-3xl">
      <CardContent className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-bold">Market activity</h2>
          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(v) => v && setTab(v as typeof tab)}
            className="ml-auto rounded-full bg-secondary p-0.5"
          >
            {TABS.map((t) => (
              <ToggleGroupItem
                key={t.id}
                value={t.id}
                className="rounded-full px-2.5 text-[11px] font-semibold text-mute data-[state=on]:bg-card data-[state=on]:shadow-sm"
              >
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {!snap ? (
          <NoData what="Market activity" className="bg-transparent py-8 ring-0" />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-mute">
            No trading activity yet — volumes build up once the market opens.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((h, i) => (
              <Link
                key={h.key}
                href="/trade/chain"
                className="flex items-center gap-3 py-2.5 transition-colors hover:bg-secondary/40"
              >
                <span className="w-4 text-xs font-bold text-mute">{i + 1}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    h.side === "CE"
                      ? "bg-accent text-positive-deep"
                      : "bg-negative/10 text-negative-deep"
                  )}
                >
                  {h.side}
                </span>
                <span className="font-mono text-sm font-semibold">{h.strike}</span>

                <div className="ml-auto flex items-center gap-4 text-right">
                  <div className="hidden sm:block">
                    <div className="text-[10px] font-semibold text-mute">Turnover</div>
                    <div className="font-mono text-xs">
                      ₹{compact(h.turnover)}
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <div className="text-[10px] font-semibold text-mute">OI chg</div>
                    <div className={cn("font-mono text-xs", plClass(h.q.changeOi))}>
                      {compact(h.q.changeOi)}
                    </div>
                  </div>
                  <div className="w-20">
                    <span className="block font-mono text-sm font-bold tabular-nums">
                      {px(h.q.ltp)}
                    </span>
                    <span className={cn("text-xs font-semibold", plClass(h.changePct))}>
                      {pct(h.changePct)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Compact chain-wide sentiment metrics. */
export function ChainPulse() {
  const snap = useSlowMarket();
  const m = useMemo(() => (snap?.rows.length ? metrics(snap) : null), [snap]);
  if (!m) return <NoData what="Chain pulse" />;

  const callShare = m.callVolume + m.putVolume
    ? (m.callVolume / (m.callVolume + m.putVolume)) * 100
    : 50;

  return (
    <Card className="rounded-3xl">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold">Chain pulse</h2>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              m.bias === "Bullish"
                ? "bg-accent text-positive-deep"
                : m.bias === "Bearish"
                  ? "bg-negative/10 text-negative-deep"
                  : "bg-secondary text-body"
            )}
          >
            {m.bias}
          </span>
          <span className="text-xs text-mute">{m.biasWhy}</span>
        </div>

        {/* call vs put volume split */}
        <div>
          <div className="mb-1 flex justify-between text-[11px] font-semibold">
            <span className="text-negative-deep">
              Calls {compact(m.callVolume)}
            </span>
            <span className="text-mute">Volume split</span>
            <span className="text-positive-deep">Puts {compact(m.putVolume)}</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="bg-negative/60 transition-[width] duration-500"
              style={{ width: `${callShare}%` }}
            />
            <div
              className="bg-positive/60 transition-[width] duration-500"
              style={{ width: `${100 - callShare}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="PCR (OI)"
            v={m.pcrOi.toFixed(2)}
            tone={m.pcrOi > 1 ? "up" : "down"}
            hint={m.pcrOi > 1 ? "Put-heavy" : "Call-heavy"}
          />
          <Metric label="PCR (volume)" v={m.pcrVolume.toFixed(2)} hint="Today's flow" />
          <Metric label="ATM IV" v={`${m.atmIv.toFixed(1)}%`} hint="Implied vol" />
          <Metric
            label="IV skew"
            v={`${m.ivSkew > 0 ? "+" : ""}${m.ivSkew.toFixed(2)}`}
            tone={m.ivSkew > 0 ? "down" : "up"}
            hint={m.ivSkew > 0 ? "Puts bid up" : "Calls bid up"}
          />
          <Metric label="Max pain" v={String(m.maxPain)} hint="Writer sweet spot" />
          <Metric
            label="Call OI chg"
            v={compact(m.callOiChange)}
            tone={m.callOiChange > 0 ? "down" : "up"}
            hint={m.callOiChange > 0 ? "Resistance building" : "Unwinding"}
          />
          <Metric
            label="Put OI chg"
            v={compact(m.putOiChange)}
            tone={m.putOiChange > 0 ? "up" : "down"}
            hint={m.putOiChange > 0 ? "Support building" : "Unwinding"}
          />
          <Metric label="Turnover" v={inr(m.totalTurnover)} hint="Chain notional" />
        </div>
      </CardContent>
    </Card>
  );
}

const METRIC_HELP: Record<string, string> = {
  "PCR (OI)":
    "Put/call open-interest ratio. Above 1 means more puts written — usually read as bullish support.",
  "PCR (volume)":
    "Put/call ratio of today's traded volume — reflects live flow rather than standing positions.",
  "ATM IV": "Average implied volatility of the at-the-money call and put.",
  "IV skew":
    "ATM put IV minus call IV. Positive means puts are bid up — the market is paying for downside protection.",
  "Max pain":
    "Strike where option writers lose least. Price often gravitates here into expiry.",
  "Call OI chg":
    "Today's change in call open interest. Rising call OI builds overhead resistance.",
  "Put OI chg":
    "Today's change in put open interest. Rising put OI builds downside support.",
  Turnover: "Total premium traded across the chain (volume × premium).",
};

function Metric({
  label,
  v,
  hint,
  tone,
}: {
  label: string;
  v: string;
  hint?: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-2xl bg-secondary/60 p-3">
      <Tooltip>
        <TooltipTrigger className="cursor-help text-left text-[10px] font-semibold uppercase tracking-wide text-mute underline decoration-dotted underline-offset-2">
          {label}
        </TooltipTrigger>
        <TooltipContent className="max-w-60">{METRIC_HELP[label]}</TooltipContent>
      </Tooltip>
      <div
        className={cn(
          "font-mono text-base font-bold tabular-nums",
          tone === "up" && "text-positive-deep",
          tone === "down" && "text-negative-deep"
        )}
      >
        {v}
      </div>
      {hint && <div className="text-[10px] text-mute">{hint}</div>}
    </div>
  );
}
