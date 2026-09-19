"use client";
// What a screen shows when it throws, instead of a blank page. Used by the
// route-level error boundaries (app/error.tsx, app/trade/error.tsx).
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

export function Crash({
  error,
  retry,
  fullPage = false,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  fullPage?: boolean;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={cn(fullPage && "flex min-h-screen items-center justify-center bg-background p-4")}>
      <div
        role="alert"
        className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl bg-card px-6 py-12 text-center ring-1 ring-border"
      >
        {fullPage && (
          <div className="text-xl font-black tracking-tight">
            Paper<span className="text-ink-deep">strike</span>
          </div>
        )}
        <h1 className="text-xl font-black">This screen hit a snag</h1>
        <p className="text-sm text-body">
          Your paper account is safe — it&apos;s saved on this machine. Try again, or head
          back to the dashboard.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()} className="rounded-3xl px-5 font-semibold">
            Try again
          </Button>
          <Button asChild variant="secondary" className="rounded-3xl px-5 font-semibold">
            <Link href="/trade">Dashboard</Link>
          </Button>
        </div>
        {error.message && (
          <details className="mt-2 w-full text-left text-xs text-mute">
            <summary className="cursor-pointer font-semibold">Details for a bug report</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{error.message}</pre>
            <a
              href={`${SITE.repo}/issues/new`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-semibold text-ink-deep hover:underline"
            >
              Report it on GitHub ↗
            </a>
          </details>
        )}
      </div>
    </div>
  );
}
