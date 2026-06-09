"use client";

import { motion, useReducedMotion } from "motion/react";
import { springGentle } from "@/lib/motion";
import { cn } from "@/lib/cn";

interface ActivityRingProps {
  /** Progress so far (e.g. calories eaten). */
  value: number;
  /** Target (e.g. daily calorie goal). */
  max: number;
  /** Vivid stroke colour — any CSS colour. Defaults to our emerald token. */
  color?: string;
  /** Faint background track colour. */
  trackColor?: string;
  /** Outer diameter in px. */
  size?: number;
  /** Ring thickness in px (thick + rounded = the signature look). */
  stroke?: number;
  /** Soft coloured glow on the filled arc (the "lit" look on black). */
  glow?: boolean;
  /** Rounded end-caps (default true). */
  rounded?: boolean;
  /** Delay before the fill animates (for staggering concentric rings). */
  delay?: number;
  /** Centre content (e.g. the big metric number). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The signature animated activity ring. An SVG arc that springs to fill around
 * the circle (stroke-dasharray/offset) with a gentle spring, thick rounded caps,
 * and an optional coloured glow. Animates only stroke-dashoffset + a static
 * filter (GPU-friendly, holds 60fps), and snaps instantly under reduced motion.
 *
 * Pure presentation — value/max are passed in; it computes no app data.
 */
export function ActivityRing({
  value,
  max,
  color = "rgb(var(--ring-1))",
  trackColor = "rgb(255 255 255 / 0.08)",
  size = 220,
  stroke = 22,
  glow = true,
  rounded = true,
  delay = 0,
  children,
  className,
}: ActivityRingProps) {
  const reduce = useReducedMotion();

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const safeMax = max > 0 ? max : 1;
  const fraction = Math.max(0, Math.min(value / safeMax, 1)); // cap visual fill at 100%
  const offset = circumference * (1 - fraction);
  const cap = rounded ? "round" : "butt";

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {/* -rotate-90 so the arc starts at 12 o'clock and fills clockwise.
          overflow-visible lets the coloured glow fade softly past the ring
          instead of being clipped to the SVG box (a hard edge that wouldn't
          blend into the surface behind it). */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={trackColor} strokeLinecap={cap} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeLinecap={cap}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduce ? offset : circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={reduce ? { duration: 0 } : { ...springGentle, delay }}
          style={glow ? { filter: `drop-shadow(0 0 ${Math.round(stroke * 0.45)}px ${color})` } : undefined}
        />
      </svg>
      {children != null && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}
