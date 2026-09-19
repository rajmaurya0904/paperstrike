"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IndexPicker } from "@/components/index-picker";
import { NoData } from "@/components/no-data";
import { Reveal } from "@/components/reveal";
import { PanelButton, SidePanel } from "@/components/side-panel";
import { useMarket } from "@/lib/market";
import { usePaper } from "@/lib/paper";
import { DEFAULT_CUTOFF_MIN, useAutoTrade, type Plan } from "@/lib/autotrade";
import { SESSION_OPEN_MIN, rangeReady } from "@/lib/breakout";
import { orderCharges } from "@/lib/charges";
import { sellMargin } from "@/lib/margin";
import { marketOpen, marketStatus } from "@/lib/hours";
import {
  CATALOG,
  analyse,
  legBracket,
  resolve,
  strikeStep,
  type Strategy,
  type StrategyGroup,
} from "@/lib/strategies";
import { inr, px } from "@/lib/format";
import { cn } from "@/lib/utils";

const GROUPS: { id: StrategyGroup | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "buy", label: "Buying" },
  { id: "sell", label: "Selling" },
  { id: "neutral", label: "Defined risk" },
];

export default function StrategiesPage() {
  const snap = useMarket();
  const [group, setGroup] = useState<StrategyGroup | "all">("all");
  const [open, setOpen] = useState<Strategy | null>(null);

  const list = CATALOG.filter((s) => group === "all" || s.group === group);

  if (!snap) return <NoData what="Strategies" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-black">Strategies</h1>
        <IndexPicker />
        <ToggleGroup
          type="single"
          value={group}
          onValueChange={(v) => v && setGroup(v as StrategyGroup | "all")}
          aria-label="Filter strategies"
          className="ml-auto rounded-full bg-secondary p-0.5"
        >
          {GROUPS.map((g) => (
            <ToggleGroupItem
              key={g.id}
              value={g.id}
              className="rounded-full px-3 text-xs font-semibold data-[state=on]:bg-card data-[state=on]:shadow-sm"
            >
              {g.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s, i) => (
          <Reveal key={s.id} index={i % 3} className="flex">
          <button
            disabled={!!s.unavailable}
            onClick={() => setOpen(s)}
            className={cn(
              "flex w-full flex-col items-start gap-1.5 rounded-3xl bg-card p-4 text-left ring-1 ring-border transition-colors",
              s.unavailable ? "cursor-not-allowed opacity-55" : "hover:bg-secondary"
            )}
          >
            <div className="flex w-full items-start justify-between gap-2">
              <span className="font-bold">{s.name}</span>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-mute">
                {s.outlook}
              </span>
            </div>
            <p className="text-xs text-body">{s.about}</p>
            {s.unavailable ? (
              <p className="mt-1 text-[11px] font-semibold text-warning-content">
                {s.unavailable}
              </p>
            ) : s.breakout ? (
              <span className="mt-1 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold text-warning-content">
                ⏱ Arms and waits · {s.breakout.rangeMinutes}-min range
              </span>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {s.legs.map((l, i) => (
                  <span
                    key={i}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      l.side === "BUY"
                        ? "bg-accent text-positive-deep"
                        : "bg-negative/10 text-negative-deep"
                    )}
                  >
                    {l.side === "BUY" ? "+" : "−"}
                    {l.ratio > 1 ? `${l.ratio}×` : ""}
                    {l.offset === 0 ? "ATM" : l.offset > 0 ? `ATM+${l.offset}` : `ATM${l.offset}`}{" "}
                    {l.opt}
                  </span>
                ))}
              </div>
            )}
          </button>
          </Reveal>
        ))}
      </div>

      <p className="text-center text-[11px] text-mute">
        Legs are placed relative to the ATM strike ({strikeStep(snap)}-point steps) on the{" "}
        {snap.expiry} expiry · greyed-out strategies say why they can&apos;t run here
      </p>

      <ArmedPlans />

      {open &&
        (open.breakout ? (
          <BreakoutBuilder s={open} onClose={() => setOpen(null)} />
        ) : (
          <Builder s={open} onClose={() => setOpen(null)} />
        ))}
    </div>
  );
}

/* ── armed breakout plans ─────────────────────────────────────────── */

const STATUS_STYLE: Record<Plan["status"], string> = {
  waiting: "bg-warning/20 text-warning-content",
  armed: "bg-accent text-positive-deep",
  fired: "bg-primary text-primary-foreground",
  missed: "bg-negative/10 text-negative-deep",
  expired: "bg-secondary text-mute",
  cancelled: "bg-secondary text-mute",
};

const STATUS_TEXT: Record<Plan["status"], string> = {
  waiting: "Waiting for range",
  armed: "Armed",
  fired: "Triggered",
  missed: "Missed",
  expired: "Expired",
  cancelled: "Cancelled",
};

function ArmedPlans() {
  const { plans, cancel, clearDone } = useAutoTrade();
  if (!plans.length) return null;
  const live = plans.filter((p) => p.status === "waiting" || p.status === "armed");

  return (
    <div className="rounded-3xl bg-card p-4 ring-1 ring-border">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Breakout plans</h2>
        {plans.length > live.length && (
          <button onClick={clearDone} className="text-xs font-semibold text-mute hover:text-body">
            Clear finished
          </button>
        )}
      </div>
      <div className="mt-2 divide-y divide-border">
        {plans.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                STATUS_STYLE[p.status]
              )}
            >
              {STATUS_TEXT[p.status]}
            </span>
            <span className="font-semibold">{p.name}</span>
            <span className="text-xs text-mute">
              {p.indexId} · {p.rangeMinutes}m range · {p.lots} lot
              {p.lots > 1 ? "s" : ""}
            </span>
            {p.range && (
              <span className="font-mono text-xs">
                {p.range.low.toFixed(2)} – {p.range.high.toFixed(2)}
              </span>
            )}
            {p.firedSide && (
              <span className="text-xs font-semibold text-positive-deep">
                Bought {p.firedSide}
              </span>
            )}
            {p.note && <span className="text-xs text-mute">{p.note}</span>}
            {(p.status === "waiting" || p.status === "armed") && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto rounded-full text-mute"
                onClick={() => cancel(p.id)}
              >
                Cancel
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── breakout builder ─────────────────────────────────────────────── */

const WINDOWS = [1, 5, 15, 30];

function BreakoutBuilder({ s, onClose }: { s: Strategy; onClose: () => void }) {
  const snap = useMarket();
  const { arm } = useAutoTrade();
  const [minutes, setMinutes] = useState(s.breakout?.rangeMinutes ?? 15);
  const [lots, setLots] = useState(1);
  const [offset, setOffset] = useState(0);
  const [sl, setSl] = useState("30");
  const [tp, setTp] = useState("60");

  if (!snap) return null;
  const ready = rangeReady(minutes);
  const readyAt = `${String(Math.floor((SESSION_OPEN_MIN + minutes) / 60)).padStart(2, "0")}:${String(
    (SESSION_OPEN_MIN + minutes) % 60
  ).padStart(2, "0")}`;

  return (
    <SidePanel title={s.name} subtitle={s.about} onClose={onClose} wide>
      <div className="rounded-3xl bg-secondary p-4 text-sm">
        <p className="font-semibold">How it fires</p>
        <ol className="mt-1 list-decimal pl-4 text-xs text-body">
          <li>Records the {snap.label} high/low from 09:15 to {readyAt}.</li>
          <li>Watches spot until it closes outside that range.</li>
          <li>Above the high → buys a CE. Below the low → buys a PE.</li>
          <li>Fires once, then stops. Expires unfired at 15:00.</li>
        </ol>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold">Reference window</p>
        <ToggleGroup
          type="single"
          value={String(minutes)}
          onValueChange={(v) => v && setMinutes(+v)}
          aria-label="Reference window"
          className="grid grid-cols-4 gap-2"
        >
          {WINDOWS.map((m) => (
            <ToggleGroupItem
              key={m}
              value={String(m)}
              className="h-10 rounded-3xl bg-secondary text-xs font-bold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {m}m
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="mt-1 text-[11px] text-mute">
          Range completes at {readyAt}
          {ready ? " — already available." : " — the plan waits until then."}
        </p>
      </div>

      <Stepper
        label={`Lots (${snap.lot}/lot)`}
        value={lots}
        onChange={(d) => setLots((v) => Math.max(1, Math.min(50, v + d)))}
        render={String}
      />
      <Stepper
        label="Strike from ATM"
        value={offset}
        onChange={(d) => setOffset((v) => Math.max(0, Math.min(10, v + d)))}
        render={(v) => (v === 0 ? "ATM" : `${v} OTM`)}
      />

      <div className="rounded-3xl bg-secondary p-4">
        <p className="text-sm font-semibold">Stop-loss &amp; target</p>
        <p className="mt-0.5 text-[11px] text-mute">
          Percent of the premium paid when it triggers.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-mute">
            Stop-loss %
            <Input
              type="number"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              className="font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-mute">
            Target %
            <Input
              type="number"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              className="font-mono"
            />
          </label>
        </div>
      </div>

      <PanelButton
        onClick={() => {
          arm({
            name: s.name,
            indexId: snap.id,
            rangeMinutes: minutes,
            lots,
            offset,
            slPct: +sl || 0,
            tpPct: +tp || 0,
            cutoffMin: DEFAULT_CUTOFF_MIN,
          });
        }}
        className="mt-auto h-12 shrink-0 rounded-3xl text-base font-bold"
      >
        Arm plan
      </PanelButton>
      <p className="text-center text-[11px] text-mute">
        Keeps watching on any page, and survives a refresh. Cancel it from the
        Breakout plans list.
      </p>
    </SidePanel>
  );
}

/* ── builder ──────────────────────────────────────────────────────── */

function Builder({ s, onClose }: { s: Strategy; onClose: () => void }) {
  const snap = useMarket();
  const paper = usePaper();
  const [lots, setLots] = useState(1);
  const [shift, setShift] = useState(0);
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");

  const legs = useMemo(() => (snap ? resolve(snap, s, lots, shift) : null), [snap, s, lots, shift]);
  const a = useMemo(() => (legs && snap ? analyse(legs, snap.spot) : null), [legs, snap]);

  if (!snap) return null;

  const charges = legs
    ? legs.reduce(
        (n, l) =>
          n +
          orderCharges({
            instrumentKey: l.instrumentKey,
            side: l.side,
            qty: l.qty,
            price: l.price,
          }).total,
        0
      )
    : 0;
  // no spread benefit here, same as the rest of the app's margin model
  const margin = legs
    ? legs.reduce(
        (n, l) => n + (l.side === "SELL" ? sellMargin(snap.id, snap.spot, l.qty).total : 0),
        0
      )
    : 0;
  const debit = a?.netPremium ?? 0;
  const cashNeeded = Math.max(0, debit) + charges;
  // ponytail: legs are placed in one go, so the engine's per-order margin check
  // sees pre-deploy balance for each. Gate on the total here instead.
  const shortfall = margin + cashNeeded - paper.availableMargin;
  const open = marketOpen();
  const blocked = !legs || shortfall > 0 || !open;

  const deploy = () => {
    if (!legs) return;
    for (const l of legs) {
      const b = legBracket(l, +sl || 0, +tp || 0);
      paper.placeOrder({
        instrumentKey: l.instrumentKey,
        label: l.label,
        side: l.side,
        type: "MARKET",
        lots: l.lots,
        stopLoss: b.stopLoss,
        target: b.target,
      });
    }
  };

  return (
    <SidePanel title={s.name} subtitle={s.about} onClose={onClose} wide>
      {!legs ? (
        <p className="rounded-3xl bg-negative/10 p-4 text-sm font-semibold text-negative-deep">
          These strikes fall outside the loaded chain. Re-centre the structure or widen the
          chain window.
        </p>
      ) : (
        <>
          {a && <Payoff a={a} spot={snap.spot} />}

          {/* size + re-centre */}
          <div className="flex flex-col gap-2">
            <Stepper
              label={`Lots (${snap.lot}/lot)`}
              value={lots}
              onChange={(d) => setLots((v) => Math.max(1, Math.min(50, v + d)))}
              render={String}
            />
            <Stepper
              label="Shift strikes"
              value={shift}
              onChange={(d) => setShift((v) => v + d)}
              render={(v) => (v === 0 ? "ATM" : v > 0 ? `+${v}` : String(v))}
            />
          </div>

          {/* legs */}
          <div className="rounded-3xl bg-secondary p-3">
            {legs.map((l, i) => (
              <div key={i} className="flex items-center justify-between py-1 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      l.side === "BUY"
                        ? "bg-accent text-positive-deep"
                        : "bg-negative/10 text-negative-deep"
                    )}
                  >
                    {l.side}
                  </span>
                  <span className="font-semibold">
                    {l.strike} {l.opt}
                  </span>
                  <span className="text-xs text-mute">×{l.lots}</span>
                </span>
                <span className="font-mono text-sm">{px(l.price)}</span>
              </div>
            ))}
          </div>

          {/* per-leg bracket */}
          <div className="rounded-3xl bg-secondary p-4">
            <p className="text-sm font-semibold">Stop-loss &amp; target</p>
            <p className="mt-0.5 text-[11px] text-mute">
              Percent of each leg&apos;s own premium. Leave blank for none.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-mute">
                Stop-loss %
                <Input
                  type="number"
                  value={sl}
                  onChange={(e) => setSl(e.target.value)}
                  placeholder="30"
                  className="font-mono"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-mute">
                Target %
                <Input
                  type="number"
                  value={tp}
                  onChange={(e) => setTp(e.target.value)}
                  placeholder="50"
                  className="font-mono"
                />
              </label>
            </div>
          </div>

          {/* numbers */}
          <div className="rounded-3xl bg-accent p-4 text-sm">
            <Row
              k={debit >= 0 ? "Net debit" : "Net credit"}
              v={inr(Math.abs(debit))}
            />
            <Row k="Charges & taxes" v={inr(charges)} />
            {margin > 0 && <Row k="Margin blocked" v={inr(margin)} />}
            <div className="mt-1.5 border-t border-foreground/10 pt-1.5">
              <Row
                k="Max profit"
                v={a?.maxProfit == null ? "Unlimited" : inr(a.maxProfit)}
              />
              <Row
                k="Max loss"
                v={a?.maxLoss == null ? "Unlimited" : inr(Math.abs(a.maxLoss))}
              />
              <Row
                k="Breakeven"
                v={
                  a?.breakevens.length
                    ? a.breakevens.map((b) => Math.round(b)).join(" · ")
                    : "—"
                }
              />
              <Row k="Available" v={inr(paper.availableMargin)} />
            </div>
            {shortfall > 0 && (
              <p className="mt-1 text-xs font-semibold text-loss">
                Short by {inr(shortfall)} — reduce lots or free up margin.
              </p>
            )}
          </div>

          <PanelButton
            onClick={deploy}
            disabled={blocked}
            className="mt-auto h-12 shrink-0 rounded-3xl text-base font-bold"
          >
            {!open
              ? `${marketStatus().label} — trading shut`
              : shortfall > 0
                ? "Insufficient margin"
                : `Deploy ${legs.length} leg${legs.length > 1 ? "s" : ""}`}
          </PanelButton>
          <p className="text-center text-[11px] text-mute">
            Places every leg as a market order. Manage or exit them from Positions.
          </p>
        </>
      )}
    </SidePanel>
  );
}

/** Expiry payoff curve — inline SVG, no chart library needed for 240 points. */
function Payoff({
  a,
  spot,
}: {
  a: NonNullable<ReturnType<typeof analyse>>;
  spot: number;
}) {
  const W = 320;
  const H = 120;
  const xs = a.curve.map((c) => c.s);
  const ys = a.curve.map((c) => c.pnl);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const px_ = (s: number) => ((s - x0) / (x1 - x0)) * W;
  const py = (v: number) => H - ((v - y0) / (y1 - y0 || 1)) * H;
  const line = a.curve.map((c) => `${px_(c.s).toFixed(1)},${py(c.pnl).toFixed(1)}`).join(" ");

  return (
    <div className="rounded-3xl bg-secondary p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-28 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Payoff at expiry from ${Math.round(x0)} to ${Math.round(x1)}, spot ${Math.round(spot)}`}
      >
        {/* zero line */}
        {y0 < 0 && y1 > 0 && (
          <line
            x1={0}
            x2={W}
            y1={py(0)}
            y2={py(0)}
            stroke="currentColor"
            strokeWidth={1}
            className="text-mute"
            strokeDasharray="3 3"
          />
        )}
        {/* spot marker */}
        <line
          x1={px_(spot)}
          x2={px_(spot)}
          y1={0}
          y2={H}
          stroke="currentColor"
          strokeWidth={1}
          className="text-mute/60"
        />
        {/* split the curve into profit and loss halves so each gets its own colour */}
        <polyline
          points={line}
          fill="none"
          strokeWidth={2}
          stroke="currentColor"
          className={cn(a.maxProfit == null ? "text-positive" : "text-primary")}
        />
      </svg>
      <div className="flex justify-between text-[10px] font-semibold text-mute">
        <span>{Math.round(x0)}</span>
        <span>spot {Math.round(spot)}</span>
        <span>{Math.round(x1)}</span>
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  render,
}: {
  label: string;
  value: number;
  onChange: (delta: number) => void;
  render: (v: number) => string;
}) {
  return (
    <div className="flex items-center justify-between rounded-3xl bg-secondary px-4 py-2.5">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-3">
        <Btn label={`${label}: less`} onClick={() => onChange(-1)}>−</Btn>
        <span className="w-10 text-center font-mono text-sm font-bold" aria-live="polite">
          {render(value)}
        </span>
        <Btn label={`${label}: more`} onClick={() => onChange(1)}>+</Btn>
      </div>
    </div>
  );
}

const Btn = ({
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
