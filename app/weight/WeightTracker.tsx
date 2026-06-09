"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { BodyweightLog } from "@/lib/database.types";
import { listContainer, listItem } from "@/lib/motion";
import { toSeries, weightChange, latestWeight } from "@/lib/weight/series";
import { localDateString } from "@/lib/localDate";
import { Button } from "@/components/ui/Button";
import { ActivityRing } from "@/components/ui/ActivityRing";
import { TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "@/lib/toast";
import { logWeight, deleteWeight } from "./actions";
import WeightChart from "./WeightChart";

export default function WeightTracker({
  startWeight,
  goalWeight,
  initialLogs,
}: {
  startWeight: number | null;
  goalWeight?: number | null;
  initialLogs: BodyweightLog[];
}) {
  // Seeded from the server — no mount fetch.
  const [logs, setLogs] = useState<BodyweightLog[]>(initialLogs);
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const series = toSeries(logs);
  const latest = latestWeight(series) ?? startWeight;
  const change = weightChange(series);

  // Progress toward goal: how far from start → goal we are (works either
  // direction). Null when we can't compute it (no goal / no movement window).
  const goalFrac =
    latest != null && goalWeight != null && startWeight != null && startWeight !== goalWeight
      ? Math.max(0, Math.min(1, (startWeight - latest) / (startWeight - goalWeight)))
      : null;

  // OPTIMISTIC: chart + current weight update on tap, then reconcile / roll back.
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(weight);
    if (!weight.trim() || saving) return; // guard blocks rapid double-submits

    // Use the LIVE local day at submit, never a date frozen at page render
    // (which goes stale across midnight / before the tz cookie is set).
    const date = localDateString();
    const snapshot = logs;
    const tempId = crypto.randomUUID();
    const optimistic: BodyweightLog = {
      id: tempId,
      user_id: "",
      weight_kg: value,
      logged_on: date,
      created_at: new Date().toISOString(),
    };
    setLogs((prev) => [...prev.filter((l) => l.logged_on !== date), optimistic]);
    setWeight("");
    setError(null);
    setSaving(true);

    try {
      const res = await logWeight({ weight: value, date });
      if (res.ok) {
        setLogs((prev) => prev.map((l) => (l.id === tempId ? res.item : l)));
      } else {
        setLogs(snapshot);
        setError(res.error);
        toast.error(res.error);
      }
    } catch {
      setLogs(snapshot);
      const message = "Couldn't save your weight. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const snapshot = logs;
    setLogs((prev) => prev.filter((l) => l.id !== id));
    const res = await deleteWeight(id);
    if (!res.ok) {
      setLogs(snapshot);
      setError(res.error ?? "Couldn't delete that.");
    }
  }

  // Most recent first for the history list.
  const history = [...logs].sort((a, b) =>
    a.logged_on === b.logged_on
      ? b.created_at.localeCompare(a.created_at)
      : b.logged_on.localeCompare(a.logged_on)
  );

  return (
    <section className="flex flex-col gap-5">
      {/* Hero: goal-progress ring + big current-weight metric. */}
      <div className="flex items-center gap-5 rounded-card-xl border border-border bg-card p-5">
        {goalFrac != null && (
          <ActivityRing value={goalFrac * 100} max={100} color="rgb(var(--ring-1))" size={104} stroke={12}>
            <span className="stat-value text-lg text-foreground">{Math.round(goalFrac * 100)}%</span>
          </ActivityRing>
        )}
        <div className="min-w-0">
          <p className="stat-label">Current weight</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="stat-value text-5xl tabular-nums text-foreground">{latest ?? "—"}</span>
            <span className="text-base font-semibold text-muted-foreground">kg</span>
          </div>
          {change !== null && (
            <p className={`mt-1 inline-flex items-center gap-1 text-sm font-semibold ${change <= 0 ? "text-primary" : "text-accent"}`}>
              {change <= 0 ? <TrendingDown size={14} aria-hidden /> : <TrendingUp size={14} aria-hidden />}
              {Math.abs(change)} kg since start
            </p>
          )}
          {goalWeight != null && <p className="mt-0.5 text-xs text-muted-foreground">Goal {goalWeight} kg</p>}
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-card-lg border border-border bg-card p-4">
        <WeightChart series={series} />
      </div>

        {/* Log today's weight */}
        <form onSubmit={add} className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={startWeight ? `e.g. ${startWeight}` : "Today's weight (kg)"}
            className="flex-1 rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
          <Button type="submit" loading={saving} disabled={saving || !weight.trim()}>
            Log
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* History */}
        {history.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">History</h2>
            <motion.div
              variants={listContainer}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-2"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {history.map((l) => (
                  <motion.div
                    key={l.id}
                    variants={listItem}
                    exit="exit"
                    layout
                    className="flex items-center justify-between rounded-card-lg border border-border bg-card px-3 py-2.5 text-sm"
                  >
                    <span className="text-muted-foreground">{l.logged_on}</span>
                    <span className="font-medium tabular-nums text-foreground">{l.weight_kg} kg</span>
                    <button onClick={() => remove(l.id)} className="text-xs text-destructive active:scale-95">
                      Delete
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
    </section>
  );
}
