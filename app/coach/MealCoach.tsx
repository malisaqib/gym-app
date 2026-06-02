"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { sheetUp } from "@/lib/motion";
import type { Lang } from "@/lib/database.types";
import type { MealSuggestion } from "@/lib/coach/mealCoach";
import { suggestMeal } from "./actions";
import BottomNav from "@/components/BottomNav";

function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Tiny EN / Roman Urdu label helper for the static chrome.
const T = {
  title: { en: "What should I eat?", roman_urdu: "Kya khaon?" },
  placeholder: {
    en: "e.g. Mere paas anda, roti, daal, chicken hai. Kya khaon?",
    roman_urdu: "e.g. Mere paas anda, roti, daal, chicken hai. Kya khaon?",
  },
  ask: { en: "Ask", roman_urdu: "Poochein" },
  thinking: { en: "Thinking…", roman_urdu: "Soch raha hoon…" },
  best: { en: "Best option", roman_urdu: "Behtareen option" },
  approx: { en: "Approx", roman_urdu: "Takriban" },
  why: { en: "Why", roman_urdu: "Kyun behtar hai" },
  avoid: { en: "Avoid", roman_urdu: "Kya avoid karein" },
  note: { en: "Coach", roman_urdu: "Coach" },
  remaining: { en: "left today", roman_urdu: "aaj baqi" },
} satisfies Record<string, Record<Lang, string>>;

export default function MealCoach({ lang }: { lang: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<MealSuggestion | null>(null);
  const [seq, setSeq] = useState(0); // bumps each answer so the card re-animates
  const [remaining, setRemaining] = useState<{ cal: number | null; protein: number | null }>({
    cal: null,
    protein: null,
  });

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await suggestMeal({ question, date: localDateString() });
      if (res.ok) {
        setSuggestion(res.suggestion);
        setRemaining({ cal: res.remainingCalories, protein: res.remainingProtein });
        setSeq((n) => n + 1);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 pb-24 pt-8">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>

        {remaining.cal !== null && (
          <p className="text-sm text-muted-foreground">
            {Math.max(0, remaining.cal)} kcal · {Math.max(0, remaining.protein ?? 0)} g protein {t("remaining")}
          </p>
        )}

        <form onSubmit={ask} className="flex flex-col gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("placeholder")}
            rows={3}
            className="rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="inline-flex items-center justify-center gap-2 self-start rounded-field bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
          >
            {busy && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {busy ? t("thinking") : t("ask")}
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        {suggestion && (
          <motion.div
            key={seq}
            variants={sheetUp}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-soft"
          >
            <Field label={t("best")} value={suggestion.best_option} strong />
            {suggestion.approx && <Field label={t("approx")} value={suggestion.approx} />}
            {suggestion.why && <Field label={t("why")} value={suggestion.why} />}
            {suggestion.avoid && <Field label={t("avoid")} value={suggestion.avoid} />}
            {suggestion.coach_note && (
              <p className="rounded-field bg-primary-soft px-3 py-2 text-sm text-primary">
                💪 {suggestion.coach_note}
              </p>
            )}
          </motion.div>
        )}
      </main>
      <BottomNav />
    </>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={strong ? "text-lg font-semibold text-foreground" : "text-sm text-foreground"}>
        {value}
      </p>
    </div>
  );
}
