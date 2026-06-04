"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCheckIns } from "@/lib/coach/checkins";
import { calculateWeeklyStreak } from "@/lib/coach/streaks";
import type { WeeklyCheckInEntry } from "./localCoachTypes";
import type { Lang } from "@/lib/database.types";

/**
 * Phase 7 + 8 — Progress tracking & weekly streak.
 *
 * Self-contained ({lang}); reads check-ins from localStorage. Leads with
 * CONSISTENCY (check-ins, workouts/week, diet) and trends — weight is just one
 * neutral metric, never the emotional centre. The streak card is encouraging
 * and never guilt-based. No DB / AI / auth touched.
 */

function average(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}
function fmt(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

const T = {
  eyebrow: { en: "Progress", roman_urdu: "Progress" },
  title: { en: "Your progress so far", roman_urdu: "Ab tak ki progress" },
  helper: {
    en: "Built from your check-ins. Consistency and trends matter more than any single number.",
    roman_urdu: "Aap ke check-ins se bani. Consistency aur trend kisi ek number se zyada ahem hain.",
  },
  empty: {
    en: "Complete your first weekly check-in to see your progress.",
    roman_urdu: "Pehla weekly check-in mukammal karein, phir progress dikhegi.",
  },
  checkIns: { en: "Check-ins", roman_urdu: "Check-ins" },
  avgWorkouts: { en: "Avg workouts", roman_urdu: "Avg workouts" },
  avgDiet: { en: "Avg consistency", roman_urdu: "Avg consistency" },
  current: { en: "Current weight", roman_urdu: "Mojooda wazan" },
  starting: { en: "Starting weight", roman_urdu: "Shuru ka wazan" },
  change: { en: "Change", roman_urdu: "Farq" },
  notSet: { en: "Not set", roman_urdu: "Set nahi" },
  streak: { en: "week streak", roman_urdu: "hafte ka streak" },
  best: { en: "Best", roman_urdu: "Best" },
  last: { en: "Last check-in", roman_urdu: "Pichla check-in" },
  due: {
    en: "Your next check-in is ready when you are — keep the promise small and do it today.",
    roman_urdu: "Agla check-in jab aap chahein — chota wada rakhein aur aaj kar lein.",
  },
  building: {
    en: "You're building real consistency. Keep next week simple.",
    roman_urdu: "Aap sach mein consistency bana rahe hain. Agla hafta simple rakhein.",
  },
  history: { en: "Check-in history", roman_urdu: "Check-in history" },
  perWeek: { en: "/week", roman_urdu: "/hafta" },
} satisfies Record<string, Record<Lang, string>>;

export default function ProgressTracker({ lang = "en" }: { lang?: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [hydrated, setHydrated] = useState(false);
  const [checkIns, setCheckIns] = useState<WeeklyCheckInEntry[]>([]);

  useEffect(() => {
    setCheckIns(getCheckIns());
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-20 w-full rounded-field" />
      </Card>
    );
  }

  const sorted = [...checkIns].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    return (
      <Card className="space-y-3 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
        <EmptyState icon="📈" title={t("empty")} />
      </Card>
    );
  }

  const firstWeight = sorted.find((e) => e.weight !== null)?.weight ?? null;
  const latestWeight = [...sorted].reverse().find((e) => e.weight !== null)?.weight ?? null;
  const change = firstWeight !== null && latestWeight !== null ? latestWeight - firstWeight : null;
  const avgDiet = average(sorted.map((e) => e.dietConsistency));
  const avgWorkouts = average(sorted.map((e) => e.workoutsCompleted));
  const streak = calculateWeeklyStreak(checkIns);

  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
        <h2 className="font-display text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("helper")}</p>
      </div>

      {/* Streak first — consistency is the headline (Phase 8). */}
      <div className="rounded-field bg-primary-soft p-3">
        <p className="font-display text-xl font-semibold text-primary">
          {streak.currentStreak}-{t("streak")} 🔥
        </p>
        <p className="mt-1 text-sm text-primary">
          {t("best")}: {streak.bestStreak} · {t("last")}: {streak.lastCheckInDate ?? "—"}
        </p>
        <p className="mt-1 text-sm text-primary">{streak.reminderDue ? t("due") : t("building")}</p>
      </div>

      {/* Consistency metrics lead; weight is just neutral data. */}
      <div className="grid grid-cols-3 gap-2">
        <Metric label={t("checkIns")} value={String(sorted.length)} />
        <Metric label={t("avgWorkouts")} value={`${fmt(avgWorkouts)}${t("perWeek")}`} />
        <Metric label={t("avgDiet")} value={`${fmt(avgDiet)}/10`} />
        <Metric label={t("current")} value={latestWeight !== null ? `${fmt(latestWeight)} kg` : t("notSet")} />
        <Metric label={t("starting")} value={firstWeight !== null ? `${fmt(firstWeight)} kg` : t("notSet")} />
        <Metric
          label={t("change")}
          value={change === null ? "—" : `${change > 0 ? "+" : ""}${fmt(change)} kg`}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("history")}</p>
        {[...sorted].reverse().map((entry) => (
          <div key={entry.id} className="rounded-field bg-muted px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{entry.date}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.workoutsCompleted} workouts · diet {entry.dietConsistency}/10 · energy {entry.energyLevel}/10
                </p>
              </div>
              {entry.weight !== null && (
                <span className="rounded-pill bg-card px-2 py-1 text-xs font-medium tabular-nums text-foreground">
                  {fmt(entry.weight)} kg
                </span>
              )}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-pill bg-background">
              <div
                className="h-full rounded-pill bg-primary"
                style={{ width: `${Math.max(8, entry.dietConsistency * 10)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field bg-muted px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
