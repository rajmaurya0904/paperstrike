"use client";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Num } from "@/components/num";
import { findQuote, useAllMarkets } from "@/lib/market";
import { usePaper } from "@/lib/paper";
import { Position } from "@/lib/types";
import { inr, plClass, px, signed } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function PositionsPage() {
  const paper = usePaper();
  const snap = useAllMarkets();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Positions</h1>
        {paper.positions.length > 0 && (
          <Button
            variant="destructive"
            className="rounded-3xl font-semibold"
            onClick={paper.squareOffAll}
          >
            Square off all
          </Button>
        )}
      </div>

      <Card className="rounded-3xl">
        <CardContent className="p-4 sm:p-6">
          {paper.positions.length === 0 ? (
            <p className="py-8 text-center text-sm text-mute">No open positions.</p>
          ) : (
            <div className="divide-y divide-border">
              {paper.positions.map((p) => {
                const q = findQuote(snap, p.instrumentKey);
                const ltp = q?.ltp ?? p.avgPrice;
                const pnl = (ltp - p.avgPrice) * p.qty;
                return (
                  <div key={p.instrumentKey} className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-40">
                      <div className="font-bold">{p.label}</div>
                      <div className="text-xs text-mute">
                        {p.qty > 0 ? "LONG" : "SHORT"} {Math.abs(p.qty)} · avg{" "}
                        {px(p.avgPrice)}
                        {p.margin > 0 && <> · {inr(p.margin)} margin</>}
                      </div>
                      {(p.stopLoss || p.target || p.trail) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.stopLoss && (
                            <span className="rounded-full bg-negative/10 px-2 py-0.5 text-[10px] font-bold text-negative-deep">
                              SL {px(p.stopLoss)}
                            </span>
                          )}
                          {p.target && (
                            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-positive-deep">
                              TGT {px(p.target)}
                            </span>
                          )}
                          {p.trail && (
                            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold text-warning-content">
                              TRAIL {px(p.trail)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-sm tabular-nums">
                      LTP <Num value={ltp} format={px} flash className="font-semibold" />
                    </div>
                    <div className="ml-auto text-right">
                      <Num
                        value={pnl}
                        format={(v) => signed(v, inr)}
                        className={cn("font-mono text-lg font-bold tabular-nums", plClass(pnl))}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-3xl font-semibold"
                      onClick={() =>
                        setEditing((e) => (e === p.instrumentKey ? null : p.instrumentKey))
                      }
                    >
                      SL/TGT
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-3xl font-semibold"
                      onClick={() => paper.squareOff(p.instrumentKey)}
                    >
                      Exit
                    </Button>
                  </div>
                  {editing === p.instrumentKey && (
                    <BracketEditor
                      p={p}
                      ltp={ltp}
                      onSave={(patch) => {
                        paper.setBracket(p.instrumentKey, patch);
                        setEditing(null);
                      }}
                    />
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="orders">
        <TabsList className="rounded-full">
          <TabsTrigger value="orders" className="rounded-full">
            Order book
          </TabsTrigger>
          <TabsTrigger value="trades" className="rounded-full">
            Trade book
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <BookCard
            empty="No orders yet."
            rows={paper.orders.map((o) => ({
              id: o.id,
              left: (
                <>
                  <SideTag side={o.side} />
                  <span className="font-semibold">{o.label}</span>
                  <span className="ml-2 text-xs text-mute">
                    {o.type} ×{o.qty}
                  </span>
                </>
              ),
              right: (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm tabular-nums">
                    {o.status === "FILLED"
                      ? px(o.fillPrice!)
                      : o.limitPrice
                        ? px(o.limitPrice)
                        : "—"}
                  </span>
                  <StatusTag status={o.status} />
                  {o.status === "PENDING" && (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => paper.cancelOrder(o.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ),
            }))}
          />
        </TabsContent>

        <TabsContent value="trades">
          <BookCard
            empty="No trades yet."
            rows={paper.trades.map((t) => ({
              id: t.id,
              left: (
                <>
                  <SideTag side={t.side} />
                  <span className="font-semibold">{t.label}</span>
                  <span className="ml-2 text-xs text-mute">
                    ×{t.qty} · {new Date(t.ts).toLocaleTimeString()} · {inr(t.charges)} charges
                  </span>
                </>
              ),
              right: (
                <div className="text-right">
                  <div className="font-mono text-sm tabular-nums">{px(t.price)}</div>
                  {t.realized !== 0 && (
                    <div className={cn("text-xs font-semibold", plClass(t.realized))}>
                      {signed(t.realized, inr)} net
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Attach or edit a position's bracket after it's open. Mirrors the ticket's
// validation: long SL below price / target above, mirrored for shorts, so a
// bad level can't fire an instant exit.
function BracketEditor({
  p,
  ltp,
  onSave,
}: {
  p: Position;
  ltp: number;
  onSave: (patch: { stopLoss?: number; target?: number; trail?: number }) => void;
}) {
  const long = p.qty > 0;
  const [sl, setSl] = useState(p.stopLoss ? String(p.stopLoss) : "");
  const [tgt, setTgt] = useState(p.target ? String(p.target) : "");
  const [trail, setTrail] = useState(p.trail ? String(p.trail) : "");
  const slNum = +sl;
  const tgtNum = +tgt;
  const trailNum = +trail;
  const slValid = !sl || (long ? slNum < ltp : slNum > ltp);
  const tgtValid = !tgt || (long ? tgtNum > ltp : tgtNum < ltp);
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl bg-secondary p-3">
      <Field label={`Stop-loss ${long ? "≤" : "≥"}`} value={sl} onChange={setSl} invalid={!slValid} placeholder={(long ? ltp * 0.8 : ltp * 1.2).toFixed(2)} />
      <Field label={`Target ${long ? "≥" : "≤"}`} value={tgt} onChange={setTgt} invalid={!tgtValid} placeholder={(long ? ltp * 1.3 : ltp * 0.7).toFixed(2)} />
      <Field label="Trail by pts" value={trail} onChange={setTrail} placeholder={(ltp * 0.15).toFixed(2)} />
      <div className="flex gap-2 pb-0.5">
        <Button
          size="sm"
          className="rounded-3xl font-semibold"
          disabled={!slValid || !tgtValid}
          onClick={() =>
            onSave({
              stopLoss: slNum > 0 ? slNum : undefined,
              target: tgtNum > 0 ? tgtNum : undefined,
              trail: trailNum > 0 ? trailNum : undefined,
            })
          }
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-3xl font-semibold text-mute"
          onClick={() => onSave({ stopLoss: undefined, target: undefined, trail: undefined })}
        >
          Clear
        </Button>
      </div>
      {(!slValid || !tgtValid) && (
        <p className="w-full text-xs font-semibold text-negative">
          {!slValid && `Stop-loss must be ${long ? "below" : "above"} ${px(ltp)}. `}
          {!tgtValid && `Target must be ${long ? "above" : "below"} ${px(ltp)}.`}
        </p>
      )}
    </div>
  );
}

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  invalid?: boolean;
}) => (
  <label className="flex flex-col gap-1 text-xs font-semibold text-mute">
    {label}
    <Input
      type="number"
      step="0.05"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("h-9 w-28 font-mono", invalid && "border-negative")}
    />
  </label>
);

function BookCard({
  rows,
  empty,
}: {
  rows: { id: string; left: React.ReactNode; right: React.ReactNode }[];
  empty: string;
}) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="p-4 sm:p-6">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-mute">{empty}</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center">{r.left}</div>
                {r.right}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SideTag = ({ side }: { side: "BUY" | "SELL" }) => (
  <span
    className={cn(
      "mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold",
      side === "BUY" ? "bg-accent text-positive-deep" : "bg-negative/10 text-negative-deep"
    )}
  >
    {side}
  </span>
);

const StatusTag = ({ status }: { status: string }) => (
  <span
    className={cn(
      "rounded-full px-2 py-0.5 text-[10px] font-bold",
      status === "FILLED" && "bg-accent text-positive-deep",
      status === "PENDING" && "bg-warning/30 text-warning-content dark:bg-warning",
      status === "CANCELLED" && "bg-secondary text-mute"
    )}
  >
    {status}
  </span>
);
