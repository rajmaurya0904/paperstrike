"use client";
import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BrokerConnect, useBrokerStatus } from "@/components/broker-connect";
import { RESET_ACCOUNT, useConfirm } from "@/components/confirm";
import { marketControl, useFeedStatus } from "@/lib/market";
import { usePaper } from "@/lib/paper";
import { inr } from "@/lib/format";
import { DATA_URL, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = { upstox: "Upstox", groww: "Groww" };

// The data service sends ?error=<code> back from "Log in with Upstox". Only
// these fixed messages are ever shown, so a crafted link can't put its own
// words on this page.
const LOGIN_ERRORS: Record<string, string> = {
  cancelled: "The Upstox login was cancelled.",
  state: "That login link expired or didn't start here. Try again.",
  setup: "Save your Upstox API key, secret and redirect URL first.",
  refused: "Upstox refused the login. Check the API secret and redirect URL, then try again.",
  network: "Couldn't reach Upstox. Check your internet connection and try again.",
};

export default function SettingsPage() {
  const feed = useFeedStatus();
  const paper = usePaper();
  const { status, refresh } = useBrokerStatus();
  const [checking, setChecking] = useState(false);
  const [ask, confirmDialog] = useConfirm();

  // landing back from "Log in with Upstox" — the data service adds ?connected= or ?error=
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ok = q.get("connected");
    const err = q.get("error");
    if (!ok && !err) return;
    if (ok && LABEL[ok]) {
      marketControl.retryLive = true;
      toast.success(`Connected to ${LABEL[ok]}`, { description: "Live market data is on its way." });
    } else if (err) {
      toast.error("Login failed", {
        description: LOGIN_ERRORS[err] ?? "The Upstox login didn't complete. Try again.",
      });
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const recheck = async () => {
    setChecking(true);
    await refresh();
    marketControl.retryLive = true;
    setChecking(false);
  };

  const broker = status?.broker ? LABEL[status.broker] : null;
  const feedState = feed === "live"
    ? { dot: "bg-positive", label: "Live market data", sub: `Streaming from ${broker ?? "your broker"} via the local data service` }
    : status?.reachable === false
      ? { dot: "bg-negative", label: "Data service offline", sub: `Nothing is answering at ${DATA_URL}. Start Paperstrike with ${SITE.install}, or run the data service yourself (see the README).` }
      : !status?.broker
        ? { dot: "bg-warning", label: "No broker connected", sub: "Connect Upstox or Groww below to get live prices" }
        : feed === "connecting" || status?.connected
          ? { dot: "bg-warning", label: "Connecting…", sub: `Waiting for the first snapshot from ${broker}` }
          : { dot: "bg-negative", label: "No market data", sub: status?.detail || status?.feed_error || `${broker} isn't connected` };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-black">Settings</h1>

      {/* connection status */}
      <Card className="rounded-3xl">
        <CardContent className="flex flex-wrap items-center gap-3 p-5" aria-live="polite">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", feedState.dot)} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-bold">{feedState.label}</div>
            <div className="break-words text-xs text-mute">{feedState.sub}</div>
          </div>
          {status?.expires_at ? (
            <div className="shrink-0 text-right text-xs text-mute">
              {broker} token {status.connected ? "valid till" : "expired"}
              <div className={cn("font-semibold", status.connected ? "text-positive-deep" : "text-negative")}>
                {new Date(status.expires_at * 1000).toLocaleString(undefined, {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </div>
            </div>
          ) : null}
          {feed !== "live" && (
            <Button
              variant="secondary"
              size="sm"
              disabled={checking}
              onClick={recheck}
              className="shrink-0 rounded-3xl px-3 font-semibold"
            >
              <RotateCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
              {checking ? "Checking…" : "Check again"}
            </Button>
          )}
        </CardContent>
      </Card>

      {status?.reachable !== false && <BrokerConnect status={status} refresh={refresh} />}

      {/* account */}
      <Card className="rounded-3xl bg-secondary">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="font-bold">{paper.account.name}&apos;s paper account</div>
            <p className="text-sm text-body">
              Started with {inr(paper.account.startingBalance)} ·{" "}
              {new Date(paper.account.createdAt).toLocaleDateString()}
            </p>
          </div>
          <Button
            variant="destructive"
            className="rounded-3xl font-semibold"
            onClick={async () => {
              if (await ask(RESET_ACCOUNT)) paper.resetAccount();
            }}
          >
            Reset account
          </Button>
        </CardContent>
      </Card>
      {confirmDialog}
    </div>
  );
}
