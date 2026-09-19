"use client";
// Scroll reveal: fade + un-blur content as it scrolls into view, with an
// optional stagger by index.
//
// Adapted from the 21st.dev "Reveal" component (@asanshay), which drives it with
// motion/react. That package isn't in this project and a fade-and-blur doesn't
// justify adding an animation library — IntersectionObserver plus a CSS
// transition is the same effect natively, and it costs nothing at runtime.
// The prop shape is kept identical so the original is a drop-in replacement.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function Reveal({
  children,
  className,
  index = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** stagger position — each step delays the transition a little further */
  index?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setShown(true);
        io.disconnect(); // once only — this isn't a scroll-linked effect
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 70}ms` }}
      className={cn(
        // motion-safe: users who ask for reduced motion just get the content
        "motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-out",
        shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-4 opacity-0 blur-[6px]",
        className
      )}
    >
      {children}
    </div>
  );
}
