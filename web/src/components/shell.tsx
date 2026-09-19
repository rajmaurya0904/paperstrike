"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Menu, RotateCcw, Search, Settings, UserRound } from "lucide-react";
import { RESET_ACCOUNT, useConfirm } from "@/components/confirm";
import { Palette } from "@/components/palette";
import { PriceFlow } from "@/components/price-flow";
import { ThemeToggle } from "@/components/theme";
import { Footer } from "@/components/footer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useMarketStatus } from "@/lib/use-market-status";
import { useAllMarkets, useFeedStatus, useIndexPicker, useMarket } from "@/lib/market";
import { usePaper } from "@/lib/paper";
import { Num } from "@/components/num";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/trade", label: "Dashboard" },
  { href: "/trade/chain", label: "Option chain" },
  { href: "/trade/strategies", label: "Strategies" },
  { href: "/trade/charts", label: "Charts" },
  { href: "/trade/positions", label: "Positions" },
  { href: "/trade/portfolio", label: "Portfolio" },
] as const;

/** "RM" for "Raj Maurya", "AS" for "Asha". */
function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const two = words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.trim().slice(0, 2);
  return two.toUpperCase();
}

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function Shell({ children }: { children: React.ReactNode }) {
  const snap = useMarket();
  const all = useAllMarkets();
  const { id: indexId, setId: setIndex } = useIndexPicker();
  const feed = useFeedStatus();
  const paper = usePaper();
  const path = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const session = useMarketStatus();
  const open = session?.open ?? false;
  const [ask, confirmDialog] = useConfirm();
  const shortcut = useSyncExternalStore(
    () => () => {},
    () => (isMac() ? "⌘K" : "Ctrl K"),
    () => "Ctrl K"
  );
  const current = (href: string) => (path === href ? ("page" as const) : undefined);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      {/* glassmorphic nav — translucent surface + saturated blur over scrolling content */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/60 shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset] backdrop-blur-xl backdrop-saturate-150 dark:bg-card/50 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset]">
        {/* row 1 */}
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4">
          {/* mobile nav */}
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Menu">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="px-5 pt-5 text-lg font-black">
                Paper<span className="text-ink-deep">strike</span>
              </SheetTitle>
              <nav className="mt-4 flex flex-col gap-1 px-3">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={current(n.href)}
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors",
                      path === n.href
                        ? "bg-primary text-primary-foreground"
                        : "text-body hover:bg-secondary"
                    )}
                  >
                    {n.label}
                  </Link>
                ))}
                <Link
                  href="/trade/settings"
                  aria-current={current("/trade/settings")}
                  onClick={() => setNavOpen(false)}
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors",
                    path === "/trade/settings"
                      ? "bg-primary text-primary-foreground"
                      : "text-body hover:bg-secondary"
                  )}
                >
                  Settings
                </Link>
              </nav>
            </SheetContent>
          </Sheet>

          <Link href="/" className="text-lg font-black tracking-tight">
            Paper<span className="text-ink-deep">strike</span>
          </Link>

          <button
            onClick={() =>
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", ctrlKey: true })
              )
            }
            className="hidden items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:text-body lg:flex"
          >
            <Search className="h-3.5 w-3.5" />
            Search strikes
            <kbd className="rounded bg-card px-1.5 py-0.5 font-mono text-[10px]">
              {shortcut}
            </kbd>
          </button>

          <nav className="ml-auto hidden items-center gap-0.5 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={current(n.href)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors",
                  path === n.href
                    ? "bg-primary text-primary-foreground"
                    : "text-body hover:bg-secondary"
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto md:ml-1">
            <ThemeToggle />
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/trade/settings"
                aria-label="Settings"
                aria-current={current("/trade/settings")}
                className={cn(
                  "rounded-full p-2 transition-colors",
                  path === "/trade/settings"
                    ? "bg-primary text-primary-foreground"
                    : "text-body hover:bg-secondary"
                )}
              >
                <Settings className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>Settings & broker keys</TooltipContent>
          </Tooltip>

          {/* account menu — not modal, so the reset dialog it opens gets focus cleanly */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Account menu, ${paper.account.name}`}
                className="flex items-center gap-2 rounded-full border-l border-border pl-3 transition-opacity hover:opacity-80"
              >
                <div className="hidden text-right sm:block">
                  <div className="text-[10px] font-semibold uppercase leading-tight text-mute">
                    Equity
                  </div>
                  <Num
                    value={paper.equity}
                    format={inr}
                    className="font-mono text-sm font-bold leading-tight tabular-nums"
                  />
                </div>
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
                    {initialsOf(paper.account.name)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-bold">{paper.account.name}</div>
                <div className="text-xs font-normal text-mute">
                  Started {inr(paper.account.startingBalance)}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {paper.profiles.length > 1 && (
                <>
                  {paper.profiles.map((p) => (
                    <DropdownMenuItem
                      key={p}
                      onClick={() => paper.switchProfile(p)}
                      className={cn(p === paper.activeProfile && "font-bold")}
                    >
                      <UserRound className="h-4 w-4" />
                      {p}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem asChild>
                <Link href="/trade/portfolio">Portfolio & profiles</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/trade/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  if (await ask(RESET_ACCOUNT)) paper.resetAccount();
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Reset account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* row 2: market strip */}
        <div className="border-t border-border/40 bg-secondary/40 backdrop-blur-sm">
          <div className="mx-auto flex h-9 max-w-6xl items-center gap-4 overflow-x-auto px-4 text-[13px]">
            {all ? (
              Object.values(all).map((ix) => (
                <button
                  key={ix.id}
                  onClick={() => setIndex(ix.id)}
                  aria-pressed={ix.id === indexId}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full px-2 py-0.5 transition-colors hover:bg-card",
                    ix.id === indexId && "bg-card shadow-sm"
                  )}
                  title={`Show ${ix.label}`}
                >
                  <span className="font-semibold text-body">{ix.label}</span>
                  <PriceFlow
                    value={ix.spot}
                    diffPct={
                      ix.prevClose ? ((ix.spot - ix.prevClose) / ix.prevClose) * 100 : 0
                    }
                    className="font-bold"
                    pillClassName="text-xs"
                  />
                </button>
              ))
            ) : (
              <span className="h-3 w-28 animate-pulse rounded-full bg-border" />
            )}
            <span className="shrink-0 text-xs text-mute">
              Expiry {snap?.expiry ?? "—"}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "flex cursor-default items-center gap-1.5 text-xs font-semibold",
                      open ? "text-positive-deep" : "text-mute"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        open ? "bg-positive" : "bg-mute"
                      )}
                    />
                    {session?.label ?? "NSE"}
                  </span>
                </TooltipTrigger>
                <TooltipContent>NSE hours 09:15–15:30 IST, Mon–Fri</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "cursor-default rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      feed === "live"
                        ? "bg-accent text-positive-deep"
                        : "bg-warning/30 text-warning-content dark:bg-warning"
                    )}
                  >
                    {feed === "live" ? "Live" : feed === "connecting" ? "…" : "No data"}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {feed === "live"
                    ? "Streaming real ticks from your broker"
                    : feed === "connecting"
                      ? "Connecting to the data service"
                      : "No feed — connect your broker in Settings"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </header>
      <Palette />
      {confirmDialog}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none">
        {children}
      </main>
      <div className="mt-10">
        <Footer feed={feed} />
      </div>
      {feed === "offline" && (
        <Link
          href="/trade/settings"
          className="fixed bottom-3 left-3 z-40 rounded-full bg-warning/90 px-3 py-1 text-xs font-semibold text-warning-content shadow-sm transition-transform hover:scale-105"
        >
          No market data — connect your broker →
        </Link>
      )}
    </div>
  );
}
