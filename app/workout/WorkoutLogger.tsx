"use client";

import { useState } from "react";
import { WORKOUTS, type Exercise, type WorkoutDay } from "@/lib/workouts/program";
import { suggestProgression } from "@/lib/workouts/progression";
import type { WorkoutLog } from "@/lib/database.types";
import { type ExerciseHistory } from "@/lib/workouts/history";
import { logSet, deleteSet } from "./actions";
import BottomNav from "@/components/BottomNav";

const emptyHistory: ExerciseHistory = { today: [], lastSessionDate: null, lastSessionSets: [] };

export default function WorkoutLogger({
  initialHistory,
  today,
}: {
  initialHistory: Record<string, ExerciseHistory>;
  today: string;
}) {
  const [day, setDay] = useState<WorkoutDay>("A");
  // Seeded from the server — no mount fetch.
  const [history, setHistory] = useState<Record<string, ExerciseHistory>>(initialHistory);

  const workout = WORKOUTS[day];

  // Update one exercise's today-list after an optimistic add/replace/remove.
  function setToday(name: string, updater: (sets: WorkoutLog[]) => WorkoutLog[]) {
    setHistory((prev) => {
      const entry = prev[name] ?? emptyHistory;
      return { ...prev, [name]: { ...entry, today: updater(entry.today) } };
    });
  }

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 pb-24 pt-8">
        <h1 className="text-2xl font-bold">Workout</h1>

        {/* A / B day switch */}
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
          {(["A", "B"] as WorkoutDay[]).map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              className={`flex-1 px-3 py-2 font-medium transition active:scale-[0.98] ${
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
              today={today}
              history={history[ex.name] ?? emptyHistory}
              onAdd={(item) => setToday(ex.name, (s) => [...s, item])}
              onReplace={(tempId, item) =>
                setToday(ex.name, (s) => s.map((x) => (x.id === tempId ? item : x)))
              }
              onRemove={(id) => setToday(ex.name, (s) => s.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      </main>
      <BottomNav />
    </>
  );
}

function ExerciseCard({
  exercise,
  today,
  history,
  onAdd,
  onReplace,
  onRemove,
}: {
  exercise: Exercise;
  today: string;
  history: ExerciseHistory;
  onAdd: (item: WorkoutLog) => void;
  onReplace: (tempId: string, item: WorkoutLog) => void;
  onRemove: (id: string) => void;
}) {
  const [reps, setReps] = useState("");
  const [error, setError] = useState<string | null>(null);

  const unit = exercise.repUnit === "seconds" ? "sec" : "reps";
  const advice = suggestProgression(
    history.lastSessionSets.map((s) => ({ reps: s.reps ?? 0 })),
    { sets: exercise.sets, repMax: exercise.repMax, repUnit: exercise.repUnit, harder: exercise.harder }
  );

  // OPTIMISTIC: the set chip appears instantly, then reconciles / rolls back.
  async function addSet() {
    const n = Number(reps);
    if (!Number.isFinite(n) || n <= 0) {
      setError(`Enter ${unit}.`);
      return;
    }
    const tempId = crypto.randomUUID();
    const setNumber = history.today.length + 1;
    const optimistic: WorkoutLog = {
      id: tempId,
      user_id: "",
      workout_id: null,
      exercise_name: exercise.name,
      performed_on: today,
      set_number: setNumber,
      reps: n,
      weight_kg: null,
      created_at: new Date().toISOString(),
    };
    onAdd(optimistic);
    setReps("");
    setError(null);

    const res = await logSet({ exerciseName: exercise.name, reps: n, setNumber, date: today });
    if (res.ok) onReplace(tempId, res.item);
    else {
      onRemove(tempId);
      setError(res.error);
    }
  }

  async function removeSet(id: string) {
    const snapshot = history.today.find((s) => s.id === id);
    onRemove(id);
    const res = await deleteSet(id);
    if (!res.ok && snapshot) onAdd(snapshot); // roll back
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
                className="text-red-500 active:scale-90"
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
        />
        <button
          onClick={addSet}
          disabled={!reps}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-40"
        >
          Add set
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
