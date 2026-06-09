"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";

/**
 * A slim current-week date strip (Mon–Sun) with today highlighted — the
 * Apple-Fitness day header. PURELY VISUAL: it derives only from the local date,
 * fabricates no per-day metrics, and isn't interactive. No app data involved.
 */
export function WeekStrip({ className }: { className?: string }) {
  const days = useMemo(() => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // 0 = Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        initial: ["M", "T", "W", "T", "F", "S", "S"][i],
        date: d.getDate(),
        isToday: d.toDateString() === now.toDateString(),
      };
    });
  }, []);

  return (
    <div className={cn("flex items-stretch justify-between gap-1.5", className)} aria-hidden>
      {days.map((d, i) => (
        <div
          key={i}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 rounded-card-lg py-2 transition-colors",
            d.isToday ? "bg-primary/10" : ""
          )}
        >
          <span className="stat-label text-[10px]">{d.initial}</span>
          <span
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full text-sm font-semibold tabular-nums",
              d.isToday ? "bg-primary text-primary-foreground shadow-glow-primary" : "text-foreground"
            )}
          >
            {d.date}
          </span>
        </div>
      ))}
    </div>
  );
}
