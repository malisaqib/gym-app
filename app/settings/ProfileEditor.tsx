"use client";

import { useState } from "react";
import { Target as TargetIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { RELATABLE_GOALS } from "@/lib/onboarding/goals";
import type {
  ActivityLevel,
  Experience,
  FoodPreference,
  Lang,
  ProteinPowderPreference,
  Region,
  RelatableGoalKey,
  Sex,
  Timeline,
  TrainingLocation,
} from "@/lib/database.types";
import { REGIONS, REGION_LABELS } from "@/lib/region";
import { updateProfile, type ProfileEditInput } from "./actions";

/**
 * "Your details" — view + edit everything collected at onboarding. Saving
 * re-runs the calorie engine on the server so the targets stay in sync.
 */

export interface ProfileDetails {
  fullName: string;
  relatableGoal: RelatableGoalKey;
  timeline: Timeline;
  trainingLocation: TrainingLocation;
  foodPreference: FoodPreference;
  proteinPowderPreference: ProteinPowderPreference;
  region: Region | null; // null until an older account sets it
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  activityLevel: ActivityLevel;
  trainingDays: number;
  experience: Experience;
  preferredLanguage: Lang;
  calorieTarget: number | null;
  proteinTargetG: number | null;
  carbTargetG: number | null;
  fatTargetG: number | null;
  targetDate: string | null;
  // Usual eating (optional) — used by the diet plan.
  usualBreakfast: string;
  usualLunch: string;
  usualDinner: string;
  usualFoods: string;
  dislikedFoods: string;
}

const GOAL_OPTS = RELATABLE_GOALS.map((g) => ({ value: g.key, label: g.label.en }));
const SEX_OPTS: { value: Sex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];
const EXP_OPTS: { value: Experience; label: string }[] = [
  { value: "beginner", label: "New to this" },
  { value: "intermediate", label: "Some experience" },
  { value: "advanced", label: "Experienced" },
];
const LOC_OPTS: { value: TrainingLocation; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "gym", label: "Gym" },
  { value: "both", label: "Both" },
];
const FOOD_OPTS: { value: FoodPreference; label: string }[] = [
  { value: "normal_desi", label: "Normal desi" },
  { value: "high_protein", label: "High protein" },
  { value: "budget", label: "Budget" },
  { value: "hostel_student", label: "Hostel / student" },
  { value: "veg_limited", label: "Veg / little meat" },
];
const PROTEIN_POWDER_OPTS: { value: ProteinPowderPreference; label: string }[] = [
  { value: "enabled", label: "Yes" },
  { value: "disabled", label: "No" },
  { value: "unknown", label: "Not sure" },
];
const REGION_OPTS: { value: Region; label: string }[] = REGIONS.map((r) => ({
  value: r,
  label: REGION_LABELS[r].en,
}));
const TIME_OPTS: { value: Timeline; label: string }[] = [
  { value: "no_deadline", label: "No deadline" },
  { value: "4_weeks", label: "4 weeks" },
  { value: "8_weeks", label: "8 weeks" },
  { value: "12_weeks", label: "12 weeks" },
];
const LANG_OPTS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "roman_urdu", label: "Roman Urdu" },
];
const DAY_OPTS = Array.from({ length: 8 }, (_, n) => ({ value: n, label: String(n) }));
const ACT_OPTS: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Mostly sitting" },
  { value: "light", label: "Lightly active" },
  { value: "moderate", label: "Moderately active" },
  { value: "very", label: "Very active" },
  { value: "extra", label: "On feet all day" },
];
function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(`${iso}T00:00:00`)
    );
  } catch {
    return iso;
  }
}

function goalLabel(key: RelatableGoalKey): string {
  return RELATABLE_GOALS.find((g) => g.key === key)?.label.en ?? key;
}

export default function ProfileEditor({ initial }: { initial: ProfileDetails }) {
  const [details, setDetails] = useState<ProfileDetails>(initial);
  const [draft, setDraft] = useState<ProfileDetails>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(next: Partial<ProfileDetails>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  function startEdit() {
    setDraft(details);
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (saving) return; // guard against double-submit
    setSaving(true);
    setError(null);
    const input: ProfileEditInput = {
      fullName: draft.fullName,
      relatableGoal: draft.relatableGoal,
      timeline: draft.timeline,
      trainingLocation: draft.trainingLocation,
      foodPreference: draft.foodPreference,
      proteinPowderPreference: draft.proteinPowderPreference,
      sex: draft.sex,
      age: draft.age,
      heightCm: draft.heightCm,
      weightKg: draft.weightKg,
      goalWeightKg: draft.goalWeightKg,
      activityLevel: draft.activityLevel,
      trainingDays: draft.trainingDays,
      experience: draft.experience,
      region: draft.region,
      preferredLanguage: draft.preferredLanguage,
      usualBreakfast: draft.usualBreakfast,
      usualLunch: draft.usualLunch,
      usualDinner: draft.usualDinner,
      usualFoods: draft.usualFoods,
      dislikedFoods: draft.dislikedFoods,
    };
    try {
      const res = await updateProfile(input);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      haptic("success");
      // Supportive, not alarming: the timeline was eased to a safe pace and the
      // shown date is the realistic one.
      if (res.paceCapped) {
        toast.success("Saved — I set a safe pace for that goal; your date reflects it.");
      } else {
        toast.success("Profile updated");
      }
      setDetails({
        ...draft,
        calorieTarget: res.calorieTarget,
        proteinTargetG: res.proteinTargetG,
        carbTargetG: res.carbTargetG,
        fatTargetG: res.fatTargetG,
        targetDate: res.targetDate,
      });
      setEditing(false);
    } catch {
      const message = "Couldn't save your changes. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Your details</p>
            <h2 className="truncate font-display text-lg font-semibold tracking-tight text-foreground">
              {details.fullName || "Profile"}
            </h2>
            <p className="text-sm text-muted-foreground">{goalLabel(details.relatableGoal)}</p>
          </div>
          <button
            type="button"
            onPointerDown={() => haptic("tap")}
            onClick={startEdit}
            className="pressable shrink-0 rounded-field border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Edit
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Age" value={`${details.age}`} />
          <Stat label="Sex" value={details.sex === "male" ? "Male" : "Female"} />
          <Stat label="Height" value={`${details.heightCm} cm`} />
          <Stat label="Weight" value={`${details.weightKg} kg`} />
          <Stat label="Goal weight" value={`${details.goalWeightKg} kg`} />
          <Stat label="Activity" value={ACT_OPTS.find((o) => o.value === details.activityLevel)?.label ?? "—"} />
          <Stat label="Training" value={`${details.trainingDays} days/wk`} />
          <Stat
            label="Protein powder"
            value={PROTEIN_POWDER_OPTS.find((o) => o.value === details.proteinPowderPreference)?.label ?? "Not sure"}
          />
          <Stat label="Experience" value={EXP_OPTS.find((o) => o.value === details.experience)?.label ?? "—"} />
        </dl>

        {details.calorieTarget != null && details.proteinTargetG != null && (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Target label="Daily calories" value={`${details.calorieTarget}`} />
              <Target label="Daily protein" value={`${details.proteinTargetG} g`} />
            </div>
            {details.carbTargetG != null && details.fatTargetG != null && (
              <p className="text-center text-xs text-muted-foreground">
                Carbs ~{details.carbTargetG} g · Fat ~{details.fatTargetG} g
              </p>
            )}
          </div>
        )}
        {details.targetDate && details.goalWeightKg !== details.weightKg && (
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <TargetIcon size={14} aria-hidden /> On track for {details.goalWeightKg} kg by {formatDate(details.targetDate)}.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Editing your stats or goal updates these targets automatically.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-5 p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Edit your details</p>
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Update your info</h2>
      </div>

      <Field label="Name">
        <input
          value={draft.fullName}
          onChange={(e) => patch({ fullName: e.target.value })}
          placeholder="Your name"
          className="h-11 w-full rounded-field border border-input bg-background px-3 text-base text-foreground focus:border-ring focus:outline-none"
        />
      </Field>

      <Field label="Goal">
        <Chips options={GOAL_OPTS} selected={draft.relatableGoal} onSelect={(v) => patch({ relatableGoal: v })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Age">
          <NumberInput value={draft.age} min={13} max={99} onChange={(n) => patch({ age: n })} />
        </Field>
        <Field label="Sex">
          <Chips options={SEX_OPTS} selected={draft.sex} onSelect={(v) => patch({ sex: v })} />
        </Field>
        <Field label="Height (cm)">
          <NumberInput value={draft.heightCm} min={120} max={230} onChange={(n) => patch({ heightCm: n })} />
        </Field>
        <Field label="Weight (kg)">
          <NumberInput value={draft.weightKg} min={30} max={250} onChange={(n) => patch({ weightKg: n })} />
        </Field>
        <Field label="Goal weight (kg)">
          <NumberInput value={draft.goalWeightKg} min={30} max={250} onChange={(n) => patch({ goalWeightKg: n })} />
        </Field>
      </div>

      <Field label="Daily activity (outside workouts)">
        <Chips options={ACT_OPTS} selected={draft.activityLevel} onSelect={(v) => patch({ activityLevel: v })} />
      </Field>

      <Field label="Training days / week">
        <Chips options={DAY_OPTS} selected={draft.trainingDays} onSelect={(v) => patch({ trainingDays: v })} />
      </Field>

      <Field label="Experience">
        <Chips options={EXP_OPTS} selected={draft.experience} onSelect={(v) => patch({ experience: v })} />
      </Field>

      <Field label="Where you train">
        <Chips options={LOC_OPTS} selected={draft.trainingLocation} onSelect={(v) => patch({ trainingLocation: v })} />
      </Field>

      <Field label="Food style">
        <Chips options={FOOD_OPTS} selected={draft.foodPreference} onSelect={(v) => patch({ foodPreference: v })} />
      </Field>

      <Field label="Use protein powder?">
        <Chips
          options={PROTEIN_POWDER_OPTS}
          selected={draft.proteinPowderPreference}
          onSelect={(v) => patch({ proteinPowderPreference: v })}
        />
      </Field>

      {/* Region — only steers the LLM's food suggestions, not the calorie math. */}
      <Field label="Region (for food suggestions)">
        <Chips
          options={REGION_OPTS}
          selected={draft.region ?? ("" as Region)}
          onSelect={(v) => patch({ region: v })}
        />
      </Field>

      <Field label="Timeline">
        <Chips options={TIME_OPTS} selected={draft.timeline} onSelect={(v) => patch({ timeline: v })} />
      </Field>

      <Field label="Language">
        <Chips options={LANG_OPTS} selected={draft.preferredLanguage} onSelect={(v) => patch({ preferredLanguage: v })} />
      </Field>

      {/* Usual eating (optional) — feeds the diet plan. */}
      <div className="space-y-2 rounded-field border border-border bg-background p-3">
        <p className="text-sm font-medium text-foreground">How you usually eat (optional)</p>
        <p className="text-xs text-muted-foreground">Your meal plan is built around these.</p>
        <TextLine value={draft.usualBreakfast} placeholder="Usual breakfast" onChange={(v) => patch({ usualBreakfast: v })} />
        <TextLine value={draft.usualLunch} placeholder="Usual lunch" onChange={(v) => patch({ usualLunch: v })} />
        <TextLine value={draft.usualDinner} placeholder="Usual dinner" onChange={(v) => patch({ usualDinner: v })} />
        <TextLine value={draft.usualFoods} placeholder="Foods you eat a lot" onChange={(v) => patch({ usualFoods: v })} />
        <TextLine value={draft.dislikedFoods} placeholder="Anything you don't / won't eat" onChange={(v) => patch({ dislikedFoods: v })} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onPointerDown={() => haptic("tap")}
          onClick={save}
          disabled={saving}
          className="rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition duration-200 ease-ios hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onPointerDown={() => haptic("tap")}
          onClick={() => setEditing(false)}
          className="rounded-field border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition duration-200 ease-ios hover:bg-muted active:scale-[0.97]"
        >
          Cancel
        </button>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field border border-border bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Target({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-field bg-primary-soft p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tracking-tight text-primary">{value}</p>
    </div>
  );
}

function TextLine({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-field border border-input bg-card px-3 text-base text-foreground focus:border-ring focus:outline-none"
    />
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

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={Number.isFinite(value) ? value : ""}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-11 w-full rounded-field border border-input bg-background px-3 text-base text-foreground focus:border-ring focus:outline-none"
    />
  );
}

function Chips<T extends string | number>({
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
            key={String(opt.value)}
            type="button"
            onPointerDown={() => haptic("tap")}
            onClick={() => onSelect(opt.value)}
            aria-pressed={active}
            className={`pressable rounded-pill border px-3 py-2 text-sm font-medium ${
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
