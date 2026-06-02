"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { WORKOUTS, type Exercise, type WorkoutDay } from "@/lib/workouts/program";
import { suggestProgression } from "@/lib/workouts/progression";
import type { WorkoutLog } from "@/lib/database.types";
import { type ExerciseHistory } from "@/lib/workouts/history";
import { listContainer, listItem, spring } from "@/lib/motion";
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
        <h1 className="font-display text-2xl font-semibold text-foreground">Workout</h1>

        {/* A / B day switch */}
        <div className="flex overflow-hidden rounded-field border border-border text-sm">
          {(["A", "B"] as WorkoutDay[]).map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              className={`flex-1 px-3 py-2 font-medium transition active:scale-[0.98] ${
                day === d ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {WORKOUTS[d].title}
            </button>
          ))}
        </div>

        {/* Cards re-stagger when you switch day (keyed by day). */}
        <motion.div
          key={day}
          variants={listContainer}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-4"
        >
          {workout.exercises.map((ex) => (
            <motion.div key={ex.key} variants={listItem}>
              <ExerciseCard
                exercise={ex}
                today={today}
                history={history[ex.name] ?? emptyHistory}
                onAdd={(item) => setToday(ex.name, (s) => [...s, item])}
                onReplace={(tempId, item) =>
                  setToday(ex.name, (s) => s.map((x) => (x.id === tempId ? item : x)))
                }
                onRemove={(id) => setToday(ex.name, (s) => s.filter((x) => x.id !== id))}
              />
            </motion.div>
          ))}
        </motion.div>
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
    <div className="rounded-card border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{exercise.name}</p>
          <p className="text-xs text-muted-foreground">{exercise.muscle}</p>
        </div>
        <a
          href={exercise.youtube}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-medium text-primary underline"
        >
          ▶ Form
        </a>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Target: {exercise.sets} sets × {exercise.repMin}–{exercise.repMax} {unit}
        {exercise.perSide ? " per side" : ""}
      </p>

      {/* Progression hint from last session */}
      <p className={`mt-1 text-xs ${advice.graduate ? "text-primary" : "text-muted-foreground"}`}>
        {advice.message}
      </p>

      {/* Today's sets */}
      {history.today.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {history.today.map((s, i) => (
              <motion.span
                key={s.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={spring}
                className="flex items-center gap-1 rounded-pill bg-muted px-2 py-1 text-xs text-foreground"
              >
                Set {i + 1}: {s.reps} {unit}
                <button
                  onClick={() => removeSet(s.id)}
                  className="text-destructive active:scale-90"
                  aria-label="Delete set"
                >
                  ×
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
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
          className="w-24 rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
        />
        <button
          onClick={addSet}
          disabled={!reps}
          className="rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          Add set
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
