"use client";
import Link from "next/link";
import { Wifi, WifiOff } from "lucide-react";
import { GithubMark } from "@/components/github-mark";
import type { FeedStatus } from "@/lib/market";
import { useMarketStatus } from "@/lib/use-market-status";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const LINKS: { heading: string; items: { label: string; href: string }[] }[] = [
  {
    heading: "Trade",
    items: [
      { label: "Dashboard", href: "/trade" },
      { label: "Option chain", href: "/trade/chain" },
      { label: "Charts", href: "/trade/charts" },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "Positions & orders", href: "/trade/positions" },
      { label: "Portfolio", href: "/trade/portfolio" },
      { label: "Settings", href: "/trade/settings" },
    ],
  },
  {
    heading: "Open source",
    items: [
      { label: "Source code", href: SITE.repo },
      { label: "Report an issue", href: `${SITE.repo}/issues` },
      { label: "Upstox API", href: "https://upstox.com/developer/api-documentation/" },
      { label: "Groww Trade API", href: "https://groww.in/trade-api" },
      { label: "Option basics", href: "https://zerodha.com/varsity/module/option-theory/" },
    ],
  },
];

/** `feed` is passed inside the app only — the landing page has no feed to report on. */
export function Footer({ feed }: { feed?: FeedStatus }) {
  const session = useMarketStatus();

  return (
    // no outer margin here — the parent decides the gap, so the footer can sit
    // flush under a dark section without a strip of page background showing through
    <footer className="bg-ink-dark text-canvas-soft">
      <div className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* brand + status */}
          <div>
            <div className="text-xl font-black text-canvas-soft">
              Paper<span className="text-primary">strike</span>
            </div>
            <p className="mt-2 max-w-xs text-sm text-canvas-soft/60">
              Real market data from your own broker. Virtual money. Learn to
              trade options without risking a rupee.
            </p>

            {/* author card */}
            <a
              href={SITE.author.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex max-w-xs items-center gap-3 rounded-2xl border border-canvas-soft/10 bg-canvas-soft/5 p-3 transition-colors hover:border-primary/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- remote avatar, no optimisation needed */}
              <img
                src={`${SITE.author.url}.png?size=80`}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-full bg-canvas-soft/10"
              />
              <div className="min-w-0">
                <div className="text-sm font-bold text-canvas-soft">Built by {SITE.author.name}</div>
                <div className="flex items-center gap-1 text-xs text-canvas-soft/60">
                  <GithubMark className="h-3 w-3" />@{SITE.author.handle}
                </div>
              </div>
            </a>

            <div className="mt-4 flex min-h-6 flex-wrap items-center gap-2">
              {feed && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    feed === "live"
                      ? "bg-primary/15 text-primary"
                      : "bg-warning/20 text-warning"
                  )}
                >
                  {feed === "live" ? (
                    <Wifi className="h-3 w-3" />
                  ) : (
                    <WifiOff className="h-3 w-3" />
                  )}
                  {feed === "live"
                    ? "Live feed"
                    : feed === "connecting"
                      ? "Connecting…"
                      : "No market data"}
                </span>
              )}
              {session && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    session.open
                      ? "bg-positive/20 text-positive"
                      : "bg-canvas-soft/10 text-canvas-soft/60"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      session.open ? "bg-positive" : "bg-canvas-soft/40"
                    )}
                  />
                  {session.label}
                </span>
              )}
            </div>
          </div>

          {LINKS.map((col) => (
            <div key={col.heading}>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-canvas-soft/50">
                {col.heading}
              </div>
              <ul className="flex flex-col gap-2">
                {col.items.map((l) => {
                  const external = l.href.startsWith("http");
                  return (
                    <li key={l.href}>
                      {external ? (
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-canvas-soft/70 transition-colors hover:text-primary"
                        >
                          {l.label} ↗
                        </a>
                      ) : (
                        <Link
                          href={l.href}
                          className="text-sm text-canvas-soft/70 transition-colors hover:text-primary"
                        >
                          {l.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* risk disclosure — the part that makes it read as a real broker site */}
        <div className="mt-10 rounded-2xl border border-canvas-soft/10 bg-canvas-soft/5 p-4">
          <p className="text-xs leading-relaxed text-canvas-soft/50">
            <span className="font-bold text-canvas-soft/70">
              Simulated trading only.
            </span>{" "}
            Paperstrike is a practice tool. No order is ever routed to an
            exchange, no real funds are held or transferred, and no brokerage
            service is provided. Market data comes from your own broker account
            (Upstox or Groww) under that broker&apos;s API terms, for personal use,
            and may be delayed or incomplete. Nothing here is investment
            advice or a recommendation to buy or sell any security. Simulated
            results do not reflect real trading conditions — slippage, liquidity,
            partial fills, brokerage and taxes are not fully modelled, so live
            performance will differ. Derivatives carry substantial risk of loss.
          </p>
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-canvas-soft/10 pt-6 sm:flex-row">
          {/* the year is baked in at build time; the client may be in a later one */}
          <span className="text-xs text-canvas-soft/50" suppressHydrationWarning>
            © {new Date().getFullYear()} {SITE.name} · Open source under {SITE.license}
          </span>
          <div className="flex items-center gap-4 text-xs text-canvas-soft/50">
            <span>Not a broker · Not investment advice</span>
            <a
              href={SITE.repo}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-canvas-soft/10 px-3 py-1 font-semibold text-canvas-soft/80 transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              <GithubMark className="h-3.5 w-3.5" />
              Star on GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
