"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { DESI_FOODS, estimateDesiMeal } from "@/lib/coach/desiFoodEstimator";
import { EMOTIONAL_GOAL_KEY, readLocal } from "@/lib/coach/localStore";
import { DEFAULT_EMOTIONAL_GOAL, getGoalText } from "./localCoachTypes";
import type { Lang } from "@/lib/database.types";

/**
 * Phase 3 — Desi food estimator.
 *
 * Fully static + offline: every number and suggestion comes from the shared
 * dataset in lib/coach/desiFoodEstimator.ts (DESI_FOODS). Nothing is hardcoded
 * in this component, and no AI/RAG is called. It reads the saved emotional goal
 * (Phase 2, localStorage) only to tailor the friendly "goal fit" line.
 *
 * Responsible-design: results are ranges (never exact), the tone is neutral, and
 * we always end on one practical, non-judgmental suggestion.
 */

const T = {
  eyebrow: { en: "Meal estimator", roman_urdu: "Meal estimator" },
  title: {
    en: "Estimate a meal without overthinking it",
    roman_urdu: "Bina zyada soche meal estimate karein",
  },
  helper: {
    en: "Type what you ate or plan to eat. We use friendly ranges — a home plate and a restaurant plate can be very different.",
    roman_urdu:
      "Likhein kya khaya ya khane ka plan hai. Hum ranges istemal karte hain — ghar ki plate aur restaurant ki plate kaafi alag ho sakti hai.",
  },
  placeholder: { en: "e.g. 2 roti, chicken salan, chai", roman_urdu: "misal: 2 roti, chicken salan, chai" },
  estimateBtn: { en: "Estimate meal", roman_urdu: "Meal estimate karein" },
  tryLabel: { en: "Quick try", roman_urdu: "Jaldi try karein" },
  emptyTitle: { en: "Nothing estimated yet", roman_urdu: "Abhi kuch estimate nahi hua" },
  emptyHint: {
    en: "Type a meal above, or tap an example to see its range.",
    roman_urdu: "Upar meal likhein, ya example tap karein range dekhne ke liye.",
  },
  resultFor: { en: "Result for", roman_urdu: "Result" },
  calories: { en: "Calories", roman_urdu: "Calories" },
  protein: { en: "Protein", roman_urdu: "Protein" },
  rangeNote: {
    en: "These are rough ranges to guide you, not exact numbers.",
    roman_urdu: "Ye motay motay ranges hain rehnumai ke liye, exact numbers nahi.",
  },
} satisfies Record<string, Record<Lang, string>>;

// Example inputs are pulled straight from the dataset so they always match what
// the estimator can recognise (and stay in sync if the dataset changes).
const EXAMPLES = DESI_FOODS.slice(0, 6).map((food) => food.name);

export default function DesiFoodEstimator({ lang = "en" }: { lang?: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [personalGoal, setPersonalGoal] = useState("");

  useEffect(() => {
    const goal = readLocal(EMOTIONAL_GOAL_KEY, DEFAULT_EMOTIONAL_GOAL);
    setPersonalGoal(getGoalText(goal));
  }, []);

  // No result until the user actually asks — keeps numbers out of the resting UI.
  const estimate = useMemo(
    () => (submitted ? estimateDesiMeal(submitted, personalGoal) : null),
    [submitted, personalGoal]
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = text.trim();
    if (!next) return;
    setSubmitted(next);
  }

  function tryExample(example: string) {
    setText(example);
    setSubmitted(example);
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
        <h2 className="font-display text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("helper")}</p>
      </div>

      <form onSubmit={submit} className="space-y-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder={t("placeholder")}
          className="w-full resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          {t("estimateBtn")}
        </button>
      </form>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("tryLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => tryExample(example)}
              className="rounded-pill border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/60 active:scale-[0.98]"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {estimate ? (
        <div className="space-y-3 rounded-field bg-background p-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("resultFor")}</p>
            <p className="text-sm font-semibold text-foreground">{estimate.input}</p>
          </div>

          {estimate.matches.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Metric label={t("calories")} value={`${estimate.caloriesMin}–${estimate.caloriesMax}`} unit="kcal" />
                <Metric label={t("protein")} value={`${estimate.proteinMin}–${estimate.proteinMax}`} unit="g" />
              </div>

              <div className="flex flex-col gap-2">
                {estimate.matches.map((match) => (
                  <div
                    key={`${match.food.name}-${match.matchedAlias}`}
                    className="rounded-field border border-border bg-card px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {match.quantity > 1 ? `${match.quantity} × ` : ""}
                      {match.food.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {match.food.serving} usually gives {match.food.caloriesMin}–{match.food.caloriesMax} kcal.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{match.food.notes}</p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">{t("rangeNote")}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{estimate.summary}</p>
          )}

          <div className="rounded-field bg-primary-soft px-3 py-2.5">
            <p className="text-sm font-medium text-primary">{estimate.goalFit}</p>
            <p className="mt-1 text-sm text-primary">{estimate.suggestion}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-field border border-dashed border-border px-6 py-8 text-center">
          <span className="text-2xl">🍽️</span>
          <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-field border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">
        {value}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}
