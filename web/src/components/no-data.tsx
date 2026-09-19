"use client";
// Shown wherever market data would go when the feed isn't delivering. The app
// never substitutes made-up prices, so every such screen lands here instead.
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useFeedStatus } from "@/lib/market";
import { cn } from "@/lib/utils";

export function NoData({
  what = "Market data",
  className,
}: {
  what?: string;
  className?: string;
}) {
  const status = useFeedStatus();
  const connecting = status === "connecting";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-3xl bg-card px-6 py-14 text-center ring-1 ring-border",
        className
      )}
    >
      <div className="rounded-full bg-secondary p-3 text-mute">
        <WifiOff className={cn("h-5 w-5", connecting && "animate-pulse")} />
      </div>
      <div>
        <div className="font-bold">
          {connecting ? `Connecting to the feed…` : `No data available`}
        </div>
        <p className="mx-auto mt-1 max-w-sm text-sm text-body">
          {connecting
            ? `Waiting for ${what.toLowerCase()} from your broker feed.`
            : `${what} needs a live broker feed. Either no broker is connected, the data service is unreachable, or your broker token has expired.`}
        </p>
      </div>
      {!connecting && (
        <Link
          href="/trade/settings"
          className="rounded-3xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          Connect broker
        </Link>
      )}
    </div>
  );
}
