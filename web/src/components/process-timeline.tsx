"use client";
// Sticky horizontal process timeline: the panel holds still while the cards
// track sideways with the scroll.
//
// Adapted from the 21st.dev "Process Timeline" (@youcefbnm). The original drives
// it with motion/react's useScroll plus @uidotdev/usehooks for measurement —
// two dependencies this project doesn't carry, and it reads window.innerWidth
// during render, which breaks SSR.
//
// The stickiness is plain CSS `position: sticky` inside a tall in-flow wrapper,
// NOT ScrollTrigger's `pin`. Pinning was the first attempt and it overlapped the
// sections below: pin swaps the element to `position: fixed` and leaves a
// pin-spacer behind to hold the gap, but this sits inside the landing page's
// `flex flex-col` root, where the spacer becomes a flex item and stops reserving
// height. Sticky needs no spacer, so it can't fall out of sync. GSAP is left
// doing the one thing CSS can't portably do yet — scrubbing the x transform.

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export interface Step {
  title: string;
  body: string;
}

export function ProcessTimeline({
  heading,
  intro,
  steps,
  className,
}: {
  heading: React.ReactNode;
  intro?: string;
  steps: Step[];
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      // only scrub on a real viewport, and never when reduced motion is asked
      // for — below md the cards just stack and scroll normally
      mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const el = track.current;
        if (!el) return;
        const distance = () => Math.max(0, el.scrollWidth - el.clientWidth);
        if (!distance()) return; // already fits — nothing to scrub
        gsap.to(el, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: outer.current,
            start: "top top", // sticky engages
            end: "bottom bottom", // sticky releases
            scrub: 0.6,
            invalidateOnRefresh: true, // re-measure on resize instead of going stale
          },
        });
      });
      return () => mm.revert();
    },
    { scope: outer }
  );

  return (
    <section className={cn("w-full", className)}>
      {/* tall, in-flow wrapper — its height is how long the panel stays stuck */}
      <div ref={outer} className="relative md:h-[240vh]">
        <div className="md:sticky md:top-0 md:flex md:h-screen md:flex-col md:justify-center md:overflow-hidden">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-0">
            <h2 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
              {heading}
            </h2>
            {intro && <p className="mt-3 max-w-lg text-body">{intro}</p>}

            <div
              ref={track}
              className="mt-10 flex flex-col gap-4 md:flex-row md:flex-nowrap md:will-change-transform"
            >
              {steps.map((s, i) => (
                <article
                  key={s.title}
                  className={cn(
                    "flex shrink-0 gap-5 rounded-3xl p-6 ring-1 ring-border md:w-[26rem]",
                    // alternate fills so the row reads as distinct cards while it slides
                    i % 2 === 0 ? "bg-card" : "bg-secondary"
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-dark font-mono text-sm font-bold text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-xl font-black leading-tight">{s.title}</h3>
                    <p className="mt-2 text-sm text-body">{s.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
