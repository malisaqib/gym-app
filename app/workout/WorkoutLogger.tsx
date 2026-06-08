"use client";

import { useCallback, useState } from "react";
import type { WorkoutLog } from "@/lib/database.types";
import { type ExerciseHistory } from "@/lib/workouts/history";
import { buildProgram } from "./programActions";
import { Spinner } from "@/components/ui/Spinner";
import BottomNav from "@/components/BottomNav";
import TrainingSetup from "./TrainingSetup";
import ProgramView from "./ProgramView";
import type { ProfileTrainingDefaults, TrainingSetup as TrainingSetupData } from "@/lib/workouts/trainingSetup";
import type { PlanExercise, WorkoutGoal, WorkoutPlan } from "@/lib/workouts/coachPlan";

export default function WorkoutLogger({
  today,
  profileDefaults,
  resolvedGoal,
}: {
  today: string;
  profileDefaults: ProfileTrainingDefaults;
  resolvedGoal: WorkoutGoal;
}) {
  // The deterministic plan + its logging history, built server-side from setup.
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [history, setHistory] = useState<Record<string, ExerciseHistory>>({});
  const [programLoading, setProgramLoading] = useState(false);
  // Keep the current setup so Swap can re-query against the same constraints.
  const [setup, setSetup] = useState<TrainingSetupData | null>(null);

  // Optimistic update for one exercise's today-list (keyed by exercise name).
  function setToday(name: string, updater: (sets: WorkoutLog[]) => WorkoutLog[]) {
    setHistory((prev) => {
      const entry = prev[name] ?? { today: [], lastSessionDate: null, lastSessionSets: [] };
      return { ...prev, [name]: { ...entry, today: updater(entry.today) } };
    });
  }

  // Replace one exercise (after a Swap) in the given day.
  function replaceExercise(dayIndex: number, oldId: string, next: PlanExercise) {
    setPlan((prev) => {
      if (!prev) return prev;
      const days = prev.days.map((d, i) =>
        i === dayIndex ? { ...d, exercises: d.exercises.map((e) => (e.id === oldId ? next : e)) } : d
      );
      return { ...prev, days };
    });
  }

  // TrainingSetup emits the setup on mount (if configured) and after each save.
  const handleSetupChange = useCallback(async (next: TrainingSetupData | null) => {
    setSetup(next);
    if (!next) {
      setPlan(null);
      return;
    }
    setProgramLoading(true);
    try {
      const res = await buildProgram(next);
      if (res.ok) {
        setPlan(res.plan);
        setHistory(res.history);
      } else {
        setPlan(null);
      }
    } catch {
      setPlan(null);
    } finally {
      setProgramLoading(false);
    }
  }, []);

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 pb-24 pt-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Workout</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your plan, built from your goal &amp; equipment — log sets as you go.
          </p>
        </div>

        {/* Training setup — emits to (re)build the deterministic plan below. */}
        <TrainingSetup profileDefaults={profileDefaults} resolvedGoal={resolvedGoal} onSetupChange={handleSetupChange} />

        {programLoading && (
          <div className="flex items-center gap-3 rounded-card border border-border bg-card p-4 shadow-soft">
            <Spinner size="sm" className="text-primary" label="Building your plan" />
            <p className="text-sm text-muted-foreground">Building your plan…</p>
          </div>
        )}

        {plan && (
          <ProgramView
            plan={plan}
            today={today}
            history={history}
            setup={setup}
            setToday={setToday}
            onReplaceExercise={replaceExercise}
          />
        )}
      </main>
      <BottomNav />
    </>
  );
}
