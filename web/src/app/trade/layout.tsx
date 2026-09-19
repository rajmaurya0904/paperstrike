"use client";
import { MarketProvider } from "@/lib/market";
import { PaperProvider } from "@/lib/paper";
import { AutoTradeProvider } from "@/lib/autotrade";
import { Shell } from "@/components/shell";

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <PaperProvider>
        {/* armed breakout plans must keep watching whatever page you're on */}
        <AutoTradeProvider>
          <Shell>{children}</Shell>
        </AutoTradeProvider>
      </PaperProvider>
    </MarketProvider>
  );
}
