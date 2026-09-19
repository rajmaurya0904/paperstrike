"use client";
// Market session for components that are prerendered at build time. Reading
// the clock during render bakes the build's session into the HTML and then
// mismatches on hydration, so this is null on the server and during hydration,
// and the real session afterwards, re-checked every 15 seconds.
import { useSyncExternalStore } from "react";
import { marketStatus } from "./hours";

type Status = ReturnType<typeof marketStatus>;
let last: Status | null = null;

function snapshot(): Status {
  const now = marketStatus();
  if (!last || last.label !== now.label) last = now; // stable identity between changes
  return last;
}

function subscribe(onChange: () => void) {
  const t = setInterval(onChange, 15_000);
  return () => clearInterval(t);
}

export function useMarketStatus(): Status | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
