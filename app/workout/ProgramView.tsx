"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { listContainer, listItem, spring } from "@/lib/motion";
import type { WorkoutLog } from "@/lib/database.types";
import type { ExerciseHistory } from "@/lib/workouts/history";
import { suggestProgression } from "@/lib/workouts/progression";
import { haptic } from "@/lib/haptics";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { localDateString } from "@/lib/localDate";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { Sheet } from "@/components/ui/Sheet";
import { ActivityRing } from "@/components/ui/ActivityRing";
import { Play, RefreshCw, Check } from "lucide-react";
import type { PlanDay, PlanExercise, SwapDirection, WorkoutGoal, WorkoutPlan } from "@/lib/workouts/coachPlan";
import type { TrainingSetup as TrainingSetupData } from "@/lib/workouts/trainingSetup";
import { logSet, deleteSet } from "./actions";
import { swapWorkoutExercise, askAboutExercise } from "./programActions";

/**
 * Workout rebuild — Phase 4: render, log, and interact with the deterministic
 * plan. Per-exercise: optimistic set logging (unchanged), why-this-exercise,
 * How-to (grounded in dataset instructions) with make-easier/harder + a safe
 * cue, Swap (deterministic same-pattern alternative), and Ask (the AI coach).
 */

const GOAL_LABEL: Record<WorkoutGoal, string> = {
  lose_belly_fat: "Lose belly fat",
  lose_weight: "Lose weight",
  gain_muscle: "Gain muscle",
  gain_weight: "Gain weight",
  build_strength: "Build strength",
  tone: "Tone / look better",
  stay_fit: "Stay fit",
};

const emptyHistory: ExerciseHistory = { today: [], lastSessionDate: null, lastSessionSets: [] };

function formatRest(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds >= 90 && seconds % 60 === 0) return `${seconds / 60} min rest`;
  if (seconds >= 90) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} rest`;
  return `${seconds}s rest`;
}

function formVideoUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form`)}`;
}

function parseTarget(reps: string): { repMax: number; repUnit: "reps" | "seconds" } {
  const isSeconds = /sec|min/i.test(reps);
  const nums = reps.match(/\d+/g)?.map(Number) ?? [];
  const repMax = nums.length ? Math.max(...nums) : 0;
  return { repMax, repUnit: isSeconds ? "seconds" : "reps" };
}

export default function ProgramView({
  plan,
  today,
  history,
  setup,
  setToday,
  onReplaceExercise,
}: {
  plan: WorkoutPlan;
  today: string;
  history: Record<string, ExerciseHistory>;
  setup: TrainingSetupData | null;
  setToday: (name: string, updater: (sets: WorkoutLog[]) => WorkoutLog[]) => void;
  onReplaceExercise: (dayIndex: number, oldId: string, next: PlanExercise) => void;
}) {
  const firstTrainingIndex = plan.days.findIndex((d) => !d.isRest);
  const [selected, setSelected] = useState(firstTrainingIndex === -1 ? 0 : firstTrainingIndex);
  const day = plan.days[selected];

  return (
    <section className="space-y-4">
      <div className="rounded-card-xl border border-border bg-card p-5">
        <p className="stat-label">Your plan</p>
        <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-foreground">{plan.split}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{plan.summary}</p>

        {/* Truth rule: belly fat reduces through overall fat loss + diet deficit. */}
        {plan.bellyFatNote && (
          <p className="mt-3 rounded-field bg-primary-soft px-3 py-2 text-xs leading-relaxed text-primary">{plan.bellyFatNote}</p>
        )}

        {plan.adjustments.length > 0 && (
          <ul className="mt-3 space-y-1">
            {plan.adjustments.map((note) => (
              <li key={note} className="flex gap-2 text-xs text-muted-foreground">
                <Check size={14} aria-hidden className="mt-px shrink-0 text-primary" />
                {note}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 rounded-field bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Progress: </span>
          {plan.progressionNote}
        </p>
      </div>

      {/* Week strip — one pill per day; selected day glows emerald. */}
      <div className="flex gap-1.5">
        {plan.days.map((d, i) => {
          const isSelected = i === selected;
          return (
            <button
              key={d.name}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={isSelected}
              className={`pressable flex flex-1 flex-col items-center gap-1 rounded-card-lg border px-1 py-2.5 text-center transition-colors ${
                isSelected ? "border-primary/40 bg-primary/15" : "border-border bg-card"
              }`}
            >
              <span className="stat-label text-[9px]">D{i + 1}</span>
              <span
                className={`text-[11px] font-semibold ${
                  isSelected ? "text-primary" : d.isRest ? "text-muted-foreground" : "text-foreground"
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
            level={plan.level}
            goal={plan.goal}
            setToday={setToday}
            onReplaceExercise={onReplaceExercise}
          />
        </motion.div>
      </AnimatePresence>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">{plan.disclaimer}</p>
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
  goal,
  setToday,
  onReplaceExercise,
}: {
  day: PlanDay;
  dayIndex: number;
  today: string;
  history: Record<string, ExerciseHistory>;
  setup: TrainingSetupData | null;
  level: WorkoutPlan["level"];
  goal: WorkoutGoal;
  setToday: (name: string, updater: (sets: WorkoutLog[]) => WorkoutLog[]) => void;
  onReplaceExercise: (dayIndex: number, oldId: string, next: PlanExercise) => void;
}) {
  if (day.isRest) {
    return (
      <div className="rounded-card-xl border border-dashed border-border bg-card p-6 text-center">
        <p className="font-semibold text-foreground">Rest day</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Recovery is when you actually get stronger. Walk, stretch, sleep well.
        </p>
      </div>
    );
  }

  const dayExerciseIds = day.exercises.map((e) => e.id);
  // Today's session progress — sets logged vs planned (from existing data only).
  const plannedSets = day.exercises.reduce((s, e) => s + e.sets, 0);
  const doneSets = day.exercises.reduce((s, e) => s + Math.min(history[e.name]?.today.length ?? 0, e.sets), 0);

  return (
    <div className="space-y-3">
      {/* Today's-workout hero: a ring of sets done vs planned. */}
      <div className="flex items-center gap-4 rounded-card-xl border border-border bg-card p-5">
        <ActivityRing value={doneSets} max={plannedSets} color="rgb(var(--ring-1))" size={88} stroke={11}>
          <span className="stat-value text-base text-foreground">
            {doneSets}/{plannedSets}
          </span>
        </ActivityRing>
        <div className="min-w-0">
          <p className="stat-label">Today&apos;s session</p>
          <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-foreground">{day.focus}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {day.exercises.length} exercises · {plannedSets} sets
          </p>
        </div>
      </div>

      {day.warmup && (
        <p className="rounded-card-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Warm-up: </span>
          {day.warmup}
        </p>
      )}

      <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
        {day.exercises.map((ex) => (
          <motion.div key={`${day.name}-${ex.id}`} variants={listItem}>
            <ExerciseCard
              exercise={ex}
              today={today}
              history={history[ex.name] ?? emptyHistory}
              setup={setup}
              level={level}
              goal={goal}
              dayExerciseIds={dayExerciseIds}
              onAdd={(item) => setToday(ex.name, (s) => [...s, item])}
              onReplace={(tempId, item) => setToday(ex.name, (s) => s.map((x) => (x.id === tempId ? item : x)))}
              onRemove={(id) => setToday(ex.name, (s) => s.filter((x) => x.id !== id))}
              onSwapped={(next) => onReplaceExercise(dayIndex, ex.id, next)}
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
  goal,
  dayExerciseIds,
  onAdd,
  onReplace,
  onRemove,
  onSwapped,
}: {
  exercise: PlanExercise;
  today: string;
  history: ExerciseHistory;
  setup: TrainingSetupData | null;
  level: WorkoutPlan["level"];
  goal: WorkoutGoal;
  dayExerciseIds: string[];
  onAdd: (item: WorkoutLog) => void;
  onReplace: (tempId: string, item: WorkoutLog) => void;
  onRemove: (id: string) => void;
  onSwapped: (next: PlanExercise) => void;
}) {
  const [reps, setReps] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [showHow, setShowHow] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  // Which swap direction is in flight (null = idle), so we can spin just that button.
  const [swapping, setSwapping] = useState<SwapDirection | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);

  const { repMax, repUnit } = parseTarget(exercise.reps);
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
    const date = localDateString();
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
    haptic("success");

    const res = await logSet({ exerciseName: exercise.name, reps: n, setNumber, date });
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
    if (!res.ok) {
      if (snapshot) onAdd(snapshot); // restore — never silently drop
      toast.error(res.error || "Couldn't delete that set. Please try again.");
    }
  }

  async function doSwap(direction: SwapDirection) {
    if (!setup || swapping) return;
    setSwapping(direction);
    setSwapError(null);
    // currentId scores "this" exercise; dayExerciseIds keep the swap off today's
    // other moves so we never get a duplicate in the same session.
    const res = await swapWorkoutExercise(setup, exercise.pattern, exercise.id, dayExerciseIds, direction);
    setSwapping(null);
    if (res.ok) {
      haptic("success");
      onSwapped(res.exercise);
    } else {
      setSwapError(res.error);
      toast.error(res.error);
    }
  }

  return (
    <div className="rounded-card-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{exercise.name}</p>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">
            {exercise.primaryMuscle ?? "general"} · {exercise.difficulty} · {exercise.equipment}
          </p>
        </div>
        <a
          href={formVideoUrl(exercise.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline"
        >
          <Play size={13} aria-hidden className="fill-current" /> Form
        </a>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
        <span className="font-medium">
          {exercise.sets} × {exercise.reps}
        </span>
        <span className="text-xs text-muted-foreground">{formatRest(exercise.restSeconds)}</span>
        {exercise.isCompound && (
          <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Compound
          </span>
        )}
      </div>

      {/* Why this exercise (deterministic, from the enrichment layer). */}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{exercise.whyThisExercise}</p>

      <p className={`mt-2 text-xs ${advice.graduate ? "text-primary" : "text-muted-foreground"}`}>{advice.message}</p>

      {/* How to / Ask */}
      <div className="mt-3 flex flex-wrap gap-2">
        <SmallButton active={showHow} onClick={() => setShowHow((v) => !v)}>
          How to
        </SmallButton>
        <SmallButton onClick={() => setAskOpen(true)}>Ask coach</SmallButton>
      </div>

      {/* Explicit directional swap — replace this move with an easier / different
          / harder one of the same pattern that the user can actually do. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Swap for:</span>
        <SmallButton onClick={() => doSwap("easier")} disabled={!!swapping || !setup}>
          {swapping === "easier" ? "…" : "Easier"}
        </SmallButton>
        <SmallButton onClick={() => doSwap("different")} disabled={!!swapping || !setup}>
          {swapping === "different" ? (
            "…"
          ) : (
            <span className="inline-flex items-center gap-1">
              <RefreshCw size={13} aria-hidden /> Different
            </span>
          )}
        </SmallButton>
        <SmallButton onClick={() => doSwap("harder")} disabled={!!swapping || !setup}>
          {swapping === "harder" ? "…" : "Harder"}
        </SmallButton>
      </div>
      {swapError && <p className="mt-1 text-xs text-muted-foreground">{swapError}</p>}

      <AnimatePresence initial={false}>
        {showHow && (
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
                No step-by-step text for this one — tap Form for a video, or ask the coach.
              </p>
            )}

            <div className="mt-3 space-y-1.5">
              <Guidance label="Make it easier" text={exercise.regression} />
              <Guidance label="Make it harder" text={exercise.progression} />
              <Guidance
                label="Safe performance"
                text={
                  exercise.cautionTags.length
                    ? `Move under control and stop if it hurts. Be mindful of your ${exercise.cautionTags.join(", ")}.`
                    : "Move under control through a full range and stop if anything hurts."
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI coach in an iOS-style bottom sheet. */}
      <Sheet open={askOpen} onClose={() => setAskOpen(false)} title={`Ask about ${exercise.name}`}>
        <AskCoach exercise={exercise} level={level} goal={goal} />
      </Sheet>

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
                <button onClick={() => removeSet(s.id)} className="text-destructive active:scale-90" aria-label="Delete set">
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

function Guidance({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground">{label}: </span>
      {text}
    </p>
  );
}

function AskCoach({ exercise, level, goal }: { exercise: PlanExercise; level: WorkoutPlan["level"]; goal: WorkoutGoal }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const { run, pending, error } = useAsyncAction(
    async (q: string) => {
      const res = await askAboutExercise({
        name: exercise.name,
        muscles: exercise.primaryMuscle ? [exercise.primaryMuscle] : [],
        sets: exercise.sets,
        reps: exercise.reps,
        restSeconds: exercise.restSeconds,
        instructions: exercise.instructions,
        level,
        goalLabel: GOAL_LABEL[goal],
        question: q,
      });
      if (!res.ok) throw new Error(res.error);
      return res.answer;
    },
    { timeoutMs: 25000 }
  );

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setAnswer(null);
    const result = await run(q);
    if (result !== undefined) setAnswer(result);
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
        <Button size="sm" onClick={ask} loading={pending} disabled={pending || !question.trim()}>
          Ask
        </Button>
      </div>
      {error && <p className="text-xs text-muted-foreground">{error}</p>}
      {answer && (
        <p className="whitespace-pre-wrap rounded-field bg-muted px-3 py-2 text-xs leading-relaxed text-foreground">{answer}</p>
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
      onPointerDown={() => haptic("tap")}
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
