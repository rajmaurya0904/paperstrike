"use client";
// Broker-style number: the value swaps outright, then the text (or the cell
// behind it) pulses green/red to show which way it moved. No counting up.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Dir = "up" | "down" | null;

/** Returns the tick direction, auto-clearing after `hold` ms. */
export function useTickDir(value: number, hold = 700): Dir {
  const prev = useRef(value);
  const [dir, setDir] = useState<Dir>(null);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    setDir(value > from ? "up" : "down");
    const t = setTimeout(() => setDir(null), hold);
    return () => clearTimeout(t);
  }, [value, hold]);

  return dir;
}

export function Num({
  value,
  format,
  className,
  flash = false,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
  flash?: boolean; // brief green/red pulse on change direction
}) {
  const dir = useTickDir(value);
  return (
    <span
      className={cn(
        "transition-colors duration-200",
        flash && dir === "up" && "text-positive",
        flash && dir === "down" && "text-negative",
        className
      )}
    >
      {format(value)}
    </span>
  );
}

/** Cell-level tape flash — green when the print is up, red when down. */
export function tickBg(dir: Dir) {
  return dir === "up"
    ? "bg-positive/25"
    : dir === "down"
      ? "bg-negative/25"
      : "";
}
