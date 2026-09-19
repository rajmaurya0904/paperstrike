"use client";
import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/button";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { GithubMark } from "@/components/github-mark";
import { SITE } from "@/lib/site";
import { ProcessTimeline } from "@/components/process-timeline";
import { ThemeToggle } from "@/components/theme";
import { marketStatus } from "@/lib/hours";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// keyed by the label marketStatus() returns
const CTA_HEADLINE: Record<string, string> = {
  "Market open": "The market is open.",
  "Pre-open": "The market opens at 9:15.",
  Closed: "The market is shut for today.",
  Weekend: "The market is shut for the weekend.",
};

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const session = marketStatus();

  useGSAP(
    () => {
      // hero entrance
      gsap.from("[data-hero] > *", {
        y: 40,
        opacity: 0,
        stagger: 0.12,
        duration: 0.8,
        ease: "power3.out",
      });
      // scroll reveals
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          y: 48,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%" },
        });
      });
      // fake ticker drift in hero card
      const obj = { v: 24812.4 };
      const el = root.current?.querySelector("[data-tick]");
      if (el)
        gsap.to(obj, {
          v: 24884.9,
          duration: 14,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          onUpdate: () => {
            el.textContent = obj.v.toFixed(2);
          },
        });
    },
    { scope: root }
  );

  return (
    <div ref={root} className="flex min-h-screen flex-col bg-background">
      {/* nav — glass, matches the app shell */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/60 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <span className="text-xl font-black tracking-tight">
            Paper<span className="text-ink-deep">strike</span>
          </span>
          <div className="flex items-center gap-2">
            <a
              href={SITE.repo}
              target="_blank"
              rel="noreferrer"
              aria-label="Paperstrike on GitHub"
              className="inline-flex h-9 items-center gap-1.5 rounded-3xl px-3 text-sm font-semibold text-body transition-colors hover:bg-secondary hover:text-foreground"
            >
              <GithubMark className="h-4 w-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <ThemeToggle />
            <Button asChild className="rounded-3xl px-5 font-semibold">
              <Link href="/trade">Open app</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
        <div data-hero className="flex flex-col items-start gap-6">
          <h1 className="text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
            Trade options.
            <br />
            Risk nothing.
          </h1>
          <p className="max-w-md text-lg text-body">
            Real Nifty market data, live option chain, greeks and OI — with virtual
            money you set yourself. Learn the market like a pro, lose nothing but time.
          </p>
          <Button asChild className="h-13 rounded-3xl px-8 text-lg font-bold">
            <Link href="/trade">Start paper trading</Link>
          </Button>
          <span className="text-xs font-semibold text-mute">
            Open source · No sign-up · Runs on your machine
          </span>
        </div>

        {/* hero widget card — the "converter card" moment */}
        <div data-hero className="rounded-3xl border border-foreground/80 bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-bold">NIFTY 50</span>
            {/* these numbers are illustrative, so don't badge them as live —
                the app itself never shows a price it didn't get from the feed */}
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-mute">
              SAMPLE
            </span>
          </div>
          <div data-tick className="font-mono text-4xl font-black tabular-nums">
            24812.40
          </div>
          <div className="mt-1 text-sm font-semibold text-positive">
            +70.55 (+0.29%)
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
            {[
              ["24800 CE", "118.45"],
              ["24800 PE", "96.20"],
              ["PCR", "1.12"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-secondary p-2.5">
                <div className="font-semibold text-mute">{k}</div>
                <div className="font-mono font-bold">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* feature band */}
      <section className="w-full bg-card py-16">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 md:grid-cols-3">
          <FeatureCard
            data-reveal
            cls="bg-secondary"
            title="Real market, fake money"
            body="Spot, option chain, OI, IV and greeks straight from the exchange feed. Fills happen at real prices."
          />
          <FeatureCard
            data-reveal
            cls="bg-accent"
            title="Your capital, your rules"
            body="Start with any virtual amount — ₹1 lakh or ₹5 crore. Reset whenever. Up to 5 local profiles."
          />
          <FeatureCard
            data-reveal
            cls="bg-ink-dark text-primary"
            title="Know your edge"
            body="Equity curve, win rate, drawdown. The stats brokers don't show you, on your own trades."
            dark
          />
        </div>
      </section>

      <ProcessTimeline
        heading={
          <>
            Four steps from
            <br />
            zero to your first trade.
          </>
        }
        intro="No broker, no KYC, no funding. Everything below runs on your machine against the live exchange feed."
        steps={[
          {
            title: "Set your capital",
            body: "Pick a name and a virtual balance — ₹1 lakh or ₹5 crore, your call. Reset it whenever you want, and keep separate profiles for separate ideas.",
          },
          {
            title: "Read the chain",
            body: "Nifty, Bank Nifty and Sensex option chains with open interest, IV, greeks and max pain. Everything updates on the live feed, nothing is invented.",
          },
          {
            title: "Place the trade",
            body: "Market or limit, single leg or a prebuilt strategy. Real brokerage, STT and GST come off the fill, and writing options blocks SPAN plus exposure margin like it would at a broker.",
          },
          {
            title: "Manage and review",
            body: "Attach a stop, a target or a trailing stop — drag them straight on the chart. Then check the equity curve to see what your edge actually was.",
          },
        ]}
      />

      <Faq
        className="bg-card"
        heading="Questions, answered straight."
        items={[
          {
            q: "Is any real money involved?",
            a: "None. No order is ever routed to an exchange, no funds are held or transferred, and there's no brokerage service behind it. It's a practice tool — the only thing you can lose is time.",
          },
          {
            q: "Is the market data real, or simulated?",
            a: "Real. Spot, option chain, open interest, IV and greeks come live from your own Upstox or Groww account. If no broker is connected the app says 'No data available' — it will never invent a price to fill the gap.",
          },
          {
            q: "Do I need an account?",
            a: "Not with us. There's no sign-up and nothing is sent anywhere — Paperstrike runs on your own machine and your keys stay there. You do need your own broker API keys for the market feed: Upstox (Pro plan with API data, log in once a day) or Groww (Trade API plan with live data). Both brokers charge for API market data.",
          },
          {
            q: "Is it really free and open source?",
            a: "Yes — the full source is on GitHub under the AGPL-3.0 licence. Run it on your own machine with one Docker command, read every line that touches your keys, and send a pull request if you want another broker supported.",
          },
          {
            q: "Are the charges and margins realistic?",
            a: "Yes. Brokerage, STT, exchange transaction, SEBI, IPFT, GST and stamp duty are all applied at FY 2026-27 rates, and writing an option blocks SPAN plus exposure margin on the contract notional — roughly ₹1.5-2 lakh a leg, same as a broker would ask.",
          },
          {
            q: "What can I trade?",
            a: "Nifty, Bank Nifty and Sensex index options on the nearest expiry, around 25 strikes either side of ATM. Single legs, prebuilt strategies, or armed intraday breakout plans.",
          },
          {
            q: "Will my results match live trading?",
            a: "Not exactly, and it's worth knowing why. Fills happen at the quoted bid/ask with a small delay, but slippage, thin liquidity and partial fills aren't fully modelled — so a strategy that looks clean here can behave worse with real size.",
          },
        ]}
      />

      {/* closing CTA — headline tracks the real session, same as the footer badge */}
      <section className="w-full bg-ink-dark py-20">
        <div data-reveal className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 text-center">
          <h2 className="text-4xl font-black leading-tight text-primary sm:text-6xl">
            {CTA_HEADLINE[session.label] ?? "The market is shut."}
          </h2>
          <Button asChild className="h-13 rounded-3xl px-8 text-lg font-bold">
            <Link href="/trade">
              {session.open ? "Start now — it's free" : "Explore the app — it's free"}
            </Link>
          </Button>
          {!session.open && (
            // orders really are rejected outside hours, so don't promise otherwise
            <span className="text-sm text-canvas-soft/60">
              Chain, charts and strategies still work — orders resume at 09:15 IST.
            </span>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FeatureCard({
  title,
  body,
  cls,
  dark = false,
  ...rest
}: {
  title: string;
  body: string;
  cls: string;
  dark?: boolean;
} & Record<string, unknown>) {
  return (
    <div {...rest} className={`rounded-3xl p-6 ${cls}`}>
      <h3 className="mb-2 text-xl font-black">{title}</h3>
      <p className={`text-sm ${dark ? "text-canvas-soft/80" : "text-body"}`}>{body}</p>
    </div>
  );
}
