"use client";
// ⌘K palette: jump to a page, or search any strike and trade it straight from here.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useMarket } from "@/lib/market";
import { usePaper } from "@/lib/paper";
import { compact, px } from "@/lib/format";

const PAGES = [
  { href: "/trade", label: "Dashboard" },
  { href: "/trade/chain", label: "Option chain" },
  { href: "/trade/charts", label: "Charts" },
  { href: "/trade/positions", label: "Positions & orders" },
  { href: "/trade/portfolio", label: "Portfolio" },
  { href: "/trade/settings", label: "Settings" },
];

export function Palette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const snap = useMarket();
  const paper = usePaper();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  // strikes near ATM — enough to be useful without flooding the list
  const atmIdx = snap?.rows.length
    ? snap.rows.reduce(
        (best, r, i) =>
          Math.abs(r.strike - snap.spot) <
          Math.abs(snap.rows[best].strike - snap.spot)
            ? i
            : best,
        0
      )
    : 0;
  const nearby = snap?.rows.slice(Math.max(0, atmIdx - 10), atmIdx + 11) ?? [];

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Quick search"
      description="Jump to a page or find a strike"
    >
      {/* this CommandDialog variant doesn't wrap children in <Command> itself */}
      <Command>
        <CommandInput placeholder="Search strikes, pages, positions…" />
        <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>

        <CommandGroup heading="Go to">
          {PAGES.map((p) => (
            <CommandItem key={p.href} value={p.label} onSelect={() => go(p.href)}>
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {paper.positions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Open positions">
              {paper.positions.map((p) => (
                <CommandItem
                  key={p.instrumentKey}
                  value={`position ${p.label}`}
                  onSelect={() => go("/trade/positions")}
                >
                  {p.label}
                  <CommandShortcut>
                    {p.qty > 0 ? "LONG" : "SHORT"} {Math.abs(p.qty)}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {nearby.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Strikes near ATM">
              {nearby.map((r) => (
                <CommandItem
                  key={r.strike}
                  value={`${r.strike} CE PE strike`}
                  onSelect={() => go("/trade/chain")}
                >
                  <span className="font-mono font-semibold">{r.strike}</span>
                  <CommandShortcut className="font-mono">
                    CE {px(r.ce.ltp)} · PE {px(r.pe.ltp)} · OI{" "}
                    {compact(r.ce.oi + r.pe.oi)}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
