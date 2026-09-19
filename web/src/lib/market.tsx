"use client";
// Market data provider. Streams every index the relay carries (~1 push per
// second).
//
// There is deliberately no simulated fallback: a paper-trading app that invents
// prices when the token expires teaches you nothing and hides the outage. No
// feed means no data, and the UI says so.
//
// The socket delivers all indices at once, but most screens only care about the
// one the user picked — useMarket() returns that, useAllMarkets() the lot.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Markets, MarketSnapshot, OptionQuote } from "./types";
import { WS_URL } from "./site";
import { readLS, writeLS } from "./storage";

const LS_INDEX = "pt.index";
export const DEFAULT_INDEX = "NIFTY";

// settings page flips this after saving a new token so the client retries live immediately
export const marketControl = { retryLive: false };

/**
 * Latest snapshot, outside React. Callbacks that fire between renders — a
 * delayed fill, a square-off, the close-out timer — need the current feed, not
 * whatever was in scope when they were created.
 */
export const latestMarkets: { current: Markets | null } = { current: null };

/** connecting = socket opening or relay warming up; offline = no usable feed. */
export type FeedStatus = "connecting" | "live" | "offline";

// the relay only pushes once it has rows, so an open socket with no traffic
// still means no data — an expired token looks exactly like this
const STALE_MS = 10_000;

interface Ctx {
  all: Markets | null;
  status: FeedStatus;
  id: string;
  setId: (id: string) => void;
}

const MarketCtx = createContext<Ctx>({
  all: null,
  status: "connecting",
  id: DEFAULT_INDEX,
  setId: () => {},
});

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [all, setAll] = useState<Markets | null>(null);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  // safe to read storage during init: nothing index-dependent renders until the
  // first snapshot arrives, which is always client-side
  const [id, setRawId] = useState(() =>
    typeof window === "undefined" ? DEFAULT_INDEX : readLS(LS_INDEX) ?? DEFAULT_INDEX
  );

  const setId = useCallback((next: string) => {
    setRawId(next);
    writeLS(LS_INDEX, next);
  }, []);

  useEffect(() => {
    let stopped = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let lastMsg = 0;

    function connect() {
      if (stopped) return;
      ws = new WebSocket(WS_URL);

      ws.onmessage = (e) => {
        let d: { indices?: Record<string, Omit<MarketSnapshot, "updatedAt">> };
        try {
          d = JSON.parse(e.data);
        } catch {
          return; // a garbled frame isn't data; the next push replaces it
        }
        if (!d.indices || typeof d.indices !== "object") return;
        lastMsg = Date.now();
        setStatus("live");
        const now = Date.now();
        const next: Markets = {};
        for (const [key, ix] of Object.entries(d.indices)) {
          next[key] = { ...ix, updatedAt: now };
        }
        latestMarkets.current = next;
        setAll(next);
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        if (stopped) return;
        setStatus("offline");
        retryTimer = setTimeout(connect, 3000); // keep trying; a new token may land
      };
    }

    const opened = Date.now();
    connect();

    const watch = setInterval(() => {
      if (marketControl.retryLive) {
        marketControl.retryLive = false;
        ws?.close(); // reconnect now that a new token is saved
        return;
      }
      // silence for long enough means no usable feed, socket state regardless
      const since = lastMsg || opened;
      if (Date.now() - since > STALE_MS) setStatus("offline");
    }, 1000);

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(watch);
      ws?.close();
    };
  }, []);

  const value = useMemo(
    () => ({ all, status, id, setId }),
    [all, status, id, setId]
  );
  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}

/** The index the user is currently looking at. */
export function useMarket(): MarketSnapshot | null {
  const { all, id } = useContext(MarketCtx);
  if (!all) return null;
  return all[id] ?? all[DEFAULT_INDEX] ?? Object.values(all)[0] ?? null;
}

/** Feed health, for the "no data" states. */
export function useFeedStatus(): FeedStatus {
  return useContext(MarketCtx).status;
}

/** Every index — for cross-index lookups (positions) and the watchlist. */
export function useAllMarkets(): Markets | null {
  return useContext(MarketCtx).all;
}

/** Index picker state: current id, setter, and what's available. */
export function useIndexPicker() {
  const { all, id, setId } = useContext(MarketCtx);
  const list = useMemo(
    () => Object.values(all ?? {}).map((m) => ({ id: m.id, label: m.label })),
    [all]
  );
  return { id, setId, list };
}

/**
 * Same feed, resampled on a timer. PCR, max pain, turnover and the activity
 * leaderboards are slow-moving aggregates — re-rendering them on every tick
 * just makes them unreadable.
 */
export function useSlowMarket(ms = 180_000) {
  const snap = useMarket();
  const latest = useRef(snap);
  const [slow, setSlow] = useState<MarketSnapshot | null>(null);

  useEffect(() => {
    latest.current = snap;
  }, [snap]);

  useEffect(() => {
    const t = setInterval(() => setSlow(latest.current), ms);
    return () => clearInterval(t);
  }, [ms]);

  // fall through to live until the first interval fires, and whenever the user
  // switches index — otherwise the panel would show the old index's aggregates
  return slow && slow.id === snap?.id ? slow : snap;
}

/** Which index an instrument belongs to — positions span all of them. */
export function findIndexOf(
  m: Markets | null,
  instrumentKey: string
): MarketSnapshot | null {
  if (!m) return null;
  for (const ix of Object.values(m)) {
    for (const row of ix.rows) {
      if (row.ce.instrumentKey === instrumentKey) return ix;
      if (row.pe.instrumentKey === instrumentKey) return ix;
    }
  }
  return null;
}

// price lookup for fills, across every index
export function findQuote(
  m: Markets | null,
  instrumentKey: string
): OptionQuote | null {
  if (!m) return null;
  for (const ix of Object.values(m)) {
    for (const row of ix.rows) {
      if (row.ce.instrumentKey === instrumentKey) return row.ce;
      if (row.pe.instrumentKey === instrumentKey) return row.pe;
    }
  }
  return null;
}
