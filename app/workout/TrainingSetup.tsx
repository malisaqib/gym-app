"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { readLocal, writeLocal } from "@/lib/coach/localStore";
import {
  DEFAULT_TRAINING_SETUP,
  EQUIPMENT_OPTIONS,
  MAX_DAYS,
  MIN_DAYS,
  TRAINING_SETUP_KEY,
  isTrainingConfigured,
  normalizeTrainingSetup,
  setupFromProfileDefaults,
  type EquipmentItem,
  type ExperienceLevel,
  type ProfileTrainingDefaults,
  type TrainingLocation,
  type TrainingSetup as TrainingSetupData,
} from "@/lib/workouts/trainingSetup";
import { saveTrainingSetup } from "./setupActions";

/**
 * Phase 2 — "Set up your training" card on the Workout tab.
 *
 * Collects the inputs the deterministic generator (Phase 3) needs. localStorage
 * is the source of truth for now; we also best-effort sync to the profile so it
 * survives across devices once migration 0008 is applied. Nothing here is AI.
 */

const LOCATIONS: { value: TrainingLocation; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "gym", label: "Gym" },
  { value: "both", label: "Both" },
];

const LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const SESSION_CHOICES = [30, 45, 60, 90];

const DAY_CHOICES = Array.from({ length: MAX_DAYS - MIN_DAYS + 1 }, (_, i) => MIN_DAYS + i);

export default function TrainingSetup({ profileDefaults }: { profileDefaults: ProfileTrainingDefaults }) {
  const [hydrated, setHydrated] = useState(false);
  const [setup, setSetup] = useState<TrainingSetupData>(DEFAULT_TRAINING_SETUP);
  const [draft, setDraft] = useState<TrainingSetupData>(DEFAULT_TRAINING_SETUP);
  const [editing, setEditing] = useState(false);
  const [syncNote, setSyncNote] = useState<"synced" | "local" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const seeded = setupFromProfileDefaults(profileDefaults);
    const loaded = normalizeTrainingSetup(readLocal(TRAINING_SETUP_KEY, seeded));
    setSetup(loaded);
    setDraft(loaded);
    setHydrated(true);
    // We only want to read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(next: Partial<TrainingSetupData>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  function toggleEquipment(item: EquipmentItem) {
    setDraft((d) => ({
      ...d,
      equipment: d.equipment.includes(item)
        ? d.equipment.filter((e) => e !== item)
        : [...d.equipment, item],
    }));
  }

  function startEdit() {
    setDraft(setup);
    setSyncNote(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const next = normalizeTrainingSetup({ ...draft, updatedAt: new Date().toISOString() });
    writeLocal(TRAINING_SETUP_KEY, next); // authoritative
    setSetup(next);
    setEditing(false);

    // Best-effort DB sync (works once migration 0008 is applied).
    try {
      const res = await saveTrainingSetup(next);
      setSyncNote(res.ok ? "synced" : "local");
    } catch {
      setSyncNote("local");
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-10 w-full rounded-field" />
      </Card>
    );
  }

  const showForm = !isTrainingConfigured(setup) || editing;
  const needsEquipmentQ = draft.trainingLocation !== "gym";

  if (!showForm) {
    return <SetupSummary setup={setup} syncNote={syncNote} onEdit={startEdit} />;
  }

  const canSave = draft.trainingDaysPerWeek >= MIN_DAYS && draft.trainingDaysPerWeek <= MAX_DAYS;

  return (
    <Card className="space-y-5 p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Set up your training</p>
        <h2 className="font-display text-lg font-semibold text-foreground">Build my workout plan</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A few quick questions and we&apos;ll put together a plan that fits your space, gear, and level.
        </p>
      </div>

      <Field label="Where will you train?">
        <ChipRow
          options={LOCATIONS}
          selected={draft.trainingLocation}
          onSelect={(v) => patch({ trainingLocation: v })}
        />
      </Field>

      {needsEquipmentQ && (
        <Field label="Do you have any equipment?">
          <ChipRow
            options={[
              { value: "yes", label: "Yes, some" },
              { value: "no", label: "Bodyweight only" },
            ]}
            selected={draft.hasEquipment ? "yes" : "no"}
            onSelect={(v) => patch({ hasEquipment: v === "yes" })}
          />
          {draft.hasEquipment && (
            <div className="mt-3 flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((opt) => {
                const active = draft.equipment.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleEquipment(opt.value)}
                    aria-pressed={active}
                    className={`rounded-pill border px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
      )}

      <Field label="Your experience">
        <ChipRow
          options={LEVELS}
          selected={draft.experienceLevel}
          onSelect={(v) => patch({ experienceLevel: v })}
        />
      </Field>

      <Field label="Days per week">
        <div className="flex flex-wrap gap-2">
          {DAY_CHOICES.map((d) => {
            const active = draft.trainingDaysPerWeek === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => patch({ trainingDaysPerWeek: d })}
                aria-pressed={active}
                className={`h-11 w-11 rounded-field border text-sm font-semibold transition active:scale-[0.97] ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-primary/60"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Session length (optional)">
        <div className="flex flex-wrap gap-2">
          {SESSION_CHOICES.map((m) => {
            const active = draft.sessionMinutes === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => patch({ sessionMinutes: active ? null : m })}
                aria-pressed={active}
                className={`rounded-pill border px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-primary/60"
                }`}
              >
                {m} min
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Any injuries or limitations? (optional)">
        <textarea
          value={draft.injuriesNote}
          onChange={(e) => patch({ injuriesNote: e.target.value })}
          rows={2}
          placeholder="e.g. bad knee, sore lower back"
          className="w-full resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          We&apos;ll avoid movements that often aggravate it. Stop if anything hurts — see a professional for pain or
          medical conditions.
        </p>
      </Field>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving}
          className="rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          {saving ? "Saving…" : "Build my plan"}
        </button>
        {isTrainingConfigured(setup) && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-field border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted active:scale-[0.97]"
          >
            Cancel
          </button>
        )}
      </div>
    </Card>
  );
}

function SetupSummary({
  setup,
  syncNote,
  onEdit,
}: {
  setup: TrainingSetupData;
  syncNote: "synced" | "local" | null;
  onEdit: () => void;
}) {
  const locationLabel = LOCATIONS.find((l) => l.value === setup.trainingLocation)?.label ?? setup.trainingLocation;
  const levelLabel = LEVELS.find((l) => l.value === setup.experienceLevel)?.label ?? setup.experienceLevel;
  const equipmentLabels =
    setup.trainingLocation === "gym"
      ? "Full gym"
      : setup.hasEquipment
        ? setup.equipment.length
          ? setup.equipment.map((e) => EQUIPMENT_OPTIONS.find((o) => o.value === e)?.label ?? e).join(", ")
          : "Some equipment"
        : "Bodyweight only";

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Your training setup</p>
          <h2 className="font-display text-lg font-semibold text-foreground">
            {locationLabel} · {levelLabel} · {setup.trainingDaysPerWeek} days/week
          </h2>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-field border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted active:scale-[0.97]"
        >
          Edit
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <SummaryItem label="Equipment" value={equipmentLabels} />
        <SummaryItem label="Session" value={setup.sessionMinutes ? `${setup.sessionMinutes} min` : "Flexible"} />
        {setup.injuriesNote && <SummaryItem label="Notes" value={setup.injuriesNote} wide />}
      </dl>

      <p className="text-xs text-muted-foreground">
        {syncNote === "synced"
          ? "Saved to your profile."
          : "Saved on this device. Your full plan appears here next."}
      </p>
    </Card>
  );
}

function SummaryItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-field border border-border bg-background p-3 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {children}
    </div>
  );
}

function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            aria-pressed={active}
            className={`rounded-pill border px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/60"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
