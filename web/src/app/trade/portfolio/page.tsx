"use client";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EquityCurve } from "@/components/equity-curve";
import { Button } from "@/components/ui/button";
import { usePaper } from "@/lib/paper";
import { inr, pct, plClass, signed } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function PortfolioPage() {
  const paper = usePaper();

  const stats = useMemo(() => {
    const closes = paper.trades.filter((t) => t.realized !== 0);
    const wins = closes.filter((t) => t.realized > 0);
    const losses = closes.filter((t) => t.realized < 0);
    const eq = paper.account.equityHistory.map((p) => p.equity);
    let peak = -Infinity;
    let maxDd = 0;
    for (const v of eq) {
      peak = Math.max(peak, v);
      maxDd = Math.max(maxDd, peak - v);
    }
    return {
      charges: paper.trades.reduce((sum, t) => sum + (t.charges ?? 0), 0),
      trades: closes.length,
      winRate: closes.length ? (wins.length / closes.length) * 100 : 0,
      avgWin: wins.length ? wins.reduce((s, t) => s + t.realized, 0) / wins.length : 0,
      avgLoss: losses.length
        ? losses.reduce((s, t) => s + t.realized, 0) / losses.length
        : 0,
      maxDd,
    };
  }, [paper.trades, paper.account.equityHistory]);

  const ret =
    ((paper.equity - paper.account.startingBalance) / paper.account.startingBalance) *
    100;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">Portfolio</h1>
        <div className="flex items-center gap-2">
          {paper.profiles.map((p) => (
            <button
              key={p}
              onClick={() => paper.switchProfile(p)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                p === paper.activeProfile
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-body"
              )}
            >
              {p}
            </button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="rounded-3xl text-xs font-semibold"
            onClick={() => {
              const name = prompt("New profile name?");
              if (!name?.trim()) return;
              const bal = +(prompt("Starting virtual capital (₹)?", "1000000") ?? "");
              if (bal > 0) paper.createProfile(name.trim(), bal);
            }}
          >
            + Profile
          </Button>
        </div>
      </div>

      {/* equity curve */}
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-bold">Equity curve</h2>
            <span className={cn("font-mono text-sm font-bold", plClass(ret))}>
              {pct(ret)} all-time
            </span>
          </div>
          <EquityCurve
            history={paper.account.equityHistory}
            startingBalance={paper.account.startingBalance}
          />
        </CardContent>
      </Card>

      {/* stats grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Closed trades" v={String(stats.trades)} />
        <Stat label="Win rate" v={`${stats.winRate.toFixed(0)}%`} />
        <Stat
          label="Avg win / loss"
          v={`${inr(stats.avgWin)} / ${inr(Math.abs(stats.avgLoss))}`}
        />
        <Stat label="Max drawdown" v={inr(stats.maxDd)} />
        <Stat label="Charges paid" v={inr(stats.charges)} />
      </div>

      <Card className="rounded-3xl bg-secondary">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <div className="font-bold">Reset account</div>
            <p className="text-sm text-body">
              Restore {inr(paper.account.startingBalance)} and wipe positions, orders,
              history.
            </p>
          </div>
          <Button
            variant="destructive"
            className="rounded-3xl font-semibold"
            onClick={() => {
              if (confirm("Reset this paper account? All history will be lost."))
                paper.resetAccount();
            }}
          >
            Reset
          </Button>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-mute">
        {signed(paper.equity - paper.account.startingBalance, inr)} all-time on{" "}
        {paper.account.name}&apos;s account · started{" "}
        {new Date(paper.account.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="p-4">
        <div className="text-xs font-semibold text-mute">{label}</div>
        <div className="font-mono text-lg font-bold tabular-nums">{v}</div>
      </CardContent>
    </Card>
  );
}
