"use client"; // error boundaries must be client components
// The landing page or the trade layout itself threw.
import { Crash } from "@/components/crash";

export default function AppError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <Crash {...props} fullPage />;
}
