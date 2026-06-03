"use client";

import { motion } from "motion/react";
import { fadeUp } from "@/lib/motion";

// Wraps content in the house fade-up entrance. Handy for animating server
// components (which can't use motion directly) by nesting their content here.
export function FadeIn({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}
