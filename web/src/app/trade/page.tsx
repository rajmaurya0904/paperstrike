"use client";
import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChainPulse, MostTraded } from "@/components/activity";
import { Watchlist } from "@/components/watchlist";
import { PriceFlow } from "@/components/price-flow";
import { Num } from "@/components/num";
import { Reveal } from "@/components/reveal";
import { useFeedStatus, useMarket } from "@/lib/market";
import { usePaper } from "@/lib/paper";
import { reducedMotion } from "@/lib/motion";
import { inr, plClass, px, signed } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const snap = useMarket();
  const feed = useFeedStatus();
  const paper = usePaper();
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap.from("[data-anim]", {
        y: 24,
        opacity: 0,
        stagger: 0.07,
        duration: 0.55,
        ease: "power3.out",
      });
    },
    { scope: root }
  );

  const realized = paper.trades.reduce((s, t) => s + t.realized, 0);
  const available = paper.availableMargin;
  const marginPct = paper.account.balance
    ? (paper.usedMargin / paper.account.balance) * 100
    : 0;

  return (
    <div ref={root} className="flex flex-col gap-6">
      {/* hero wallet */}
      <div data-anim className="rounded-3xl bg-ink-dark p-6 sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary/70">
          Portfolio value
        </div>
        <PriceFlow
          value={paper.equity}
          diffPct={
            ((paper.equity - paper.account.startingBalance) /
              paper.account.startingBalance) *
            100
          }
          currency
          className="text-4xl font-black text-primary sm:text-5xl"
        />
        <div className="mt-1 text-sm text-canvas-soft/70">
          {signed(paper.equity - paper.account.startingBalance, inr)} all-time
        </div>
      </div>

      <div data-anim>
        <Watchlist />
      </div>

      {/* margin usage */}
      <Card data-anim className="rounded-3xl">
        <CardContent className="p-5">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-bold">Margin used</span>
            <span className="font-mono text-xs text-mute">
              {inr(paper.usedMargin)} of {inr(paper.account.balance)}
            </span>
          </div>
          <Progress
            value={Math.min(marginPct, 100)}
            className={cn("h-2", marginPct > 80 && "[&>div]:bg-negative")}
          />
          <div className="mt-1 text-xs text-mute">
            {marginPct > 80
              ? "High utilisation — little room for new positions"
              : `${(100 - marginPct).toFixed(0)}% of capital still free`}
          </div>
        </CardContent>
      </Card>

      {/* stat strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available margin" v={available} fmt={inr} />
        <Stat label="Used margin" v={paper.usedMargin} fmt={inr} />
        <Stat
          label="Unrealized P&L"
          v={paper.unrealized}
          fmt={(x) => signed(x, inr)}
          colored
        />
        <Stat label="Realized P&L" v={realized} fmt={(x) => signed(x, inr)} colored />
      </div>

      {/* quick action */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card data-anim className="rounded-3xl md:col-span-2">
          <CardContent className="flex h-full items-center justify-between p-6">
            <div>
              <div className="text-sm font-semibold text-body">
                Current expiry
              </div>
              <div className="font-mono text-2xl font-black">
                {snap?.expiry ?? "—"}
              </div>
            </div>
            <div className="text-right text-xs text-mute">
              <div>{snap?.rows.length ?? 0} strikes streaming</div>
              <div>{feed === "live" ? "Live broker feed" : "No market data"}</div>
            </div>
          </CardContent>
        </Card>
        <Card data-anim className="rounded-3xl bg-accent">
          <CardContent className="flex h-full flex-col justify-between gap-3 p-6">
            <div className="text-sm font-semibold">
              {paper.positions.length
                ? `${paper.positions.length} open position${paper.positions.length > 1 ? "s" : ""}`
                : "No open positions"}
            </div>
            <Button asChild className="rounded-3xl font-semibold">
              <Link href="/trade/chain">Open option chain</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* below the fold, so these reveal on scroll instead of on mount —
          the mount stagger above had already finished before you got here */}
      <Reveal>
        <ChainPulse />
      </Reveal>
      <Reveal index={1}>
        <MostTraded />
      </Reveal>

      {/* recent trades */}
      <Reveal index={2}>
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Recent trades</h2>
            <Link
              href="/trade/positions"
              className="text-sm font-semibold text-ink-deep hover:underline"
            >
              View all
            </Link>
          </div>
          {paper.trades.length === 0 ? (
            <p className="py-6 text-center text-sm text-mute">
              Your trades will appear here. Pick a strike from the option chain to start.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {paper.trades.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <span
                      className={cn(
                        "mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold",
                        t.side === "BUY"
                          ? "bg-accent text-positive-deep"
                          : "bg-negative/10 text-negative-deep"
                      )}
                    >
                      {t.side}
                    </span>
                    <span className="text-sm font-semibold">{t.label}</span>
                    <span className="ml-2 text-xs text-mute">×{t.qty}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm tabular-nums">{px(t.price)}</div>
                    {t.realized !== 0 && (
                      <div className={cn("text-xs font-semibold", plClass(t.realized))}>
                        {signed(t.realized, inr)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </Reveal>
    </div>
  );
}

function Stat({
  label,
  v,
  fmt,
  colored = false,
}: {
  label: string;
  v: number;
  fmt: (n: number) => string;
  colored?: boolean;
}) {
  return (
    <Card data-anim className="rounded-3xl">
      <CardContent className="p-4">
        <div className="text-xs font-semibold text-mute">{label}</div>
        <Num
          value={v}
          format={fmt}
          className={cn(
            "font-mono text-lg font-bold tabular-nums",
            colored && plClass(v)
          )}
        />
      </CardContent>
    </Card>
  );
}
