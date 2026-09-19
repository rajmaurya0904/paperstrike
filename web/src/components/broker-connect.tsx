"use client";
// Bring-your-own-key: the user connects their own Upstox or Groww account. Keys
// go straight to the local data service (which checks them with the broker and
// saves them in its .env); nothing is kept in the browser and nothing is ever
// read back — /status only says whether the connection works.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { marketControl } from "@/lib/market";
import { DATA_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

type BrokerId = "upstox" | "groww";

export interface BrokerStatus {
  reachable: boolean;
  broker?: BrokerId | null;
  brokers?: { id: BrokerId; label: string; configured: boolean; oauth: boolean }[];
  connected?: boolean;
  expires_at?: number | null;
  detail?: string;
  oauth?: boolean;
  mode?: string | null;
  feed_error?: string | null;
}

export function useBrokerStatus() {
  const [status, setStatus] = useState<BrokerStatus | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${DATA_URL}/status`, { signal: AbortSignal.timeout(8000) });
      setStatus({ reachable: true, ...(await r.json()) });
    } catch {
      setStatus({ reachable: false });
    }
  }, []);
  useEffect(() => {
    // the first check runs once, on mount; later ones follow user actions
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);
  return { status, refresh };
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${DATA_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail ?? `Request failed (${r.status})`);
  return data;
}

const BROKERS: { id: BrokerId; label: string; blurb: string }[] = [
  { id: "upstox", label: "Upstox", blurb: "Free API · token renews daily" },
  { id: "groww", label: "Groww", blurb: "Trade API plan with live data" },
];

export function BrokerConnect({
  status,
  refresh,
}: {
  status: BrokerStatus | null;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<BrokerId>("upstox");
  const [busy, setBusy] = useState(false);

  // open on whichever broker is already in use
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status?.broker) setTab(status.broker);
  }, [status?.broker]);

  async function connect(broker: BrokerId, fields: Record<string, string>, quiet = false) {
    setBusy(true);
    try {
      const res = await post("/connect", { broker, fields });
      await refresh();
      if (res.connected) {
        marketControl.retryLive = true;
        toast.success(`Connected to ${broker === "upstox" ? "Upstox" : "Groww"}`, {
          description: "Live market data is on its way.",
        });
      } else if (!quiet) {
        toast.message("Saved", { description: res.detail || "Finish connecting below." });
      }
      return res;
    } catch (e) {
      toast.error("Couldn't connect", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function forget(broker: BrokerId) {
    if (!confirm(`Remove your saved ${broker === "upstox" ? "Upstox" : "Groww"} keys from this machine?`)) return;
    try {
      await post("/disconnect", { broker });
      toast.success("Keys removed");
      await refresh();
    } catch (e) {
      toast.error("Couldn't remove keys", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  const configured = (id: BrokerId) => status?.brokers?.find((b) => b.id === id)?.configured;

  return (
    <Card className="rounded-3xl">
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-bold">Connect your broker</h2>
          <p className="text-sm text-body">
            Paperstrike uses <em>your own</em> broker API keys for live market data. They&apos;re
            verified with the broker and stored only in the data service&apos;s{" "}
            <code className="rounded bg-secondary px-1">.env</code> on this machine. No order
            is ever placed — the keys are only used to read prices.
          </p>
        </div>

        <div role="tablist" className="grid grid-cols-2 gap-2">
          {BROKERS.map((b) => (
            <button
              key={b.id}
              role="tab"
              aria-selected={tab === b.id}
              onClick={() => setTab(b.id)}
              className={cn(
                "rounded-2xl border p-3 text-left transition-colors",
                tab === b.id ? "border-foreground bg-secondary" : "border-border hover:bg-secondary/60"
              )}
            >
              <div className="flex items-center gap-2 font-bold">
                {b.label}
                {status?.broker === b.id && status.connected && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-positive-deep">
                    ACTIVE
                  </span>
                )}
              </div>
              <div className="text-xs text-mute">{b.blurb}</div>
            </button>
          ))}
        </div>

        {tab === "upstox" ? (
          <UpstoxForm status={status} busy={busy} connect={connect} />
        ) : (
          <GrowwForm status={status} busy={busy} connect={connect} />
        )}

        {configured(tab) && (
          <button
            onClick={() => forget(tab)}
            className="self-start text-xs font-semibold text-negative hover:underline"
          >
            Remove saved {tab === "upstox" ? "Upstox" : "Groww"} keys
          </button>
        )}
      </CardContent>
    </Card>
  );
}

type ConnectFn = (
  broker: BrokerId,
  fields: Record<string, string>,
  quiet?: boolean
) => Promise<{ connected?: boolean } | undefined>;

function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: React.ReactNode } & React.ComponentProps<typeof Input>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold">{label}</span>
      <Input spellCheck={false} autoComplete="off" className="rounded-xl font-mono text-xs" {...props} />
      {hint && <span className="text-[11px] text-mute">{hint}</span>}
    </label>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm text-body">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function UpstoxForm({ status, busy, connect }: { status: BrokerStatus | null; busy: boolean; connect: ConnectFn }) {
  const callback = `${DATA_URL}/auth/upstox/callback`;
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [redirect, setRedirect] = useState(callback);
  const [token, setToken] = useState("");
  const oauthReady = status?.brokers?.find((b) => b.id === "upstox")?.oauth;

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1.5">
        <Step n={1}>
          Create an app at{" "}
          <a className="font-semibold text-ink-deep hover:underline" href="https://account.upstox.com/developer/apps" target="_blank" rel="noreferrer">
            Upstox Developer Apps ↗
          </a>
        </Step>
        <Step n={2}>
          Set its redirect URL to <code className="rounded bg-secondary px-1 text-xs">{callback}</code>
        </Step>
        <Step n={3}>Paste the API key and secret below, then log in. Repeat the login each morning — Upstox tokens expire at 03:30 IST.</Step>
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="API key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. 3b4c…" />
        <Field label="API secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="••••••" />
      </div>
      <Field label="Redirect URL" value={redirect} onChange={(e) => setRedirect(e.target.value)} hint="Must match the app exactly." />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={busy || !key.trim() || !secret.trim() || !redirect.trim()}
          className="rounded-3xl px-6 font-semibold"
          onClick={async () => {
            const res = await connect("upstox", { api_key: key, api_secret: secret, redirect_uri: redirect }, true);
            if (res) window.location.href = `${DATA_URL}/auth/upstox/login`;
          }}
        >
          Save &amp; log in with Upstox
        </Button>
        {oauthReady && (
          <Button asChild variant="secondary" className="rounded-3xl px-6 font-semibold">
            <a href={`${DATA_URL}/auth/upstox/login`}>Log in with saved app</a>
          </Button>
        )}
      </div>

      <details className="rounded-2xl bg-secondary/60 p-3">
        <summary className="cursor-pointer text-sm font-semibold">Or paste an access token</summary>
        <div className="mt-3 flex flex-col gap-3">
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="eyJ0eXAiOiJKV1Qi…"
            rows={3}
            spellCheck={false}
            className="w-full resize-none rounded-xl border border-input bg-background p-3 font-mono text-xs outline-none placeholder:text-mute focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button
            variant="secondary"
            disabled={busy || token.trim().split(".").length !== 3}
            className="self-start rounded-3xl px-6 font-semibold"
            onClick={async () => {
              const res = await connect("upstox", { access_token: token });
              if (res?.connected) setToken("");
            }}
          >
            {busy ? "Verifying…" : "Verify & connect"}
          </Button>
        </div>
      </details>
    </div>
  );
}

const GROWW_MODES = [
  { id: "totp", label: "TOTP", note: "Recommended — reconnects by itself, no daily login" },
  { id: "approval", label: "Key + secret", note: "Approve the key on Groww once a day" },
  { id: "token", label: "Access token", note: "Paste a token each day" },
] as const;

function GrowwForm({ status, busy, connect }: { status: BrokerStatus | null; busy: boolean; connect: ConnectFn }) {
  const [mode, setMode] = useState<(typeof GROWW_MODES)[number]["id"]>("totp");
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const active = status?.broker === "groww";

  const ready =
    mode === "totp" ? key.trim() && secret.trim() : mode === "approval" ? key.trim() && secret.trim() : token.trim();

  async function submit() {
    const fields: Record<string, string> =
      mode === "totp"
        ? { mode, api_key: key, totp_secret: secret }
        : mode === "approval"
          ? { mode, api_key: key, api_secret: secret }
          : { mode, access_token: token };
    const res = await connect("groww", fields);
    if (res?.connected) {
      setKey("");
      setSecret("");
      setToken("");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1.5">
        <Step n={1}>
          Subscribe to a{" "}
          <a className="font-semibold text-ink-deep hover:underline" href="https://groww.in/trade-api" target="_blank" rel="noreferrer">
            Groww Trade API ↗
          </a>{" "}
          plan that includes live data — quotes, option chain and the feed aren&apos;t in the free trial.
        </Step>
        <Step n={2}>Generate a key on Groww&apos;s API keys page and paste it below.</Step>
      </ol>

      <div className="flex flex-wrap gap-2">
        {GROWW_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold transition-colors",
              mode === m.id ? "bg-foreground text-background" : "bg-secondary text-mute hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-mute">{GROWW_MODES.find((m) => m.id === mode)?.note}</p>

      {mode === "token" ? (
        <Field label="Access token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="eyJ…" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={mode === "totp" ? "TOTP token (API key)" : "API key"}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <Field
            label={mode === "totp" ? "TOTP secret" : "API secret"}
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            hint={mode === "totp" ? "The base32 secret shown when you created the TOTP key." : undefined}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || !ready} onClick={submit} className="rounded-3xl px-6 font-semibold">
          {busy ? "Verifying…" : "Verify & connect"}
        </Button>
        {active && status?.mode !== "token" && (
          <Button
            variant="secondary"
            disabled={busy}
            className="rounded-3xl px-6 font-semibold"
            onClick={() => connect("groww", { mode: "reconnect" })}
          >
            Reconnect with saved keys
          </Button>
        )}
      </div>
    </div>
  );
}
