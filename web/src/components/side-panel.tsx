"use client";
// Right-hand slide-in used by the order ticket and the strategy builders.
//
// It's a modal dialog in every way that matters: focus moves in and can't Tab
// out behind it, Escape or a click on the backdrop closes it, the page behind
// doesn't scroll, and focus goes back where it was afterwards. The slide is
// GSAP, skipped when the OS asks for reduced motion.
import { createContext, useCallback, useContext, useEffect, useId, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";
const CloseCtx = createContext<() => void>(() => {});

/** A button inside a SidePanel that does its job, then slides the panel shut. */
export function PanelButton({ onClick, ...props }: React.ComponentProps<typeof Button>) {
  const close = useContext(CloseCtx);
  return (
    <Button
      {...props}
      onClick={(e) => {
        onClick?.(e);
        close();
      }}
    />
  );
}

export function SidePanel({
  title,
  subtitle,
  onClose,
  wide = false,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const titleId = useId();

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reducedMotion()) return onClose();
    gsap.to(backdrop.current, { opacity: 0, duration: 0.2, overwrite: true });
    gsap.to(panel.current, {
      xPercent: 100,
      duration: 0.25,
      ease: "power2.in",
      overwrite: true, // an entrance still playing mustn't fight the exit
      onComplete: onClose,
    });
  }, [onClose]);

  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.from(backdrop.current, { opacity: 0, duration: 0.25 });
    gsap.from(panel.current, { xPercent: 100, opacity: 0.4, duration: 0.4, ease: "power3.out" });
  }, []);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const root = panel.current;
    root?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0 && !el.hasAttribute("disabled") && el.offsetParent !== null
      );
      if (!items.length) return e.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = root.contains(active);
      if (e.shiftKey && (!inside || active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [close]);

  return (
    <>
      <div ref={backdrop} className="fixed inset-0 z-40 bg-ink-dark/30" onClick={close} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full flex-col gap-4 overflow-y-auto bg-card p-6 shadow-2xl outline-none",
          wide ? "max-w-md" : "max-w-sm"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-black">
              {title}
            </h2>
            {subtitle && <div className="text-sm text-body">{subtitle}</div>}
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="shrink-0 rounded-full bg-secondary p-2 transition-colors hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <CloseCtx.Provider value={close}>{children}</CloseCtx.Provider>
      </div>
    </>
  );
}
