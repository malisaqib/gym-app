"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";

/**
 * A slim current-week date strip (Mon–Sun) with today highlighted — the
 * Apple-Fitness day header. PURELY VISUAL and PROP-DRIVEN: deriving from
 * `new Date()` in render made the server (UTC) and client (user timezone)
 * disagree around date boundaries → hydration mismatch + the wrong day lit.
 * The caller passes the user's local YYYY-MM-DD (timezone-cookie-aware), so
 * both renders are identical.
 */
export function WeekStrip({ today, className }: { today: string; className?: string }) {
  const days = useMemo(() => {
    // Parse as a LOCAL calendar date (T00:00:00 avoids UTC shifting the day).
    const now = new Date(`${today}T00:00:00`);
    if (Number.isNaN(now.getTime())) return [];
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
  }, [today]);

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
