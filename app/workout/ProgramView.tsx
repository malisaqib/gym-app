"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { listContainer, listItem } from "@/lib/motion";
import type { ProgramDay, ProgramExercise, WeeklyProgram } from "@/lib/workouts/generator";
import type { TrainingEmphasis } from "@/lib/workouts/trainingSetup";

/**
 * Workout rebuild — Phase 4: render the deterministic weekly program.
 *
 * Read-only plan view (logging stays on the quick logger below for now). Shows
 * the week layout, a tab per training day, and each day's exercises with the
 * generated sets/reps/rest, target muscles, and beginner "why" notes.
 */

const EMPHASIS_LABEL: Record<TrainingEmphasis, string> = {
  fatLoss: "Fat loss",
  muscleGain: "Muscle gain",
  strength: "Strength",
  general: "General fitness",
};

function formatRest(seconds: number): string {
  if (seconds >= 90 && seconds % 60 === 0) return `${seconds / 60} min rest`;
  if (seconds >= 90) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} rest`;
  return `${seconds}s rest`;
}

export default function ProgramView({ program }: { program: WeeklyProgram }) {
  // Default to the first training day.
  const firstTrainingIndex = program.days.findIndex((d) => !d.isRest);
  const [selected, setSelected] = useState(firstTrainingIndex === -1 ? 0 : firstTrainingIndex);
  const day = program.days[selected];

  return (
    <section className="space-y-4">
      {/* Plan header */}
      <div className="rounded-card border border-border bg-card p-4 shadow-soft">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Your plan</p>
        <h2 className="mt-1 font-display text-lg font-semibold text-foreground">{program.split}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {program.daysPerWeek} days/week · {EMPHASIS_LABEL[program.emphasis]} ·{" "}
          {program.level.charAt(0).toUpperCase() + program.level.slice(1)}
        </p>

        {program.adjustedForInjuries.length > 0 && (
          <ul className="mt-3 space-y-1">
            {program.adjustedForInjuries.map((note) => (
              <li key={note} className="flex gap-2 text-xs text-muted-foreground">
                <span aria-hidden className="text-primary">
                  ✓
                </span>
                {note}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 rounded-field bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Progress: </span>
          {program.progression}
        </p>
      </div>

      {/* Week strip — train vs rest at a glance */}
      <div className="flex gap-1.5">
        {program.days.map((d, i) => {
          const isSelected = i === selected;
          return (
            <button
              key={d.name}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={isSelected}
              className={`flex-1 rounded-field border px-1 py-2 text-center transition active:scale-[0.97] ${
                isSelected
                  ? "border-primary bg-primary/10"
                  : d.isRest
                    ? "border-border bg-background"
                    : "border-border bg-card hover:border-primary/60"
              }`}
            >
              <span className="block text-[10px] font-medium text-muted-foreground">{i + 1}</span>
              <span
                className={`mt-0.5 block text-[10px] font-semibold ${
                  d.isRest ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {d.isRest ? "Rest" : "Train"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected day */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          <DayPanel day={day} />
        </motion.div>
      </AnimatePresence>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">{program.disclaimer}</p>
    </section>
  );
}

function DayPanel({ day }: { day: ProgramDay }) {
  if (day.isRest) {
    return (
      <div className="rounded-card border border-dashed border-border bg-background p-6 text-center">
        <p className="font-semibold text-foreground">Rest day</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Recovery is when you actually get stronger. Walk, stretch, sleep well.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-semibold text-foreground">{day.focus}</h3>
        <span className="text-xs text-muted-foreground">{day.exercises.length} exercises</span>
      </div>

      {day.warmup && (
        <p className="rounded-field bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Warm-up: </span>
          {day.warmup}
        </p>
      )}

      <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
        {day.exercises.map((ex) => (
          <motion.div key={ex.exerciseId} variants={listItem}>
            <ExercisePlanCard exercise={ex} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function ExercisePlanCard({ exercise }: { exercise: ProgramExercise }) {
  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{exercise.name}</p>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">
            {exercise.targetMuscles.join(", ")}
          </p>
        </div>
        {exercise.isCompound && (
          <span className="shrink-0 rounded-pill bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Compound
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
        <span className="font-medium">
          {exercise.sets} × {exercise.repRange}
        </span>
        <span className="text-xs text-muted-foreground">{formatRest(exercise.restSeconds)}</span>
      </div>

      {exercise.note && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{exercise.note}</p>}
    </div>
  );
}
