"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { listContainer, listItem } from "@/lib/motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { generateDietPlan, swapDietMeal } from "./actions";
import type { DietPlan, DietFilter } from "@/lib/diet/planner";
import type { MealSlot } from "@/lib/diet/foodCatalog";
import type { Lang } from "@/lib/database.types";

// Quick-tap "avoid" options (values must match foodCatalog tags).
const AVOID: { tag: string; label: Record<Lang, string> }[] = [
  { tag: "beef", label: { en: "Beef", roman_urdu: "Beef" } },
  { tag: "chicken", label: { en: "Chicken", roman_urdu: "Chicken" } },
  { tag: "fish", label: { en: "Fish", roman_urdu: "Machli" } },
  { tag: "egg", label: { en: "Egg", roman_urdu: "Anda" } },
  { tag: "dairy", label: { en: "Dairy", roman_urdu: "Dairy" } },
  { tag: "nuts", label: { en: "Nuts", roman_urdu: "Nuts" } },
];

const T = {
  title: { en: "Your day's plan", roman_urdu: "Aap ke din ka plan" },
  intro: {
    en: "Meals built to hit your daily calories & protein. Swap anything you don't fancy.",
    roman_urdu: "Aap ki rozana calories aur protein pe bana plan. Jo pasand na ho, swap karein.",
  },
  vegLabel: { en: "Vegetarian", roman_urdu: "Vegetarian" },
  avoidLabel: { en: "Avoid", roman_urdu: "Avoid karein" },
  notesLabel: { en: "Anything else? (optional)", roman_urdu: "Aur kuch? (optional)" },
  notesPlaceholder: {
    en: "e.g. no beef, hostel food only, vegetarian",
    roman_urdu: "misal: beef nahi, hostel ka khana, vegetarian",
  },
  generate: { en: "Generate my plan", roman_urdu: "Mera plan banayein" },
  regenerate: { en: "Regenerate", roman_urdu: "Naya plan" },
  working: { en: "Working…", roman_urdu: "Ban raha hai…" },
  swap: { en: "Swap", roman_urdu: "Badlein" },
  habitsOn: { en: "Focus on habits", roman_urdu: "Habits par focus" },
  habitsOff: { en: "Show numbers", roman_urdu: "Numbers dikhayein" },
  daily: { en: "Daily total", roman_urdu: "Din ka total" },
  cal: { en: "kcal", roman_urdu: "kcal" },
  protein: { en: "protein", roman_urdu: "protein" },
  emptyTitle: { en: "No meal plan yet", roman_urdu: "Abhi koi meal plan nahi" },
  emptyHint: {
    en: "Tap “Generate my plan” and I'll build a full day of meals that fits your calories & protein.",
    roman_urdu: "“Mera plan banayein” dabayein — main poora din ka plan banata hoon jo aap ki calories aur protein pe fit ho.",
  },
  habitsLine: {
    en: "Aim for protein + a carb + something fresh at each meal. Numbers are a guide, not a test.",
    roman_urdu: "Har meal mein protein + ek carb + kuch taza. Numbers sirf guide hain, imtihan nahi.",
  },
  proteinShortNote: {
    en: "Protein's a little hard to hit on this calorie budget — this is the closest plan. Adding a protein-rich food (eggs, yogurt, chicken) helps.",
    roman_urdu: "Itni calories mein protein poora karna thora mushkil hai — ye sab se qareeb plan hai. Koi protein wali cheez (anday, dahi, chicken) madad karegi.",
  },
} satisfies Record<string, Record<Lang, string>>;

const SLOT_LABEL: Record<MealSlot, Record<Lang, string>> = {
  breakfast: { en: "Breakfast", roman_urdu: "Nashta" },
  lunch: { en: "Lunch", roman_urdu: "Dopahar" },
  dinner: { en: "Dinner", roman_urdu: "Raat" },
  snack: { en: "Snack", roman_urdu: "Snack" },
};

export default function DietPlanView({
  initialPlan,
  initialFilter,
  hasTargets,
  lang,
}: {
  initialPlan: DietPlan | null;
  initialFilter: DietFilter;
  hasTargets: boolean;
  lang: Lang;
}) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [plan, setPlan] = useState<DietPlan | null>(initialPlan);
  const [notes, setNotes] = useState("");
  const [vegetarian, setVegetarian] = useState(initialFilter.vegetarian);
  const [avoid, setAvoid] = useState<string[]>(initialFilter.excludeTags);
  // Specific foods to avoid (free text, e.g. "whey protein shake"). Shown as
  // removable chips so they persist across regenerate until the user clears them.
  const [avoidFoods, setAvoidFoods] = useState<string[]>(initialFilter.excludeFoods ?? []);
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState<MealSlot | null>(null);
  const [habits, setHabits] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAvoid = (tag: string) =>
    setAvoid((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await generateDietPlan({ notes, vegetarian, excludeTags: avoid, excludeFoods: avoidFoods });
      if (res.ok) {
        setPlan(res.plan);
        // Surface any newly-parsed exclusions as chips, and clear the note box.
        setAvoidFoods(res.plan.filter.excludeFoods ?? []);
        setVegetarian(res.plan.filter.vegetarian);
        setAvoid(res.plan.filter.excludeTags);
        setNotes("");
        haptic("success");
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    } catch {
      const message = "Couldn't build a plan. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function swap(slot: MealSlot) {
    if (swapping) return;
    setSwapping(slot);
    setError(null);
    try {
      const res = await swapDietMeal(slot);
      if (res.ok) {
        setPlan(res.plan);
        haptic("tap");
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    } catch {
      const message = "Couldn't swap that meal. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSwapping(null);
    }
  }

  if (!hasTargets) {
    return (
      <Card className="space-y-2 p-5">
        <h2 className="font-display text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">
          Finish setting your goal first — your plan is built around your daily calorie and protein
          targets.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      <Card className="space-y-3 p-4">
        {/* Quick-tap preferences (seeded from onboarding/your profile). */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={vegetarian} onClick={() => setVegetarian((v) => !v)}>
            🥦 {t("vegLabel")}
          </Chip>
          <span className="text-xs text-muted-foreground">· {t("avoidLabel")}:</span>
          {AVOID.map((a) => (
            <Chip key={a.tag} active={avoid.includes(a.tag)} onClick={() => toggleAvoid(a.tag)}>
              {a.label[lang]}
            </Chip>
          ))}
        </div>

        {/* Specific foods you've asked to avoid (from your notes). Tap ✕ to allow again. */}
        {avoidFoods.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("avoidLabel")}:</span>
            {avoidFoods.map((f) => (
              <button
                key={f}
                type="button"
                onPointerDown={() => haptic("tap")}
                onClick={() => setAvoidFoods((cur) => cur.filter((x) => x !== f))}
                className="min-h-[32px] rounded-pill border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground active:scale-[0.97]"
              >
                {f} ✕
              </button>
            ))}
          </div>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">{t("notesLabel")}</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            className="h-11 w-full rounded-field border border-input bg-background px-3 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          {/* Before a plan exists, this is THE primary action — make it unmissable. */}
          <Button
            onClick={generate}
            loading={busy}
            disabled={busy}
            fullWidth={!plan}
            size={plan ? "md" : "lg"}
          >
            {busy ? t("working") : plan ? t("regenerate") : t("generate")}
          </Button>
          {plan && (
            <button
              type="button"
              onPointerDown={() => haptic("tap")}
              onClick={() => setHabits((h) => !h)}
              className="rounded-field border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted active:scale-[0.97]"
            >
              {habits ? t("habitsOff") : t("habitsOn")}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {/* First-time generation: show meal skeletons instead of a frozen screen. */}
      {busy && !plan && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="space-y-2 p-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-10 w-full rounded-field" />
              <Skeleton className="h-10 w-2/3 rounded-field" />
            </Card>
          ))}
        </div>
      )}

      {!plan && !busy && (
        <Card className="flex flex-col items-center gap-1 p-8 text-center">
          <span className="text-2xl">🍽️</span>
          <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
        </Card>
      )}

      {plan && (
        <>
          {/* Daily totals vs target (hidden in the habits-focused view) */}
          {!habits ? (
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("daily")}</p>
              <div className="mt-1 flex gap-5">
                <TargetBar value={plan.totalCalories} target={plan.calorieTarget} unit={t("cal")} />
                <TargetBar
                  value={plan.totalProtein}
                  target={plan.proteinTargetG}
                  unit={`g ${t("protein")}`}
                  tone={plan.proteinShort ? "warn" : "ok"}
                />
              </div>
              {plan.proteinShort && (
                <p className="mt-2 rounded-field bg-muted px-3 py-2 text-xs text-warning">
                  {t("proteinShortNote")}
                </p>
              )}
            </Card>
          ) : (
            <Card className="bg-primary-soft p-4">
              <p className="text-sm leading-relaxed text-primary">{t("habitsLine")}</p>
            </Card>
          )}

          <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {plan.meals.map((meal) => (
                <motion.div key={meal.slot} variants={listItem} layout>
                  <Card className="space-y-2 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-base font-semibold text-foreground">
                        {SLOT_LABEL[meal.slot][lang]}
                        {!habits && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                            {meal.calories}/{meal.budget} {t("cal")} · {meal.protein} g
                          </span>
                        )}
                      </h3>
                      <button
                        type="button"
                        onPointerDown={() => haptic("tap")}
                        onClick={() => swap(meal.slot)}
                        disabled={swapping === meal.slot}
                        className="min-h-[32px] shrink-0 rounded-pill border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 active:scale-[0.97] disabled:opacity-40"
                      >
                        {swapping === meal.slot ? "…" : `↻ ${t("swap")}`}
                      </button>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {meal.items.map((item, i) => (
                        <li
                          key={`${item.id}-${i}`}
                          className="flex items-center justify-between rounded-field border border-border bg-background px-3 py-2"
                        >
                          <span className="text-sm text-foreground">
                            {item.name}
                            <span className="ml-1.5 text-xs text-muted-foreground">{item.portion}</span>
                          </span>
                          {!habits && (
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {item.calories} · {item.protein}g
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={() => haptic("tap")}
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[32px] rounded-pill border px-3 py-1.5 text-xs font-medium transition active:scale-[0.97] ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:border-primary/50"
      }`}
    >
      {children}
    </button>
  );
}

// Value-vs-target with a thin progress bar. `tone` lets protein show "short"
// (amber) vs on-track (primary). Bars cap at 100% (calories never exceed target).
function TargetBar({
  value,
  target,
  unit,
  tone = "ok",
}: {
  value: number;
  target: number;
  unit: string;
  tone?: "ok" | "warn";
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const bar = tone === "warn" ? "bg-warning" : "bg-primary";
  return (
    <div className="flex-1">
      <p className="font-display text-lg font-semibold tabular-nums text-foreground">
        {value}
        <span className="text-sm font-normal text-muted-foreground"> / {target}</span>
        <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-pill bg-muted">
        <div className={`h-full rounded-pill ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{pct}% of target</p>
    </div>
  );
}
