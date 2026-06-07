"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { getCheckIns as getLocalCheckIns, lastCheckIn, daysSince } from "@/lib/coach/checkins";
import { suggestsSupport } from "@/lib/coach/supportSignals";
import { SupportNudge } from "@/components/SupportNudge";
import { toast } from "@/lib/toast";
import { loadCheckIns, saveCheckIns } from "./coachData";
import type { WeeklyCheckInEntry } from "./localCoachTypes";
import type { Lang } from "@/lib/database.types";

/**
 * Phase 6 — Weekly check-in.
 *
 * Self-contained ({lang}); stores entries in localStorage (array via
 * lib/coach/checkins). Feedback is ALWAYS supportive — one gentle improvement +
 * one encouragement, framed around consistency and how you feel. It never
 * shames a missed day or a higher-calorie meal. A soft reminder appears after
 * 7 days. No DB / AI / auth touched.
 */

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function toNum(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// One improvement + one encouragement. Supportive, behaviour/feel-based, never
// shaming. We deliberately don't comment on weight or appearance.
function buildFeedback(i: {
  workouts: number;
  diet: number;
  energy: number;
  sleep: number;
  struggle: string;
}): string {
  let improvement: string;
  if (i.workouts < 3) improvement = "An easy win next week: one more short workout, even 15 minutes.";
  else if (i.diet < 6) improvement = "Next week, try protein-first at one extra meal — small and doable.";
  else if (i.sleep <= 5 || i.energy <= 5) improvement = "Protect your sleep this week; it quietly powers everything else.";
  else improvement = "You're in a good rhythm — maybe add a short daily walk.";

  const encouragement = i.struggle.trim()
    ? `Thanks for being honest about "${i.struggle.trim()}". We'll work with it, not against you — consistency beats perfection.`
    : "You showed up and checked in — that's the habit that actually works. Be proud of consistency, not perfection.";

  return `${improvement} ${encouragement}`;
}

const T = {
  eyebrow: { en: "Weekly check-in", roman_urdu: "Weekly check-in" },
  title: { en: "How was your week?", roman_urdu: "Aap ka hafta kaisa raha?" },
  helper: {
    en: "Small honest updates beat perfect tracking. We care about energy, sleep, and consistency — not just the scale.",
    roman_urdu: "Choti sachi updates perfect tracking se behtar hain. Energy, neend, aur consistency — sirf wazan nahi.",
  },
  date: { en: "Date", roman_urdu: "Tareekh" },
  weight: { en: "Weight (kg)", roman_urdu: "Wazan (kg)" },
  workouts: { en: "Workouts", roman_urdu: "Workouts" },
  waist: { en: "Waist (optional)", roman_urdu: "Kamr (optional)" },
  optional: { en: "Optional", roman_urdu: "Optional" },
  diet: { en: "Diet consistency", roman_urdu: "Diet consistency" },
  energy: { en: "Energy", roman_urdu: "Energy" },
  sleep: { en: "Sleep quality", roman_urdu: "Neend" },
  struggle: { en: "Biggest struggle this week", roman_urdu: "Is hafte sab se bari mushkil" },
  strugglePh: {
    en: "e.g. late-night snacking, hostel food, missed workouts",
    roman_urdu: "misal: raat ki snacking, hostel food, missed workouts",
  },
  submit: { en: "Save check-in", roman_urdu: "Check-in save karein" },
  lastLabel: { en: "Last check-in", roman_urdu: "Pichla check-in" },
  feedbackLabel: { en: "Your coach", roman_urdu: "Aap ka coach" },
  reminder: {
    en: "It's been a week — a quick check-in keeps your momentum going. No pressure.",
    roman_urdu: "Ek hafta ho gaya — chota check-in momentum banaye rakhta hai. Koi pressure nahi.",
  },
  deviceNote: { en: "Saved to your account.", roman_urdu: "Aap ke account mein save hai." },
} satisfies Record<string, Record<Lang, string>>;

export default function WeeklyCheckIn({ lang = "en" }: { lang?: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [hydrated, setHydrated] = useState(false);
  const [entries, setEntries] = useState<WeeklyCheckInEntry[]>([]);
  const [latest, setLatest] = useState<WeeklyCheckInEntry | null>(null);
  const [justSaved, setJustSaved] = useState<WeeklyCheckInEntry | null>(null);

  const [date, setDate] = useState(todayKey());
  const [weight, setWeight] = useState("");
  const [workouts, setWorkouts] = useState("3");
  const [waist, setWaist] = useState("");
  const [diet, setDiet] = useState(7);
  const [energy, setEnergy] = useState(7);
  const [sleep, setSleep] = useState(7);
  const [struggle, setStruggle] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      let all = await loadCheckIns();
      if (!alive) return;
      if (all.length === 0) {
        // One-time migration of any legacy localStorage check-ins.
        const local = getLocalCheckIns();
        if (local.length) {
          all = local;
          void saveCheckIns(local);
        }
      }
      setEntries(all);
      setLatest(lastCheckIn(all));
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const w = Math.max(0, Math.min(14, Math.round(Number(workouts) || 0)));
    const entry: WeeklyCheckInEntry = {
      id: createId(),
      date,
      weight: toNum(weight),
      workoutsCompleted: w,
      dietConsistency: diet,
      energyLevel: energy,
      sleepQuality: sleep,
      biggestStruggle: struggle.trim(),
      waist: toNum(waist),
      coachFeedback: buildFeedback({ workouts: w, diet, energy, sleep, struggle }),
    };
    // Replace any same-date entry, keep sorted oldest→newest (was addCheckIn).
    const all = [...entries.filter((x) => x.date !== entry.date), entry].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    setEntries(all); // optimistic
    setLatest(lastCheckIn(all));
    setJustSaved(entry);
    setStruggle("");
    const res = await saveCheckIns(all);
    if (!res.ok) toast.error("Couldn't save your check-in — please try again.");
  }

  if (!hydrated) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full rounded-field" />
      </Card>
    );
  }

  const showReminder = !justSaved && daysSince(latest?.date) >= 7;

  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
        <h2 className="font-display text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("helper")}</p>
      </div>

      {showReminder && (
        <p className="rounded-field bg-primary-soft px-3 py-2 text-sm text-primary">⏰ {t("reminder")}</p>
      )}

      {latest && !justSaved && (
        <div className="rounded-field bg-muted px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("lastLabel")} · {latest.date}
          </p>
          <p className="mt-1 text-sm text-foreground">{latest.coachFeedback}</p>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("date")} type="date" value={date} onChange={setDate} />
          <Field label={t("weight")} type="number" value={weight} onChange={setWeight} placeholder={t("optional")} />
          <Field label={t("workouts")} type="number" value={workouts} onChange={setWorkouts} placeholder="3" />
          <Field label={t("waist")} type="number" value={waist} onChange={setWaist} placeholder={t("optional")} />
        </div>

        <Range label={t("diet")} value={diet} onChange={setDiet} />
        <Range label={t("energy")} value={energy} onChange={setEnergy} />
        <Range label={t("sleep")} value={sleep} onChange={setSleep} />

        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          {t("struggle")}
          <textarea
            value={struggle}
            onChange={(e) => setStruggle(e.target.value)}
            rows={2}
            placeholder={t("strugglePh")}
            className="resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>

        <button
          type="submit"
          className="self-start rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97]"
        >
          {t("submit")}
        </button>
      </form>

      {justSaved && suggestsSupport(justSaved.biggestStruggle) && <SupportNudge lang={lang} />}

      {justSaved && (
        <div className="rounded-field bg-primary-soft px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("feedbackLabel")}</p>
          <p className="mt-1 text-sm leading-relaxed text-primary">{justSaved.coachFeedback}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("deviceNote")}</p>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
      />
    </label>
  );
}

function Range({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="rounded-pill bg-muted px-2 py-0.5 text-xs text-muted-foreground">{value}/10</span>
      </span>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary"
      />
    </label>
  );
}
