// FAQ on native <details>/<summary>.
//
// The browser already owns disclosure: open/close state, keyboard handling,
// focus, and the screen-reader semantics. So this needs no accordion component,
// no Radix primitive and no client JavaScript at all — it renders on the server
// and works with JS disabled.
//
// ponytail: no height animation. <details> can't transition its own content
// without ::details-content + interpolate-size, which isn't broadly shipped yet;
// the chevron rotation reads as responsive enough. Swap in that CSS pair once
// it's safe to rely on.

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QA {
  q: string;
  a: React.ReactNode;
}

export function Faq({
  heading,
  items,
  className,
}: {
  heading: React.ReactNode;
  items: QA[];
  className?: string;
}) {
  return (
    <section className={cn("w-full py-16", className)}>
      <div className="mx-auto w-full max-w-3xl px-4">
        <h2 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          {heading}
        </h2>
        <div className="mt-8 flex flex-col gap-3">
          {items.map((it) => (
            <details
              key={it.q}
              className="group rounded-3xl bg-card p-5 ring-1 ring-border transition-colors open:bg-secondary"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold [&::-webkit-details-marker]:hidden">
                {it.q}
                <ChevronDown
                  aria-hidden
                  className="size-5 shrink-0 text-mute transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="mt-3 text-sm leading-relaxed text-body">{it.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
