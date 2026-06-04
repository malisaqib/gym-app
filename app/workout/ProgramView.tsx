"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { listContainer, listItem, spring } from "@/lib/motion";
import type { WorkoutLog } from "@/lib/database.types";
import type { ExerciseHistory } from "@/lib/workouts/history";
import { suggestProgression } from "@/lib/workouts/progression";
import type { ProgramDay, ProgramExercise, WeeklyProgram } from "@/lib/workouts/generator";
import type { TrainingEmphasis, TrainingSetup as TrainingSetupData } from "@/lib/workouts/trainingSetup";
import { logSet, deleteSet } from "./actions";
import { swapExercise, askAboutExercise } from "./programActions";

/**
 * Workout rebuild — Phase 5/6: render, log, and interact with the plan.
 *
 * Per-exercise: optimistic set logging + last-session progression hint, a
 * YouTube form-search link, "How to" (grounded in dataset instructions), "Swap"
 * (deterministic alternative of the same pattern), and "Ask" (the AI coach,
 * grounded in the exercise — the only AI in this feature).
 */

const EMPHASIS_LABEL: Record<TrainingEmphasis, string> = {
  fatLoss: "Fat loss",
  muscleGain: "Muscle gain",
  strength: "Strength",
  general: "General fitness",
};

const emptyHistory: ExerciseHistory = { today: [], lastSessionDate: null, lastSessionSets: [] };

function formatRest(seconds: number): string {
  if (seconds >= 90 && seconds % 60 === 0) return `${seconds / 60} min rest`;
  if (seconds >= 90) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} rest`;
  return `${seconds}s rest`;
}

function formVideoUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form`)}`;
}

function parseTarget(repRange: string): { repMax: number; repUnit: "reps" | "seconds" } {
  const isSeconds = /sec/i.test(repRange);
  const nums = repRange.match(/\d+/g)?.map(Number) ?? [];
  const repMax = nums.length ? Math.max(...nums) : 0;
  return { repMax, repUnit: isSeconds ? "seconds" : "reps" };
}

export default function ProgramView({
  program,
  today,
  history,
  setup,
  setToday,
  onReplaceExercise,
}: {
  program: WeeklyProgram;
  today: string;
  history: Record<string, ExerciseHistory>;
  setup: TrainingSetupData | null;
  setToday: (name: string, updater: (sets: WorkoutLog[]) => WorkoutLog[]) => void;
  onReplaceExercise: (dayIndex: number, oldId: string, next: ProgramExercise) => void;
}) {
  const firstTrainingIndex = program.days.findIndex((d) => !d.isRest);
  const [selected, setSelected] = useState(firstTrainingIndex === -1 ? 0 : firstTrainingIndex);
  const day = program.days[selected];

  return (
    <section className="space-y-4">
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

      <div className="flex gap-1.5">
        {program.days.map((d, i) => {
          const isSelected = i === selected;
          return (
            <button
              key={d.name}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={isSelected}
              className={`pressable flex-1 rounded-field border px-1 py-2 text-center ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-soft"
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

      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          <DayPanel
            day={day}
            dayIndex={selected}
            today={today}
            history={history}
            setup={setup}
            level={program.level}
            emphasis={program.emphasis}
            setToday={setToday}
            onReplaceExercise={onReplaceExercise}
          />
        </motion.div>
      </AnimatePresence>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">{program.disclaimer}</p>
    </section>
  );
}

function DayPanel({
  day,
  dayIndex,
  today,
  history,
  setup,
  level,
  emphasis,
  setToday,
  onReplaceExercise,
}: {
  day: ProgramDay;
  dayIndex: number;
  today: string;
  history: Record<string, ExerciseHistory>;
  setup: TrainingSetupData | null;
  level: WeeklyProgram["level"];
  emphasis: WeeklyProgram["emphasis"];
  setToday: (name: string, updater: (sets: WorkoutLog[]) => WorkoutLog[]) => void;
  onReplaceExercise: (dayIndex: number, oldId: string, next: ProgramExercise) => void;
}) {
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

  const dayExerciseIds = day.exercises.map((e) => e.exerciseId);

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
          <motion.div key={`${day.name}-${ex.exerciseId}`} variants={listItem}>
            <ExerciseCard
              exercise={ex}
              today={today}
              history={history[ex.name] ?? emptyHistory}
              setup={setup}
              level={level}
              emphasis={emphasis}
              dayExerciseIds={dayExerciseIds}
              onAdd={(item) => setToday(ex.name, (s) => [...s, item])}
              onReplace={(tempId, item) => setToday(ex.name, (s) => s.map((x) => (x.id === tempId ? item : x)))}
              onRemove={(id) => setToday(ex.name, (s) => s.filter((x) => x.id !== id))}
              onSwapped={(next) => onReplaceExercise(dayIndex, ex.exerciseId, next)}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function ExerciseCard({
  exercise,
  today,
  history,
  setup,
  level,
  emphasis,
  dayExerciseIds,
  onAdd,
  onReplace,
  onRemove,
  onSwapped,
}: {
  exercise: ProgramExercise;
  today: string;
  history: ExerciseHistory;
  setup: TrainingSetupData | null;
  level: WeeklyProgram["level"];
  emphasis: WeeklyProgram["emphasis"];
  dayExerciseIds: string[];
  onAdd: (item: WorkoutLog) => void;
  onReplace: (tempId: string, item: WorkoutLog) => void;
  onRemove: (id: string) => void;
  onSwapped: (next: ProgramExercise) => void;
}) {
  const [reps, setReps] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [panel, setPanel] = useState<"none" | "how" | "ask">("none");
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  const { repMax, repUnit } = parseTarget(exercise.repRange);
  const unit = repUnit === "seconds" ? "sec" : "reps";
  const advice = suggestProgression(
    history.lastSessionSets.map((s) => ({ reps: s.reps ?? 0 })),
    { sets: exercise.sets, repMax, repUnit, harder: "add a little load or a harder variation" }
  );

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
    if (!res.ok && snapshot) onAdd(snapshot);
  }

  async function doSwap() {
    if (!setup) return;
    setSwapping(true);
    setSwapError(null);
    const res = await swapExercise(setup, exercise.pattern, dayExerciseIds);
    setSwapping(false);
    if (res.ok) onSwapped(res.exercise);
    else setSwapError(res.error);
  }

  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{exercise.name}</p>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">{exercise.targetMuscles.join(", ")}</p>
        </div>
        <a
          href={formVideoUrl(exercise.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-medium text-primary underline"
        >
          ▶ Form
        </a>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
        <span className="font-medium">
          {exercise.sets} × {exercise.repRange}
        </span>
        <span className="text-xs text-muted-foreground">{formatRest(exercise.restSeconds)}</span>
        {exercise.isCompound && (
          <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Compound
          </span>
        )}
      </div>

      {exercise.note && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{exercise.note}</p>}

      <p className={`mt-2 text-xs ${advice.graduate ? "text-primary" : "text-muted-foreground"}`}>{advice.message}</p>

      {/* How to / Swap / Ask */}
      <div className="mt-3 flex flex-wrap gap-2">
        <SmallButton active={panel === "how"} onClick={() => setPanel(panel === "how" ? "none" : "how")}>
          How to
        </SmallButton>
        <SmallButton onClick={doSwap} disabled={swapping || !setup}>
          {swapping ? "Swapping…" : "↺ Swap"}
        </SmallButton>
        <SmallButton active={panel === "ask"} onClick={() => setPanel(panel === "ask" ? "none" : "ask")}>
          Ask coach
        </SmallButton>
      </div>
      {swapError && <p className="mt-1 text-xs text-muted-foreground">{swapError}</p>}

      <AnimatePresence initial={false}>
        {panel === "how" && (
          <motion.div
            key="how"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {exercise.instructions.length > 0 ? (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                {exercise.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                No step-by-step text for this one — tap ▶ Form for a video, or ask the coach.
              </p>
            )}
          </motion.div>
        )}

        {panel === "ask" && (
          <motion.div
            key="ask"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <AskCoach exercise={exercise} level={level} emphasis={emphasis} />
          </motion.div>
        )}
      </AnimatePresence>

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

function AskCoach({
  exercise,
  level,
  emphasis,
}: {
  exercise: ProgramExercise;
  level: WeeklyProgram["level"];
  emphasis: WeeklyProgram["emphasis"];
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    const res = await askAboutExercise({ exercise, level, emphasis, question: q });
    setLoading(false);
    if (res.ok) setAnswer(res.answer);
    else setError(res.error);
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="e.g. how do I avoid back pain on this?"
          className="min-w-0 flex-1 rounded-field border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
        />
        <button
          onClick={ask}
          disabled={loading || !question.trim()}
          className="shrink-0 rounded-field bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>
      {error && <p className="text-xs text-muted-foreground">{error}</p>}
      {answer && (
        <p className="whitespace-pre-wrap rounded-field bg-muted px-3 py-2 text-xs leading-relaxed text-foreground">
          {answer}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        AI guidance — general info, not medical advice. Stop if anything hurts.
      </p>
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`pressable rounded-pill border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-foreground hover:border-primary/60"
      }`}
    >
      {children}
    </button>
  );
}
