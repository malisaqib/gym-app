"use client";

import { useEffect, useState } from "react";
import type { BodyweightLog } from "@/lib/database.types";
import { toSeries, weightChange, latestWeight } from "@/lib/weight/series";
import { getWeightLogs, logWeight, deleteWeight } from "./actions";
import WeightChart from "./WeightChart";
import BottomNav from "@/components/BottomNav";

function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function WeightTracker({ startWeight }: { startWeight: number | null }) {
  const [logs, setLogs] = useState<BodyweightLog[]>([]);
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWeightLogs().then(setLogs);
  }, []);

  const series = toSeries(logs);
  const latest = latestWeight(series) ?? startWeight;
  const change = weightChange(series);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!weight.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await logWeight({ weight: Number(weight), date: localDateString() });
      if (res.ok) {
        // Replace any existing entry for the same day, then append.
        setLogs((prev) => [...prev.filter((l) => l.logged_on !== res.item.logged_on), res.item]);
        setWeight("");
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await deleteWeight(id);
      if (res.ok) setLogs((prev) => prev.filter((l) => l.id !== id));
    } finally {
      setBusy(false);
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
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !weight.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
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
                disabled={busy}
                className="text-xs text-red-500"
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
