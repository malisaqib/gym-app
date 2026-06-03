"use client";

import { useState } from "react";
import type { WeeklyCheckInEntry } from "./localCoachTypes";

function todayKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildFeedback(input: {
  workoutsCompleted: number;
  dietConsistency: number;
  energyLevel: number;
  sleepQuality: number;
  biggestStruggle: string;
}): string {
  const improved =
    input.workoutsCompleted >= 3
      ? "Training consistency is moving well."
      : "The easiest win is getting one more workout next week.";
  const diet =
    input.dietConsistency >= 7
      ? "Diet is consistent enough to make progress."
      : "Keep meals simpler: protein first, then controlled roti or rice.";
  const recovery =
    input.energyLevel <= 5 || input.sleepQuality <= 5
      ? "Energy or sleep needs attention, so do not make the plan harsher yet."
      : "Recovery looks decent, so keep building the routine.";
  const struggle = input.biggestStruggle.trim()
    ? `Main struggle noted: ${input.biggestStruggle.trim()}.`
    : "No major struggle noted.";

  return `${improved} ${diet} ${recovery} ${struggle}`;
}

export default function WeeklyCheckIn({
  latest,
  onSubmit,
}: {
  latest: WeeklyCheckInEntry | null;
  onSubmit: (entry: WeeklyCheckInEntry) => void;
}) {
  const [date, setDate] = useState(todayKey());
  const [weight, setWeight] = useState("");
  const [workoutsCompleted, setWorkoutsCompleted] = useState("3");
  const [dietConsistency, setDietConsistency] = useState(7);
  const [energyLevel, setEnergyLevel] = useState(7);
  const [sleepQuality, setSleepQuality] = useState(7);
  const [biggestStruggle, setBiggestStruggle] = useState("");
  const [waist, setWaist] = useState("");
  const [saved, setSaved] = useState<WeeklyCheckInEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const workouts = Math.max(0, Math.min(14, Math.round(Number(workoutsCompleted))));
    if (!date || !Number.isFinite(workouts)) {
      setError("Please enter a valid date and workout count.");
      return;
    }

    const entry: WeeklyCheckInEntry = {
      id: createId(),
      date,
      weight: toNumberOrNull(weight),
      workoutsCompleted: workouts,
      dietConsistency,
      energyLevel,
      sleepQuality,
      biggestStruggle: biggestStruggle.trim(),
      waist: toNumberOrNull(waist),
      coachFeedback: buildFeedback({
        workoutsCompleted: workouts,
        dietConsistency,
        energyLevel,
        sleepQuality,
        biggestStruggle,
      }),
    };

    onSubmit(entry);
    setSaved(entry);
    setError(null);
    setBiggestStruggle("");
  }

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Weekly check-in</p>
        <h2 className="font-display text-lg font-semibold text-foreground">Update the plan once a week</h2>
        <p className="text-sm text-muted-foreground">
          Small honest updates beat perfect tracking. This is stored locally for now.
        </p>
      </div>

      {latest && (
        <div className="mt-4 rounded-field bg-primary-soft px-3 py-2">
          <p className="text-sm font-medium text-primary">Last check-in: {latest.date}</p>
          <p className="mt-1 text-sm text-primary">{latest.coachFeedback}</p>
        </div>
      )}

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <TextInput label="Date" type="date" value={date} onChange={setDate} />
          <TextInput label="Weight (kg)" type="number" value={weight} onChange={setWeight} placeholder="Optional" />
          <TextInput
            label="Workouts"
            type="number"
            value={workoutsCompleted}
            onChange={setWorkoutsCompleted}
            placeholder="3"
          />
          <TextInput label="Waist" type="number" value={waist} onChange={setWaist} placeholder="Optional" />
        </div>

        <RangeInput label="Diet consistency" value={dietConsistency} onChange={setDietConsistency} />
        <RangeInput label="Energy level" value={energyLevel} onChange={setEnergyLevel} />
        <RangeInput label="Sleep quality" value={sleepQuality} onChange={setSleepQuality} />

        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Biggest struggle
          <textarea
            value={biggestStruggle}
            onChange={(event) => setBiggestStruggle(event.target.value)}
            rows={3}
            placeholder="Example: late-night snacking, hostel food, missed workouts"
            className="resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="self-start rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97]"
        >
          Submit check-in
        </button>
      </form>

      {saved && (
        <div className="mt-4 rounded-field border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Coach feedback</p>
          <p className="mt-1 text-sm text-muted-foreground">{saved.coachFeedback}</p>
        </div>
      )}
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
      />
    </label>
  );
}

function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="rounded-pill bg-background px-2 py-0.5 text-xs text-muted-foreground">{value}/10</span>
      </span>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary"
      />
    </label>
  );
}
