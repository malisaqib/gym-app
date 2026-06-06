"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { BodyweightLog } from "@/lib/database.types";
import { listContainer, listItem } from "@/lib/motion";
import { toSeries, weightChange, latestWeight } from "@/lib/weight/series";
import { localDateString } from "@/lib/localDate";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { logWeight, deleteWeight } from "./actions";
import WeightChart from "./WeightChart";

export default function WeightTracker({
  startWeight,
  initialLogs,
}: {
  startWeight: number | null;
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
      <h2 className="font-display text-xl font-semibold text-foreground">Weight</h2>

        {/* Summary */}
        <div className="flex items-end gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {latest ?? "—"}
              <span className="ml-1 text-sm font-normal text-muted-foreground">kg</span>
            </p>
          </div>
          {change !== null && (
            <p className={`pb-1 text-sm font-medium ${change <= 0 ? "text-success" : "text-warning"}`}>
              {change <= 0 ? "▼" : "▲"} {Math.abs(change)} kg since start
            </p>
          )}
        </div>

        {/* Chart */}
        <div className="rounded-card border border-border bg-card p-3 shadow-soft">
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
                    className="flex items-center justify-between rounded-card border border-border bg-card px-3 py-2 text-sm"
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
