"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { listContainer, listItem } from "@/lib/motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { generateDietPlan, swapDietMeal } from "./actions";
import type { DietPlan } from "@/lib/diet/planner";
import type { MealSlot } from "@/lib/diet/foodCatalog";
import type { Lang } from "@/lib/database.types";

const T = {
  title: { en: "Your day's plan", roman_urdu: "Aap ke din ka plan" },
  intro: {
    en: "A simple, repeatable day that fits your targets. Swap anything you don't fancy.",
    roman_urdu: "Ek asaan, repeatable din jo aap ke targets se milta hai. Jo pasand na ho, swap karein.",
  },
  notesLabel: { en: "Anything to keep in mind? (optional)", roman_urdu: "Koi baat zehan mein? (optional)" },
  notesPlaceholder: {
    en: "e.g. no beef, hostel food only, vegetarian",
    roman_urdu: "misal: beef nahi, hostel ka khana, vegetarian",
  },
  generate: { en: "Generate plan", roman_urdu: "Plan banayein" },
  regenerate: { en: "Regenerate", roman_urdu: "Naya plan" },
  working: { en: "Working…", roman_urdu: "Ban raha hai…" },
  swap: { en: "Swap", roman_urdu: "Badlein" },
  habitsOn: { en: "Focus on habits", roman_urdu: "Habits par focus" },
  habitsOff: { en: "Show numbers", roman_urdu: "Numbers dikhayein" },
  daily: { en: "Daily total", roman_urdu: "Din ka total" },
  cal: { en: "kcal", roman_urdu: "kcal" },
  protein: { en: "protein", roman_urdu: "protein" },
  emptyTitle: { en: "No plan yet", roman_urdu: "Abhi koi plan nahi" },
  emptyHint: {
    en: "Generate a simple day of meals built around your targets.",
    roman_urdu: "Apne targets ke mutabiq ek asaan din ka plan banayein.",
  },
  habitsLine: {
    en: "Aim for protein + a carb + something fresh at each meal. Numbers are a guide, not a test.",
    roman_urdu: "Har meal mein protein + ek carb + kuch taza. Numbers sirf guide hain, imtihan nahi.",
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
  hasTargets,
  lang,
}: {
  initialPlan: DietPlan | null;
  hasTargets: boolean;
  lang: Lang;
}) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [plan, setPlan] = useState<DietPlan | null>(initialPlan);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState<MealSlot | null>(null);
  const [habits, setHabits] = useState(false);

  async function generate() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await generateDietPlan(notes);
      if (res.ok) {
        setPlan(res.plan);
        haptic("success");
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Couldn't build a plan. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function swap(slot: MealSlot) {
    if (swapping) return;
    setSwapping(slot);
    try {
      const res = await swapDietMeal(slot);
      if (res.ok) {
        setPlan(res.plan);
        haptic("tap");
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Couldn't swap that meal. Please try again.");
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
          <Button onClick={generate} loading={busy} disabled={busy}>
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
      </Card>

      {!plan && (
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
              <div className="mt-1 flex gap-4">
                <Total value={plan.totalCalories} target={plan.calorieTarget} unit={t("cal")} />
                <Total value={plan.totalProtein} target={plan.proteinTargetG} unit={`g ${t("protein")}`} />
              </div>
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
                            {meal.calories} {t("cal")} · {meal.protein} g
                          </span>
                        )}
                      </h3>
                      <button
                        type="button"
                        onPointerDown={() => haptic("tap")}
                        onClick={() => swap(meal.slot)}
                        disabled={swapping === meal.slot}
                        className="rounded-pill border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition hover:border-primary/50 active:scale-[0.97] disabled:opacity-40"
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

function Total({ value, target, unit }: { value: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="flex-1">
      <p className="font-display text-lg font-semibold tabular-nums text-foreground">
        {value}
        <span className="text-sm font-normal text-muted-foreground"> / {target}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {unit} · {pct}%
      </p>
    </div>
  );
}
