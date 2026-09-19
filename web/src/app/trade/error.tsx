"use client"; // error boundaries must be client components
// A page under /trade threw. This renders inside the trade layout, so the nav
// and the live feed keep working around it.
import { Crash } from "@/components/crash";

export default function TradeError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <Crash {...props} />;
}
