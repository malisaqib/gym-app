"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { Counter } from "@/components/ui/Counter";

interface ProgressRingProps {
  value: number; // eaten so far
  max: number; // daily target
  label: string; // "Calories" / "Protein"
  unit: string; // "kcal" / "g"
  tone?: "primary" | "accent";
  size?: number;
}

/**
 * Circular progress for a daily metric. The arc springs to fill (from empty on
 * first paint, smoothly when the value changes) and the centre number counts to
 * its value. Going over turns it amber, backed by text (never colour alone).
 */
export function ProgressRing({
  value,
  max,
  label,
  unit,
  tone = "primary",
  size = 128,
}: ProgressRingProps) {
  const reduce = useReducedMotion();
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const safeMax = max > 0 ? max : 1;
  const fraction = Math.min(value / safeMax, 1);
  const over = max > 0 && value > max;
  const dashOffset = circumference * (1 - fraction);
  const left = Math.round(max - value);

  const arcColor = over ? "text-warning" : tone === "accent" ? "text-accent" : "text-primary";

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>

      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            stroke="currentColor"
            className="text-border"
          />
          {/* value arc — springs to fill */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20 }}
            className={cn(arcColor)}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Counter value={value} className="text-2xl font-extrabold tabular-nums text-foreground" />
          <span className="text-[11px] text-muted-foreground">
            / {max} {unit}
          </span>
        </div>
      </div>

      <p className={cn("text-xs font-medium", over ? "text-warning" : "text-muted-foreground")}>
        {over ? `${Math.abs(left)} ${unit} over` : `${left} ${unit} left`}
      </p>
    </div>
  );
}
