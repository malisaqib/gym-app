"use client";

import { useState } from "react";
import type { BodyweightLog } from "@/lib/database.types";
import { toSeries, weightChange, latestWeight } from "@/lib/weight/series";
import { logWeight, deleteWeight } from "./actions";
import WeightChart from "./WeightChart";
import BottomNav from "@/components/BottomNav";

export default function WeightTracker({
  startWeight,
  initialLogs,
  today,
}: {
  startWeight: number | null;
  initialLogs: BodyweightLog[];
  today: string;
}) {
  // Seeded from the server — no mount fetch.
  const [logs, setLogs] = useState<BodyweightLog[]>(initialLogs);
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);

  const series = toSeries(logs);
  const latest = latestWeight(series) ?? startWeight;
  const change = weightChange(series);

  // OPTIMISTIC: chart + current weight update on tap, then reconcile / roll back.
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(weight);
    if (!weight.trim()) return;

    const snapshot = logs;
    const tempId = crypto.randomUUID();
    const optimistic: BodyweightLog = {
      id: tempId,
      user_id: "",
      weight_kg: value,
      logged_on: today,
      created_at: new Date().toISOString(),
    };
    // One entry per day: drop any existing entry for today, then add this one.
    setLogs((prev) => [...prev.filter((l) => l.logged_on !== today), optimistic]);
    setWeight("");
    setError(null);

    const res = await logWeight({ weight: value, date: today });
    if (res.ok) {
      setLogs((prev) => prev.map((l) => (l.id === tempId ? res.item : l)));
    } else {
      setLogs(snapshot);
      setError(res.error);
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
    <>
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 pb-24 pt-8">
        <h1 className="text-2xl font-bold">Weight</h1>

      {/* Summary */}
      <div className="flex items-end gap-4">
        <div>
          <p className="text-xs text-slate-500">Current</p>
          <p className="text-3xl font-bold text-slate-800">
            {latest ?? "—"}
            <span className="ml-1 text-sm font-normal text-slate-400">kg</span>
          </p>
        </div>
        {change !== null && (
          <p className={`pb-1 text-sm font-medium ${change <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
            {change <= 0 ? "▼" : "▲"} {Math.abs(change)} kg since start
          </p>
        )}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
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
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!weight.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-40"
        >
          Log
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* History */}
      {history.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-700">History</h2>
          {history.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span className="text-slate-500">{l.logged_on}</span>
              <span className="font-medium text-slate-800">{l.weight_kg} kg</span>
              <button
                onClick={() => remove(l.id)}
                className="text-xs text-red-500 active:scale-95"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      </main>
      <BottomNav />
    </>
  );
}
