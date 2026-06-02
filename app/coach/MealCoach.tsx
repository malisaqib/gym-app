"use client";

import { useState } from "react";
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
        <h1 className="text-2xl font-bold">{t("title")}</h1>

      {remaining.cal !== null && (
        <p className="text-sm text-slate-500">
          {Math.max(0, remaining.cal)} kcal · {Math.max(0, remaining.protein ?? 0)} g protein {t("remaining")}
        </p>
      )}

      <form onSubmit={ask} className="flex flex-col gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("placeholder")}
          rows={3}
          className="rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="self-start rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
        >
          {busy ? t("thinking") : t("ask")}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {suggestion && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <Field label={t("best")} value={suggestion.best_option} strong />
          {suggestion.approx && <Field label={t("approx")} value={suggestion.approx} />}
          {suggestion.why && <Field label={t("why")} value={suggestion.why} />}
          {suggestion.avoid && <Field label={t("avoid")} value={suggestion.avoid} />}
          {suggestion.coach_note && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              💪 {suggestion.coach_note}
            </p>
          )}
        </div>
      )}
      </main>
      <BottomNav />
    </>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={strong ? "text-lg font-semibold text-slate-800" : "text-sm text-slate-700"}>
        {value}
      </p>
    </div>
  );
}
