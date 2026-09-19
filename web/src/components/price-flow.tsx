"use client";
// Price display. Layout came from 21st.dev "Number Flow Trading"
// (uilayout.contact), but both animated parts are gone: real broker tickers
// re-print the number outright, so the digit-roll engine and its `motion`
// dependency were dropped for a plain swap plus a colour pulse.
import { ArrowUp } from "lucide-react";
import { useTickDir } from "@/components/num";
import { cn } from "@/lib/utils";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const PLAIN = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmt = (v: number, currency: boolean) =>
  (currency ? INR : PLAIN).format(v);

/** Big animated value with an optional up/down % pill. */
export function PriceFlow({
  value,
  diffPct,
  currency = false,
  className,
  pillClassName,
}: {
  value: number;
  diffPct?: number;
  currency?: boolean;
  className?: string;
  pillClassName?: string;
}) {
  const up = (diffPct ?? 0) >= 0;
  const dir = useTickDir(value);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "font-mono tabular-nums transition-colors duration-200",
          dir === "up" && "text-positive",
          dir === "down" && "text-negative",
          className
        )}
      >
        {fmt(value, currency)}
      </span>
      {diffPct !== undefined && (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-sm font-semibold text-white transition-colors duration-300",
            up ? "bg-positive" : "bg-negative",
            pillClassName
          )}
        >
          <ArrowUp
            className={cn(
              "mr-0.5 size-[0.85em] transition-transform duration-500",
              !up && "-rotate-180"
            )}
            strokeWidth={3}
            absoluteStrokeWidth
          />
          {Math.abs(diffPct).toFixed(2)}%
        </span>
      )}
    </span>
  );
}

/** Inline animated number, no pill — drop-in for prices in dense layouts. */
export function NumFlow({
  value,
  currency = false,
  className,
}: {
  value: number;
  currency?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {fmt(value, currency)}
    </span>
  );
}
