"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { subscribeToToasts, type ToastItem } from "@/lib/toast";

/**
 * The single toast renderer. Mounted once in the root layout; listens to the
 * toast bus and shows a small stack at the bottom (above the tab bar / home
 * indicator). Each toast auto-dismisses; tapping dismisses early. Motion is
 * GPU-only (opacity + y) and respects reduced-motion via the app's MotionConfig.
 */
const DURATION_MS = 3500;

const toneStyles: Record<ToastItem["tone"], string> = {
  success: "bg-success text-white",
  error: "bg-destructive text-destructive-foreground",
  info: "bg-foreground text-background",
};

const toneIcon: Record<ToastItem["tone"], string> = {
  success: "✓",
  error: "!",
  info: "i",
};

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToToasts((toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, DURATION_MS);
    });
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            layout
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.15 } }}
            transition={spring}
            onClick={() => dismiss(t.id)}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-field px-4 py-3 text-left text-sm font-medium shadow-pop",
              toneStyles[t.tone]
            )}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
              {toneIcon[t.tone]}
            </span>
            <span className="min-w-0 flex-1">{t.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
