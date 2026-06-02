"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORKOUTS, ALL_EXERCISE_NAMES, type Exercise, type WorkoutDay } from "@/lib/workouts/program";
import { suggestProgression } from "@/lib/workouts/progression";
import type { WorkoutLog } from "@/lib/database.types";
import { getExerciseHistory, logSet, deleteSet, type ExerciseHistory } from "./actions";

function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const emptyHistory: ExerciseHistory = { today: [], lastSessionDate: null, lastSessionSets: [] };

export default function WorkoutLogger() {
  const [date, setDate] = useState<string | null>(null);
  const [day, setDay] = useState<WorkoutDay>("A");
  const [history, setHistory] = useState<Record<string, ExerciseHistory>>({});

  // Load history for all exercises (both days) once we know the local date.
  useEffect(() => {
    const today = localDateString();
    setDate(today);
    getExerciseHistory(ALL_EXERCISE_NAMES, today).then(setHistory);
  }, []);

  const workout = WORKOUTS[day];

  // Update one exercise's today-list after a log/delete.
  function setToday(name: string, updater: (sets: WorkoutLog[]) => WorkoutLog[]) {
    setHistory((prev) => {
      const entry = prev[name] ?? emptyHistory;
      return { ...prev, [name]: { ...entry, today: updater(entry.today) } };
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workout</h1>
        <Link href="/dashboard" className="text-sm text-emerald-700 underline">
          Dashboard
        </Link>
      </header>

      {/* A / B day switch */}
      <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
        {(["A", "B"] as WorkoutDay[]).map((d) => (
          <button
            key={d}
            onClick={() => setDay(d)}
            className={`flex-1 px-3 py-2 font-medium ${
              day === d ? "bg-emerald-600 text-white" : "text-slate-600"
            }`}
          >
            {WORKOUTS[d].title}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {workout.exercises.map((ex) => (
          <ExerciseCard
            key={ex.key}
            exercise={ex}
            date={date}
            history={history[ex.name] ?? emptyHistory}
            onLogged={(item) => setToday(ex.name, (s) => [...s, item])}
            onDeleted={(id) => setToday(ex.name, (s) => s.filter((x) => x.id !== id))}
          />
        ))}
      </div>
    </main>
  );
}

function ExerciseCard({
  exercise,
  date,
  history,
  onLogged,
  onDeleted,
}: {
  exercise: Exercise;
  date: string | null;
  history: ExerciseHistory;
  onLogged: (item: WorkoutLog) => void;
  onDeleted: (id: string) => void;
}) {
  const [reps, setReps] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = exercise.repUnit === "seconds" ? "sec" : "reps";
  const advice = suggestProgression(
    history.lastSessionSets.map((s) => ({ reps: s.reps ?? 0 })),
    { sets: exercise.sets, repMax: exercise.repMax, repUnit: exercise.repUnit, harder: exercise.harder }
  );

  async function addSet() {
    const n = Number(reps);
    if (!Number.isFinite(n) || n <= 0 || !date) {
      setError(`Enter ${unit}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await logSet({
        exerciseName: exercise.name,
        reps: n,
        setNumber: history.today.length + 1,
        date,
      });
      if (res.ok) {
        onLogged(res.item);
        setReps("");
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeSet(id: string) {
    setBusy(true);
    try {
      const res = await deleteSet(id);
      if (res.ok) onDeleted(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">{exercise.name}</p>
          <p className="text-xs text-slate-500">{exercise.muscle}</p>
        </div>
        <a
          href={exercise.youtube}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-medium text-emerald-700 underline"
        >
          ▶ Form
        </a>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Target: {exercise.sets} sets × {exercise.repMin}–{exercise.repMax} {unit}
        {exercise.perSide ? " per side" : ""}
      </p>

      {/* Progression hint from last session */}
      <p className={`mt-1 text-xs ${advice.graduate ? "text-emerald-700" : "text-slate-500"}`}>
        {advice.message}
      </p>

      {/* Today's sets */}
      {history.today.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {history.today.map((s, i) => (
            <span
              key={s.id}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
            >
              Set {i + 1}: {s.reps} {unit}
              <button
                onClick={() => removeSet(s.id)}
                disabled={busy}
                className="text-red-500"
                aria-label="Delete set"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add a set */}
      <div className="mt-3 flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder={unit}
          className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none"
          disabled={busy}
        />
        <button
          onClick={addSet}
          disabled={busy || !reps}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
        >
          Add set
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
