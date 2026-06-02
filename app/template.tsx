"use client";

import { motion, MotionConfig } from "motion/react";

/**
 * A template re-mounts on every navigation, so this gives each route a quick
 * cross-fade in. We fade OPACITY ONLY (no transform) on purpose: a transform on
 * this wrapper would become the containing block for the fixed bottom nav and
 * break its positioning. The richer transform motion lives on inner content.
 *
 * MotionConfig reducedMotion="user" makes every motion component in the tree
 * respect the OS "reduce motion" setting automatically.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
