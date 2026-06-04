"use client";

import { useCallback, useState } from "react";
import type { WorkoutLog } from "@/lib/database.types";
import { type ExerciseHistory } from "@/lib/workouts/history";
import { buildProgram } from "./programActions";
import BottomNav from "@/components/BottomNav";
import TrainingSetup from "./TrainingSetup";
import ProgramView from "./ProgramView";
import type { ProfileTrainingDefaults, TrainingSetup as TrainingSetupData } from "@/lib/workouts/trainingSetup";
import type { WeeklyProgram } from "@/lib/workouts/generator";

export default function WorkoutLogger({
  today,
  profileDefaults,
}: {
  today: string;
  profileDefaults: ProfileTrainingDefaults;
}) {
  // The deterministic plan + its logging history, built server-side from setup.
  const [program, setProgram] = useState<WeeklyProgram | null>(null);
  const [history, setHistory] = useState<Record<string, ExerciseHistory>>({});
  const [programLoading, setProgramLoading] = useState(false);

  // Optimistic update for one exercise's today-list (keyed by exercise name).
  function setToday(name: string, updater: (sets: WorkoutLog[]) => WorkoutLog[]) {
    setHistory((prev) => {
      const entry = prev[name] ?? { today: [], lastSessionDate: null, lastSessionSets: [] };
      return { ...prev, [name]: { ...entry, today: updater(entry.today) } };
    });
  }

  // TrainingSetup emits the setup on mount (if configured) and after each save.
  const handleSetupChange = useCallback(async (setup: TrainingSetupData | null) => {
    if (!setup) {
      setProgram(null);
      return;
    }
    setProgramLoading(true);
    try {
      const res = await buildProgram(setup);
      if (res.ok) {
        setProgram(res.program);
        setHistory(res.history);
      } else {
        setProgram(null);
      }
    } catch {
      setProgram(null);
    } finally {
      setProgramLoading(false);
    }
  }, []);

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 pb-24 pt-8">
        <h1 className="font-display text-2xl font-semibold text-foreground">Workout</h1>

        {/* Training setup — emits to (re)build the deterministic plan below. */}
        <TrainingSetup profileDefaults={profileDefaults} onSetupChange={handleSetupChange} />

        {programLoading && (
          <div className="rounded-card border border-border bg-card p-4 shadow-soft">
            <p className="text-sm text-muted-foreground">Building your plan…</p>
          </div>
        )}

        {program && <ProgramView program={program} today={today} history={history} setToday={setToday} />}
      </main>
      <BottomNav />
    </>
  );
}
