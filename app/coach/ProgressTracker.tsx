"use client";

import { calculateWeeklyStreak } from "@/lib/coach/streaks";
import type { WeeklyCheckInEntry } from "./localCoachTypes";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatNumber(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function formatWeightChange(change: number | null): string {
  if (change === null) return "Add weight";
  if (change === 0) return "No change";
  return `${change > 0 ? "+" : ""}${formatNumber(change)} kg`;
}

export default function ProgressTracker({ checkIns }: { checkIns: WeeklyCheckInEntry[] }) {
  const sorted = [...checkIns].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1] ?? null;
  const firstWeight = sorted.find((entry) => entry.weight !== null)?.weight ?? null;
  const latestWeight = [...sorted].reverse().find((entry) => entry.weight !== null)?.weight ?? null;
  const weightChange = firstWeight !== null && latestWeight !== null ? latestWeight - firstWeight : null;
  const avgDiet = average(sorted.map((entry) => entry.dietConsistency));
  const avgWorkouts = average(sorted.map((entry) => entry.workoutsCompleted));
  const streak = calculateWeeklyStreak(checkIns);

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Progress</p>
        <h2 className="font-display text-lg font-semibold text-foreground">Your progress so far</h2>
        <p className="text-sm text-muted-foreground">
          Built from weekly check-ins. No heavy chart library needed yet.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="mt-4 rounded-field border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
          Complete your first weekly check-in to see progress.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="Current weight" value={latestWeight !== null ? `${formatNumber(latestWeight)} kg` : "Not set"} />
            <Metric label="Starting weight" value={firstWeight !== null ? `${formatNumber(firstWeight)} kg` : "Not set"} />
            <Metric label="Change" value={formatWeightChange(weightChange)} />
            <Metric label="Check-ins" value={String(sorted.length)} />
            <Metric label="Avg diet" value={`${formatNumber(avgDiet)}/10`} />
            <Metric label="Avg workouts" value={`${formatNumber(avgWorkouts)}/week`} />
          </div>

          <div className="mt-4 rounded-field bg-primary-soft p-3">
            <p className="text-sm font-semibold text-primary">
              {streak.currentStreak}-week streak
            </p>
            <p className="mt-1 text-sm text-primary">
              Best streak: {streak.bestStreak}. Last check-in: {streak.lastCheckInDate ?? "none"}.
            </p>
            <p className="mt-1 text-sm text-primary">
              {streak.reminderDue
                ? "Your next check-in is due. Keep the promise small and do it today."
                : "You are building consistency. Keep the next week simple."}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">Check-in history</p>
            {[...sorted].reverse().map((entry) => (
              <div key={entry.id} className="rounded-field border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{entry.date}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.workoutsCompleted} workouts, diet {entry.dietConsistency}/10, energy {entry.energyLevel}/10
                    </p>
                  </div>
                  {entry.weight !== null && (
                    <p className="rounded-pill bg-card px-2 py-1 text-xs font-medium text-foreground">
                      {formatNumber(entry.weight)} kg
                    </p>
                  )}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-pill bg-muted">
                  <div
                    className="h-full rounded-pill bg-primary"
                    style={{ width: `${Math.max(8, entry.dietConsistency * 10)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {latest && (
        <div className="mt-4 rounded-field bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Latest coach note</p>
          <p className="mt-1 text-sm text-muted-foreground">{latest.coachFeedback}</p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}
