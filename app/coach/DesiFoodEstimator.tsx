"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { estimateMeal } from "./actions";
import { estimateDesiMeal } from "@/lib/coach/desiFoodEstimator";
import { getGoalText } from "./localCoachTypes";
import { loadEmotionalGoal } from "./coachData";
import type { Lang } from "@/lib/database.types";

/**
 * Meal estimator (dataset-backed).
 *
 * Primary path: estimateMeal() uses the RAG-grounded parser over the full food
 * catalog (western + desi), so things like "beef burger" work. Falls back to
 * the static desi estimator if that's unavailable (offline / no key).
 *
 * Responsible-design: results are friendly RANGES (never exact), neutral tone,
 * and we end on one practical, non-judgmental tip.
 */

interface Display {
  input: string;
  caloriesMin: number;
  caloriesMax: number;
  proteinMin: number;
  proteinMax: number;
  items: { name: string; detail: string }[];
  tip: string;
}

const T = {
  eyebrow: { en: "Meal estimator", roman_urdu: "Meal estimator" },
  title: { en: "Estimate a meal without overthinking it", roman_urdu: "Bina zyada soche meal estimate karein" },
  helper: {
    en: "Type what you ate or plan to eat — any cuisine. We use friendly ranges; a home plate and a restaurant plate can be very different.",
    roman_urdu:
      "Likhein kya khaya ya plan hai — koi bhi cuisine. Hum ranges dete hain; ghar aur restaurant ki plate alag ho sakti hai.",
  },
  placeholder: { en: "e.g. 2 roti, chicken salan — or a beef burger", roman_urdu: "misal: 2 roti, chicken salan — ya beef burger" },
  estimateBtn: { en: "Estimate meal", roman_urdu: "Estimate karein" },
  estimating: { en: "Estimating…", roman_urdu: "Estimate ho raha hai…" },
  tryLabel: { en: "Quick try", roman_urdu: "Jaldi try karein" },
  emptyTitle: { en: "Nothing estimated yet", roman_urdu: "Abhi kuch estimate nahi hua" },
  emptyHint: { en: "Type a meal above, or tap an example.", roman_urdu: "Upar meal likhein, ya example tap karein." },
  resultFor: { en: "Result for", roman_urdu: "Result" },
  calories: { en: "Calories", roman_urdu: "Calories" },
  protein: { en: "Protein", roman_urdu: "Protein" },
  rangeNote: {
    en: "Rough ranges to guide you, not exact numbers.",
    roman_urdu: "Motay motay ranges, exact numbers nahi.",
  },
  tip: {
    en: "Plate check: protein first, then roti or rice, then salad or yogurt if you have it.",
    roman_urdu: "Plate check: pehle protein, phir roti ya rice, phir salad ya dahi agar ho.",
  },
  noMatch: {
    en: "Couldn't estimate that one — try simpler words like the main foods.",
    roman_urdu: "Ye estimate nahi hua — main foods ke simple lafz try karein.",
  },
} satisfies Record<string, Record<Lang, string>>;

const EXAMPLES = ["2 roti, daal", "chicken biryani", "beef burger", "2 eggs and oats"];

const round10 = (n: number) => Math.round(n / 10) * 10;

export default function DesiFoodEstimator({ lang = "en" }: { lang?: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Display | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personalGoal, setPersonalGoal] = useState("");

  useEffect(() => {
    let alive = true;
    loadEmotionalGoal()
      .then((goal) => {
        if (alive && goal) setPersonalGoal(getGoalText(goal));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function run(meal: string) {
    const input = meal.trim();
    if (!input || loading) return;
    setLoading(true);
    setError(null);

    const res = await estimateMeal(input);
    if (res.ok) {
      // Friendly ranges around the catalog estimate (never present as exact).
      setResult({
        input,
        caloriesMin: round10(res.calories * 0.9),
        caloriesMax: round10(res.calories * 1.1),
        proteinMin: Math.max(0, Math.round(res.protein * 0.85)),
        proteinMax: Math.round(res.protein * 1.15),
        items: res.items.map((i) => ({
          name: `${i.quantity > 1 ? `${i.quantity} × ` : ""}${i.food_name}`,
          detail: `~${i.calories} kcal · ${i.protein_g}g protein`,
        })),
        tip: t("tip"),
      });
    } else {
      // Fallback: static desi estimator (offline / no key).
      const s = estimateDesiMeal(input, personalGoal);
      if (s.matches.length > 0) {
        setResult({
          input,
          caloriesMin: s.caloriesMin,
          caloriesMax: s.caloriesMax,
          proteinMin: s.proteinMin,
          proteinMax: s.proteinMax,
          items: s.matches.map((m) => ({
            name: `${m.quantity > 1 ? `${m.quantity} × ` : ""}${m.food.name}`,
            detail: `${m.food.serving} · ~${m.caloriesMin}–${m.caloriesMax} kcal`,
          })),
          tip: s.suggestion,
        });
      } else {
        setResult(null);
        setError(t("noMatch"));
      }
    }
    setLoading(false);
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
        <h2 className="font-display text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("helper")}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(text);
        }}
        className="space-y-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={t("placeholder")}
          className="w-full resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || loading}
          className="inline-flex items-center gap-2 rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
          {loading ? t("estimating") : t("estimateBtn")}
        </button>
      </form>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("tryLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setText(ex);
                run(ex);
              }}
              className="rounded-pill border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/60 active:scale-[0.98]"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-muted-foreground">{error}</p>}

      {result && (
        <div className="space-y-3 rounded-field bg-background p-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("resultFor")}</p>
            <p className="text-sm font-semibold text-foreground">{result.input}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label={t("calories")} value={`${result.caloriesMin}–${result.caloriesMax}`} unit="kcal" />
            <Metric label={t("protein")} value={`${result.proteinMin}–${result.proteinMax}`} unit="g" />
          </div>

          <div className="flex flex-col gap-2">
            {result.items.map((item, i) => (
              <div key={`${item.name}-${i}`} className="rounded-field border border-border bg-card px-3 py-2">
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{t("rangeNote")}</p>

          <div className="rounded-field bg-primary-soft px-3 py-2.5">
            <p className="text-sm text-primary">{result.tip}</p>
          </div>
        </div>
      )}

      {!result && !error && !loading && (
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
