"use client";
// In-app replacement for window.confirm(). Same one-line call site —
// `if (await ask({ ... })) doIt()` — but it matches the app, Cancel has focus
// by default, and screen readers announce it as a dialog.
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface Ask {
  title: string;
  description?: React.ReactNode;
  confirm: string;
  destructive?: boolean;
}

export function useConfirm() {
  const [open, setOpen] = useState(false);
  // kept after closing so the text doesn't vanish mid fade-out
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((ok: boolean) => void) | undefined>(undefined);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = undefined;
    setOpen(false);
  }, []);

  const confirm = useCallback(
    (a: Ask) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setAsk(a);
        setOpen(true);
      }),
    []
  );

  const dialog = (
    <Dialog open={open} onOpenChange={(o) => !o && settle(false)}>
      <DialogContent showCloseButton={false} className="gap-5 rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-black">{ask?.title}</DialogTitle>
          {ask?.description && (
            <DialogDescription className="text-sm text-body">{ask.description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            className="h-10 rounded-3xl px-5 font-semibold"
            onClick={() => settle(false)}
          >
            Cancel
          </Button>
          <Button
            className={cn(
              "h-10 rounded-3xl px-5 font-semibold",
              ask?.destructive && "bg-negative text-on-negative hover:bg-negative/85"
            )}
            onClick={() => settle(true)}
          >
            {ask?.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return [confirm, dialog] as const;
}

/** The same question from every "Reset account" button. */
export const RESET_ACCOUNT: Ask = {
  title: "Reset this paper account?",
  description:
    "Your balance goes back to the starting capital, and every position, order and trade is deleted. This can't be undone.",
  confirm: "Reset account",
  destructive: true,
};
