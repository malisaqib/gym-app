"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from "motion/react";

/**
 * Animates a number from its previous value to the new one (counting up/down)
 * with a gentle spring. Jumps instantly when the user prefers reduced motion.
 */
export function Counter({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toString());
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { type: "spring", stiffness: 120, damping: 24 });
    return () => controls.stop();
  }, [value, reduce, mv]);

  return <motion.span className={className}>{text}</motion.span>;
}
