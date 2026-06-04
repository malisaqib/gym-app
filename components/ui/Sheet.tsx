"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { springSoft } from "@/lib/motion";
import { haptic } from "@/lib/haptics";

/**
 * iOS-style bottom sheet. Slides up over a blurred dim backdrop, can be flicked
 * or dragged down to dismiss, locks the page behind it, and respects the home
 * indicator safe area. Reduced-motion users get a plain fade via MotionConfig.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  // Lock background scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function onDragEnd(_: unknown, info: PanInfo) {
    // Dismiss on a downward flick or a big drag.
    if (info.offset.y > 120 || info.velocity.y > 600) {
      haptic("tap");
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] border-t border-border bg-card pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-pop"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={springSoft}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
          >
            {/* Grabber */}
            <div className="sticky top-0 flex justify-center rounded-t-[1.75rem] bg-card pt-3">
              <span className="h-1.5 w-10 rounded-full bg-border" aria-hidden />
            </div>
            <div className="px-5 pt-2">
              {title && (
                <h3 className="mb-3 font-display text-lg font-semibold tracking-tight text-foreground">{title}</h3>
              )}
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
