"use client";
// Armed intraday breakout plans (9:16 / 9:20 / ORB).
//
// Unlike the payoff strategies, these are *stateful monitors*: they sit waiting
// for the index to break its opening range, then fire one option order. That
// means they have to outlive the page you armed them on, so this is a provider
// mounted next to PaperProvider, and plans are persisted to localStorage so a
// refresh mid-session doesn't disarm them.
//
// The range itself comes from the 1-minute candles, not from watching ticks, so
// arming at 10:00 still works — the window has already been recorded.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { usePaper } from "./paper";
import { useAllMarkets } from "./market";
import { marketOpen } from "./hours";
import {
  SESSION_OPEN_MIN,
  breakoutSide,
  istNowMinutes,
  openingRange,
  rangeReady,
  type Bar,
  type Range,
} from "./breakout";
import { MarketSnapshot, OptionQuote } from "./types";

const DATA_URL = process.env.NEXT_PUBLIC_DATA_URL ?? "http://localhost:8000";
const LS_PLANS = "pt.autotrade";

export type PlanStatus =
  | "waiting" // range window hasn't completed yet
  | "armed" // range known, watching for the break
  | "fired"
  | "missed" // already outside the range when armed — we don't chase
  | "expired" // cutoff passed without a break
  | "cancelled";

export interface Plan {
  id: string;
  name: string;
  indexId: string;
  rangeMinutes: number;
  lots: number;
  /** strikes from ATM for the option we buy */
  offset: number;
  slPct: number;
  tpPct: number;
  /** IST minute-of-day after which the plan gives up */
  cutoffMin: number;
  status: PlanStatus;
  range?: Range;
  /** we only fire on a break that happens while we're watching from inside */
  seenInside?: boolean;
  firedSide?: "CE" | "PE";
  firedAt?: number;
  note?: string;
  createdAt: number;
}

export interface NewPlan {
  name: string;
  indexId: string;
  rangeMinutes: number;
  lots: number;
  offset: number;
  slPct: number;
  tpPct: number;
  cutoffMin: number;
}

interface AutoApi {
  plans: Plan[];
  arm: (p: NewPlan) => void;
  cancel: (id: string) => void;
  clearDone: () => void;
}

const Ctx = createContext<AutoApi | null>(null);
export const DEFAULT_CUTOFF_MIN = 15 * 60; // 15:00 IST

async function fetchBars(key: string): Promise<Bar[] | null> {
  try {
    const r = await fetch(
      `${DATA_URL}/candles?key=${encodeURIComponent(key)}&interval=1m`,
      { signal: AbortSignal.timeout(6000) }
    );
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** ATM strike of a chain. */
function atmOf(snap: MarketSnapshot): number {
  return snap.rows.reduce((a, b) =>
    Math.abs(a.strike - snap.spot) < Math.abs(b.strike - snap.spot) ? a : b
  ).strike;
}

function stepOf(snap: MarketSnapshot): number {
  return snap.rows.length > 1 ? Math.abs(snap.rows[1].strike - snap.rows[0].strike) || 50 : 50;
}

export function AutoTradeProvider({ children }: { children: React.ReactNode }) {
  const paper = usePaper();
  const markets = useAllMarkets();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loaded, setLoaded] = useState(false);
  // in-flight range fetches, so a tick every 0.9s doesn't spam the endpoint
  const fetching = useRef<Set<string>>(new Set());

  useEffect(() => {
    let dead = false;
    (async () => {
      let saved: Plan[] = [];
      try {
        saved = JSON.parse(localStorage.getItem(LS_PLANS) ?? "[]");
      } catch {
        // corrupt entry — start clean rather than trap the user on a crash
      }
      if (dead) return;
      setPlans(saved);
      setLoaded(true);
    })();
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(LS_PLANS, JSON.stringify(plans));
  }, [plans, loaded]);

  const arm = useCallback((p: NewPlan) => {
    setPlans((ps) => [
      {
        ...p,
        id: crypto.randomUUID().slice(0, 8),
        status: "waiting",
        createdAt: Date.now(),
      },
      ...ps,
    ]);
    toast.success(`${p.name} armed`, {
      description: `Watching the first ${p.rangeMinutes}-minute range on ${p.indexId}.`,
    });
  }, []);

  const cancel = useCallback((id: string) => {
    setPlans((ps) =>
      ps.map((p) =>
        p.id === id && (p.status === "waiting" || p.status === "armed")
          ? { ...p, status: "cancelled" as const }
          : p
      )
    );
  }, []);

  const clearDone = useCallback(() => {
    setPlans((ps) => ps.filter((p) => p.status === "waiting" || p.status === "armed"));
  }, []);

  // resolve the opening range for any plan still waiting on one
  useEffect(() => {
    if (!markets) return;
    for (const p of plans) {
      if (p.status !== "waiting" || p.range) continue;
      if (!rangeReady(p.rangeMinutes)) continue;
      const snap = markets[p.indexId];
      if (!snap) continue;
      const tag = `${p.indexId}:${p.rangeMinutes}`;
      if (fetching.current.has(tag)) continue;
      fetching.current.add(tag);
      fetchBars(snap.key).then((bars) => {
        fetching.current.delete(tag);
        const range = bars ? openingRange(bars, p.rangeMinutes) : null;
        if (!range) return; // try again on a later tick
        setPlans((ps) =>
          ps.map((x) =>
            x.id === p.id && x.status === "waiting" ? { ...x, range, status: "armed" } : x
          )
        );
      });
    }
  }, [plans, markets]);

  // watch for the break on every tick
  useEffect(() => {
    if (!markets || !plans.some((p) => p.status === "armed")) return;
    const nowMin = istNowMinutes();
    const open = marketOpen();
    const patch = new Map<string, Partial<Plan>>();
    const fire: { plan: Plan; side: "CE" | "PE"; strike: number; q: OptionQuote; spot: number }[] =
      [];

    for (const p of plans) {
      if (p.status !== "armed" || !p.range) continue;

      if (nowMin > p.cutoffMin) {
        patch.set(p.id, { status: "expired", note: "No break before the cutoff." });
        continue;
      }
      if (!open) continue;

      const snap = markets[p.indexId];
      if (!snap) continue;
      const side = breakoutSide(snap.spot, p.range);

      // don't chase: price has to be inside the range while we're watching first
      if (!p.seenInside) {
        if (side === null) patch.set(p.id, { seenInside: true });
        else
          patch.set(p.id, {
            status: "missed",
            note: `Already broken ${side === "CE" ? "above" : "below"} the range when armed.`,
          });
        continue;
      }
      if (!side) continue;

      // OTM offset walks away from spot: calls up, puts down
      const strike = atmOf(snap) + p.offset * stepOf(snap) * (side === "CE" ? 1 : -1);
      const row = snap.rows.find((r) => r.strike === strike);
      const q = row ? (side === "CE" ? row.ce : row.pe) : null;
      if (!q) {
        patch.set(p.id, {
          status: "missed",
          note: `${strike} ${side} isn't in the loaded chain.`,
        });
        continue;
      }
      patch.set(p.id, { status: "fired", firedSide: side, firedAt: Date.now() });
      fire.push({ plan: p, side, strike, q, spot: snap.spot });
    }

    if (!patch.size) return;
    // Tick-driven sync with the live feed: the market is the external system and
    // a break can only be detected here. Marking fired in the same pass is what
    // keeps it one-shot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlans((ps) => ps.map((x) => (patch.has(x.id) ? { ...x, ...patch.get(x.id)! } : x)));

    for (const f of fire) {
      const entry = f.q.ask || f.q.ltp;
      paper.placeOrder({
        instrumentKey: f.q.instrumentKey,
        label: `${f.plan.indexId} ${f.strike} ${f.side}`,
        side: "BUY",
        type: "MARKET",
        lots: f.plan.lots,
        // always a long option, so SL sits below entry and target above
        stopLoss:
          f.plan.slPct > 0 ? +(entry * (1 - f.plan.slPct / 100)).toFixed(2) : undefined,
        target: f.plan.tpPct > 0 ? +(entry * (1 + f.plan.tpPct / 100)).toFixed(2) : undefined,
      });
      const level = f.side === "CE" ? f.plan.range!.high : f.plan.range!.low;
      toast.success(`${f.plan.name} triggered`, {
        description: `Spot ${f.spot.toFixed(2)} broke ${
          f.side === "CE" ? "above" : "below"
        } ${level.toFixed(2)} — bought ${f.strike} ${f.side}.`,
      });
    }
  }, [markets, plans, paper]);

  return (
    <Ctx.Provider value={{ plans, arm, cancel, clearDone }}>{children}</Ctx.Provider>
  );
}

export function useAutoTrade() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAutoTrade outside AutoTradeProvider");
  return c;
}

export { SESSION_OPEN_MIN };
