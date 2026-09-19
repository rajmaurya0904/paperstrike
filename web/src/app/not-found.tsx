import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <div className="text-xl font-black tracking-tight">
        Paper<span className="text-ink-deep">strike</span>
      </div>
      <p className="font-mono text-6xl font-black text-mute">404</p>
      <h1 className="text-2xl font-black">This page isn&apos;t on the chain.</h1>
      <p className="max-w-sm text-sm text-body">The link may be old or mistyped.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button asChild className="rounded-3xl px-5 font-semibold">
          <Link href="/trade">Open the app</Link>
        </Button>
        <Button asChild variant="secondary" className="rounded-3xl px-5 font-semibold">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
