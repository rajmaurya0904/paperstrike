"use client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChainPulse, MostTraded } from "@/components/activity";
import { IndexPicker } from "@/components/index-picker";
import { NoData } from "@/components/no-data";
import { Num, tickBg, useTickDir } from "@/components/num";
import { PanelButton, SidePanel } from "@/components/side-panel";
import { findQuote, useAllMarkets, useMarket } from "@/lib/market";
import { usePaper } from "@/lib/paper";
import { OptionQuote, OptionSide, OrderSide, OrderType } from "@/lib/types";
import { metrics } from "@/lib/activity";
import { breakevenMove, orderCharges } from "@/lib/charges";
import { sellMargin } from "@/lib/margin";
import { marketOpen, marketStatus } from "@/lib/hours";
import { compact, inr, px, plClass } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Sel {
  q: OptionQuote;
  side: OptionSide;
  strike: number;
}

export default function ChainPage() {
  const snap = useMarket();
  const paper = usePaper();
  const [sel, setSel] = useState<Sel | null>(null);
  const [greeks, setGreeks] = useState(false);
  const [span, setSpan] = useState<number>(10); // strikes each side of ATM; 0 = all
  // scalper mode: one-tap market orders straight off the chain, no ticket
  const [scalp, setScalp] = useState(false);
  const [scalpLots, setScalpLots] = useState(1);
  const [scalpSide, setScalpSide] = useState<OrderSide>("BUY");

  const m = useMemo(() => (snap?.rows.length ? metrics(snap) : null), [snap]);

  if (!snap?.rows.length) return <NoData what="The option chain" />;

  // click a strike: fire instantly in scalp mode, else open the ticket
  const pick = (q: OptionQuote, side: OptionSide, strike: number) =>
    scalp
      ? paper.placeOrder({
          instrumentKey: q.instrumentKey,
          label: `${snap.id} ${strike} ${side}`,
          side: scalpSide,
          type: "MARKET",
          lots: scalpLots,
        })
      : setSel({ q, side, strike });

  const atm = snap.rows.reduce((a, b) =>
    Math.abs(a.strike - snap.spot) < Math.abs(b.strike - snap.spot) ? a : b
  ).strike;
  const atmIdx = snap.rows.findIndex((r) => r.strike === atm);
  const rows =
    span > 0 ? snap.rows.slice(Math.max(0, atmIdx - span), atmIdx + span + 1) : snap.rows;
  const maxOi = Math.max(...rows.flatMap((r) => [r.ce.oi, r.pe.oi]), 1);

  return (
    <div className="flex flex-col gap-4">
      {/* strip: spot / expiry / PCR / max pain */}
      <div className="flex flex-wrap items-center gap-2">
        <IndexPicker />
        <Chip label="Spot">
          <Num value={snap.spot} format={px} flash className="font-mono font-bold tabular-nums" />
        </Chip>
        <Chip label="Expiry">{snap.expiry}</Chip>
        <Chip label="PCR">
          <span
            className={cn(
              "font-bold",
              (m?.pcrOi ?? 0) > 1 ? "text-positive-deep" : "text-negative-deep"
            )}
          >
            {(m?.pcrOi ?? 0).toFixed(2)}
          </span>
        </Chip>
        <Chip label="Max pain">{m?.maxPain ?? "—"}</Chip>
        <div className="ml-auto flex items-center gap-3">
          <ToggleGroup
            type="single"
            value={String(span)}
            onValueChange={(v) => v && setSpan(+v)}
            aria-label="Strikes shown"
            className="rounded-full bg-secondary p-0.5"
          >
            {([10, 20, 0] as const).map((w) => (
              <ToggleGroupItem
                key={w}
                value={String(w)}
                className="rounded-full px-2.5 text-xs font-semibold data-[state=on]:bg-card data-[state=on]:shadow-sm"
              >
                {w === 0 ? "All" : `±${w}`}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
            Greeks
            <Switch checked={greeks} onCheckedChange={setGreeks} />
          </Label>
          <div className="flex items-center gap-2">
            <Label
              className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold"
              title="One-tap trading — click a strike to fire a market order instantly, no ticket"
            >
              ⚡ Scalp
              <Switch checked={scalp} onCheckedChange={setScalp} />
            </Label>
            {scalp && (
              <>
                <ToggleGroup
                  type="single"
                  value={scalpSide}
                  onValueChange={(v) => v && setScalpSide(v as OrderSide)}
                  aria-label="One-tap side"
                  className="rounded-full bg-secondary p-0.5"
                >
                  {(["BUY", "SELL"] as const).map((s) => (
                    <ToggleGroupItem
                      key={s}
                      value={s}
                      className={cn(
                        "rounded-full px-2 text-[11px] font-bold",
                        s === "BUY"
                          ? "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                          : "data-[state=on]:bg-negative data-[state=on]:text-on-negative"
                      )}
                    >
                      {s}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <div className="flex items-center gap-2 rounded-full bg-secondary px-2 py-1">
                  <button
                    aria-label="One lot fewer"
                    onClick={() => setScalpLots((l) => Math.max(1, l - 1))}
                    className="rounded-full px-1 font-bold leading-none"
                  >
                    −
                  </button>
                  <span className="w-4 text-center font-mono text-xs font-bold" aria-live="polite">
                    {scalpLots}
                  </span>
                  <button
                    aria-label="One lot more"
                    onClick={() => setScalpLots((l) => Math.min(100, l + 1))}
                    className="rounded-full px-1 font-bold leading-none"
                  >
                    +
                  </button>
                  <span className="text-[10px] font-semibold text-mute">lot</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* the chain */}
      <div className="max-h-[70vh] overflow-auto rounded-3xl bg-card ring-1 ring-border">
        <table className="w-full min-w-[760px] text-right text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-secondary text-[10px] font-semibold uppercase tracking-wide text-body">
            <tr>
              <th colSpan={greeks ? 5 : 4} className="border-b border-border px-3 pt-2 text-center">
                Calls
              </th>
              <th className="border-b border-border" />
              <th colSpan={greeks ? 5 : 4} className="border-b border-border px-3 pt-2 text-center">
                Puts
              </th>
            </tr>
            <tr>
              <Th>OI</Th>
              <Th>Chg OI</Th>
              <Th>IV</Th>
              {greeks && <Th>Delta</Th>}
              <Th>LTP</Th>
              <th className="px-3 py-2 text-center">Strike</th>
              <Th>LTP</Th>
              {greeks && <Th>Delta</Th>}
              <Th>IV</Th>
              <Th>Chg OI</Th>
              <Th>OI</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ceItm = r.strike < snap.spot;
              const peItm = r.strike > snap.spot;
              return (
                <tr
                  key={r.strike}
                  className={cn(
                    "group border-t border-border/60 transition-colors hover:bg-secondary/40",
                    r.strike === atm && "bg-accent/60"
                  )}
                >
                  <SideCells q={r.ce} itm={ceItm} greeks={greeks} maxOi={maxOi} kind="CE" scalp={scalp} onPick={() => pick(r.ce, "CE", r.strike)} />
                  <td className="border-x border-border/60 px-3 py-1.5 text-center font-mono text-[13px] font-bold">
                    {r.strike}
                    {r.strike === atm && (
                      <span className="ml-1 rounded-full bg-primary px-1.5 text-[9px] font-bold text-primary-foreground">
                        ATM
                      </span>
                    )}
                  </td>
                  <SideCells q={r.pe} itm={peItm} greeks={greeks} maxOi={maxOi} kind="PE" scalp={scalp} reverse onPick={() => pick(r.pe, "PE", r.strike)} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-center text-[11px] text-mute">
        {scalp ? (
          <span className="font-semibold text-warning-content">
            ⚡ Scalp on — a click instantly {scalpSide === "BUY" ? "buys" : "sells"} {scalpLots} lot at market, no ticket
          </span>
        ) : (
          "Shaded cells are in-the-money · OI bars scale to the largest strike · Click an LTP to trade"
        )}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChainPulse />
        <MostTraded />
      </div>

      {sel && <Ticket sel={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

const HEADER_HELP: Record<string, string> = {
  OI: "Open interest — total live contracts at this strike",
  "Chg OI": "Change in open interest today. Rising OI = fresh positions",
  IV: "Implied volatility (%) priced into this option",
  Delta: "Premium change per 1-point move in the index",
  LTP: "Last traded premium — click to trade",
};

const Th = ({ children }: { children: string }) => (
  <th className="px-3 py-2">
    <Tooltip>
      <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">
        {children}
      </TooltipTrigger>
      <TooltipContent>{HEADER_HELP[children]}</TooltipContent>
    </Tooltip>
  </th>
);

function Chip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm ring-1 ring-border">
      <span className="text-xs font-semibold text-mute">{label}</span>
      {children}
    </div>
  );
}

function SideCells({
  q,
  itm,
  greeks,
  maxOi,
  kind,
  reverse = false,
  scalp = false,
  onPick,
}: {
  q: OptionQuote;
  itm: boolean;
  greeks: boolean;
  maxOi: number;
  kind: "CE" | "PE";
  reverse?: boolean;
  scalp?: boolean;
  onPick: () => void;
}) {
  const dir = useTickDir(q.ltp); // green/red tape flash when this strike prints
  const barW = Math.round((q.oi / maxOi) * 100);
  // broker convention: call OI bars red (resistance), put OI bars green (support)
  const barColor = kind === "CE" ? "bg-negative/15" : "bg-positive/15";
  const barSide = reverse ? "left-0" : "right-0"; // bars grow toward the strike column
  const cells = [
    <td key="oi" className={cn("relative px-3 py-1.5 font-mono text-[13px]", itm && "bg-secondary/50")}>
      <span
        className={cn("absolute inset-y-0.5 rounded-sm transition-[width] duration-500", barColor, barSide)}
        style={{ width: `${barW}%` }}
      />
      <span className="relative">{compact(q.oi)}</span>
    </td>,
    <td key="doi" className={cn("px-3 py-1.5 font-mono text-[13px]", itm && "bg-secondary/50", plClass(q.changeOi))}>
      {compact(q.changeOi)}
    </td>,
    <td key="iv" className={cn("px-3 py-1.5 font-mono text-[13px] text-body", itm && "bg-secondary/50")}>
      {q.iv.toFixed(1)}
    </td>,
    ...(greeks
      ? [
          <td key="d" className={cn("px-3 py-1.5 font-mono text-[13px] text-body", itm && "bg-secondary/50")}>
            {q.delta.toFixed(2)}
          </td>,
        ]
      : []),
    <td key="ltp" className={cn("p-0", itm && "bg-secondary/50")}>
      <button
        onClick={onPick}
        className={cn(
          "w-full px-3 py-1.5 text-right font-mono text-[13px] font-semibold transition-colors duration-300 hover:bg-primary/40",
          scalp && "hover:bg-warning/40",
          tickBg(dir)
        )}
        title={scalp ? `One-tap trade ${kind}` : `Trade ${kind}`}
        aria-label={`${scalp ? "One-tap trade" : "Trade"} ${kind} at ${px(q.ltp)}`}
      >
        <span className="tabular-nums">
          {scalp && <span className="mr-0.5 text-warning-content">⚡</span>}
          {px(q.ltp)}
        </span>
      </button>
    </td>,
  ];
  return <>{reverse ? cells.reverse() : cells}</>;
}

/* ── order ticket slide-in ───────────────────────────────────────── */

function Ticket({ sel, onClose }: { sel: Sel; onClose: () => void }) {
  const paper = usePaper();
  const all = useAllMarkets();
  const snap = useMarket();
  // sel.q is the quote as it was when the row was clicked; keep following the feed
  const q = findQuote(all, sel.q.instrumentKey) ?? sel.q;
  const [side, setSide] = useState<OrderSide>("BUY");
  const [type, setType] = useState<OrderType>("MARKET");
  const [lots, setLots] = useState(1);
  const [limit, setLimit] = useState(sel.q.ltp.toFixed(2));
  const [bracket, setBracket] = useState(false);
  const [showCharges, setShowCharges] = useState(false);
  const [sl, setSl] = useState("");
  const [target, setTarget] = useState("");
  const [trail, setTrail] = useState("");

  const lot = snap?.lot ?? 0;
  const label = `${snap?.id ?? "NIFTY"} ${sel.strike} ${sel.side}`;
  const qty = lots * lot;
  // a 0 quote means that side of the book is empty, not that the option is free
  const mkt = (side === "BUY" ? q.ask : q.bid) || q.ltp;
  const price = type === "LIMIT" ? +limit || 0 : mkt;
  const open = marketOpen();

  // long: SL below entry, target above — mirrored for shorts
  const long = side === "BUY";
  const slNum = +sl;
  const tgtNum = +target;
  const slValid = !bracket || !sl || (long ? slNum < price : slNum > price);
  const tgtValid = !bracket || !target || (long ? tgtNum > price : tgtNum < price);
  const cost = orderCharges({ instrumentKey: sel.q.instrumentKey, side, qty, price });
  // writing blocks margin on the index notional; buying only costs premium
  const margin = snap && side === "SELL" ? sellMargin(snap.id, snap.spot, qty) : null;
  const shortfall = margin ? margin.total - paper.availableMargin : 0;
  const breakeven = breakevenMove(cost, qty, price);
  const risk = bracket && sl ? Math.abs(price - slNum) * qty : 0;
  const reward = bracket && target ? Math.abs(tgtNum - price) * qty : 0;

  return (
    <SidePanel
      title={label}
      onClose={onClose}
      subtitle={
        <>
          LTP <Num value={q.ltp} format={px} flash className="font-mono font-semibold" />
          <span className="mx-2 text-mute">·</span>
          Bid <span className="font-mono">{px(q.bid || q.ltp)}</span>
          <span className="mx-2 text-mute">·</span>
          Ask <span className="font-mono">{px(q.ask || q.ltp)}</span>
        </>
      }
    >
      {/* buy/sell */}
      <ToggleGroup
        type="single"
        value={side}
        onValueChange={(v) => v && setSide(v as OrderSide)}
        aria-label="Buy or sell"
        className="grid grid-cols-2 gap-2"
      >
        {(["BUY", "SELL"] as const).map((s) => (
          <ToggleGroupItem
            key={s}
            value={s}
            className={cn(
              "h-11 rounded-3xl bg-secondary text-sm font-bold text-body",
              s === "BUY"
                ? "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                : "data-[state=on]:bg-negative data-[state=on]:text-on-negative"
            )}
          >
            {s}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* market/limit */}
      <ToggleGroup
        type="single"
        value={type}
        onValueChange={(v) => v && setType(v as OrderType)}
        aria-label="Order type"
        className="flex gap-2"
      >
        {(["MARKET", "LIMIT"] as const).map((t) => (
          <ToggleGroupItem
            key={t}
            value={t}
            className="rounded-full bg-secondary px-3 text-xs font-semibold text-body data-[state=on]:bg-ink-dark data-[state=on]:text-primary"
          >
            {t}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {type === "LIMIT" && (
        <Label className="flex flex-col items-start gap-1 text-sm font-semibold">
          Limit price
          <Input
            type="number"
            step="0.05"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="font-mono"
          />
        </Label>
      )}

      {/* lots */}
      <div className="flex items-center justify-between rounded-3xl bg-secondary px-4 py-3">
        <span className="text-sm font-semibold">Lots ({lot}/lot)</span>
        <div className="flex items-center gap-3">
          <Stepper label="One lot fewer" onClick={() => setLots((l) => Math.max(1, l - 1))}>−</Stepper>
          <span className="w-8 text-center font-mono text-lg font-bold" aria-live="polite">
            {lots}
          </span>
          <Stepper label="One lot more" onClick={() => setLots((l) => Math.min(100, l + 1))}>+</Stepper>
        </div>
      </div>

      {/* SL / target */}
      <div className="rounded-3xl bg-secondary p-4">
        <Label className="flex cursor-pointer items-center justify-between">
          <span className="text-sm font-semibold">Stop-loss &amp; target</span>
          <Switch checked={bracket} onCheckedChange={setBracket} />
        </Label>
        {bracket && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-xs font-semibold text-mute">
                  Stop-loss {long ? "≤" : "≥"}
                </span>
                <Input
                  type="number"
                  step="0.05"
                  value={sl}
                  onChange={(e) => setSl(e.target.value)}
                  placeholder={(long ? price * 0.8 : price * 1.2).toFixed(2)}
                  className={cn("mt-0.5 font-mono", !slValid && "border-negative")}
                />
              </div>
              <div>
                <span className="text-xs font-semibold text-mute">
                  Target {long ? "≥" : "≤"}
                </span>
                <Input
                  type="number"
                  step="0.05"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={(long ? price * 1.3 : price * 0.7).toFixed(2)}
                  className={cn("mt-0.5 font-mono", !tgtValid && "border-negative")}
                />
              </div>
            </div>
            {/* quick % presets off the fill price */}
            <div className="flex flex-wrap gap-1.5">
              {[10, 20, 30].map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setSl((price * (long ? 1 - p / 100 : 1 + p / 100)).toFixed(2));
                    setTarget((price * (long ? 1 + p / 100 : 1 - p / 100)).toFixed(2));
                  }}
                  className="rounded-full bg-card px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-border hover:bg-accent"
                >
                  ±{p}%
                </button>
              ))}
              {(sl || target || trail) && (
                <button
                  onClick={() => {
                    setSl("");
                    setTarget("");
                    setTrail("");
                  }}
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-mute hover:text-body"
                >
                  Clear
                </button>
              )}
            </div>
            {/* trailing stop: distance in premium points; SL follows price */}
            <div>
              <span className="text-xs font-semibold text-mute">
                Trail by (pts, optional)
              </span>
              <Input
                type="number"
                step="0.05"
                value={trail}
                onChange={(e) => setTrail(e.target.value)}
                placeholder={(price * 0.15).toFixed(2)}
                className="mt-0.5 font-mono"
              />
              {+trail > 0 && (
                <p className="mt-1 text-[11px] text-mute">
                  Stop trails {px(+trail)} behind the {long ? "high" : "low"} — locks profit as it moves your way.
                </p>
              )}
            </div>
            {(risk > 0 || reward > 0) && (
              <div className="flex justify-between text-xs">
                <span className="text-negative-deep">Risk {inr(risk)}</span>
                {risk > 0 && reward > 0 && (
                  <span className="font-semibold">
                    1 : {(reward / risk).toFixed(2)}
                  </span>
                )}
                <span className="text-positive-deep">Reward {inr(reward)}</span>
              </div>
            )}
            {(!slValid || !tgtValid) && (
              <p className="text-xs font-semibold text-loss">
                {!slValid && `Stop-loss must be ${long ? "below" : "above"} ${px(price)}. `}
                {!tgtValid && `Target must be ${long ? "above" : "below"} ${px(price)}.`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* cost + charges */}
      <div className="rounded-3xl bg-accent p-4 text-sm">
        <Row k="Quantity" v={`${qty}`} />
        <Row k={side === "BUY" ? "Premium payable" : "Premium receivable"} v={inr(price * qty)} />
        <button
          onClick={() => setShowCharges((v) => !v)}
          aria-expanded={showCharges}
          className="mt-1 flex w-full items-center justify-between border-t border-foreground/10 pt-1.5 text-left"
        >
          <span className="text-body underline decoration-dotted underline-offset-2">
            Charges &amp; taxes {showCharges ? "▴" : "▾"}
          </span>
          <span className="font-mono font-semibold">{inr(cost.total)}</span>
        </button>
        {showCharges && (
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-body">
            <Row k="Brokerage" v={inr(cost.brokerage)} />
            <Row k="STT (sell side)" v={inr(cost.stt)} />
            <Row k="Exchange txn" v={inr(cost.exchange)} />
            <Row k="SEBI + IPFT" v={inr(cost.sebi + cost.ipft)} />
            <Row k="GST @ 18%" v={inr(cost.gst)} />
            <Row k="Stamp duty (buy side)" v={inr(cost.stampDuty)} />
          </div>
        )}
        <div className="mt-1.5 border-t border-foreground/10 pt-1.5">
          <Row
            k={side === "BUY" ? "Net debit" : "Net credit"}
            v={inr(side === "BUY" ? price * qty + cost.total : price * qty - cost.total)}
          />
          <Row k="Breakeven move" v={`${breakeven.toFixed(2)} pts`} />
        </div>

        {margin && (
          <div className="mt-1.5 border-t border-foreground/10 pt-1.5">
            <div className="flex justify-between py-0.5 font-semibold">
              <span>Margin required</span>
              <span className={cn("font-mono", shortfall > 0 && "text-loss")}>
                {inr(margin.total)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 text-xs text-body">
              <Row k="SPAN" v={inr(margin.span)} />
              <Row k="Exposure" v={inr(margin.exposure)} />
              <Row k="Contract notional" v={inr(margin.notional)} />
              <Row k="Available" v={inr(paper.availableMargin)} />
            </div>
            {shortfall > 0 && (
              <p className="mt-1 text-xs font-semibold text-loss">
                Short by {inr(shortfall)} — reduce lots or square off another leg.
              </p>
            )}
          </div>
        )}
      </div>

      <PanelButton
        onClick={() => {
          paper.placeOrder({
            instrumentKey: sel.q.instrumentKey,
            label,
            side,
            type,
            lots,
            limitPrice: type === "LIMIT" ? +limit : undefined,
            stopLoss: bracket && slNum > 0 ? slNum : undefined,
            target: bracket && tgtNum > 0 ? tgtNum : undefined,
            trail: bracket && +trail > 0 ? +trail : undefined,
          });
        }}
        disabled={
          !open ||
          (type === "LIMIT" && !(+limit > 0)) ||
          !slValid ||
          !tgtValid ||
          shortfall > 0
        }
        className={cn(
          "mt-auto h-12 shrink-0 rounded-3xl text-base font-bold",
          side === "SELL" && "bg-negative text-on-negative hover:bg-negative/85"
        )}
      >
        {!open
          ? `${marketStatus().label} — trading shut`
          : shortfall > 0
            ? "Insufficient margin"
            : `${side} ${lots} lot${lots > 1 ? "s" : ""} · ${inr(price * qty)}`}
      </PanelButton>
      <p className="text-center text-[11px] text-mute">
        {open
          ? type === "MARKET"
            ? "Paper order — fills at the live bid/ask, no real money."
            : "Paper order — fills when the price reaches your limit, no real money."
          : "Orders accepted 09:15–15:30 IST, Mon–Fri."}
      </p>
    </SidePanel>
  );
}

const Stepper = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    aria-label={label}
    className="h-8 w-8 rounded-full bg-card font-bold ring-1 ring-border transition-transform active:scale-90"
  >
    {children}
  </button>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between py-0.5">
    <span className="text-body">{k}</span>
    <span className="font-mono font-semibold">{v}</span>
  </div>
);
