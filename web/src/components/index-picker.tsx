"use client";
// NIFTY / BANKNIFTY / SENSEX switch. Each index has its own chain, lot size and
// expiry, so this drives what most of the app is looking at.
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIndexPicker } from "@/lib/market";

export function IndexPicker() {
  const { id, setId, list } = useIndexPicker();
  if (list.length < 2) return null;
  return (
    <ToggleGroup
      type="single"
      value={id}
      onValueChange={(v) => v && setId(v)}
      className="rounded-full bg-secondary p-0.5"
    >
      {list.map((ix) => (
        <ToggleGroupItem
          key={ix.id}
          value={ix.id}
          className="rounded-full px-3 text-xs font-bold data-[state=on]:bg-card data-[state=on]:shadow-sm"
        >
          {ix.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
