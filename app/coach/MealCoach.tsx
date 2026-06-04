"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { listContainer, listItem, springSoft } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Lang } from "@/lib/database.types";
import type { MealSuggestion } from "@/lib/coach/mealCoach";
import { buildCoachFocus } from "@/lib/coach/goalContext";
import { EMOTIONAL_GOAL_KEY, readLocal } from "@/lib/coach/localStore";
import { DEFAULT_EMOTIONAL_GOAL } from "./localCoachTypes";
import { suggestMeal } from "./actions";

function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// EN / Roman Urdu copy for the static chrome.
const T = {
  title: { en: "What should I eat?", roman_urdu: "Kya khaon?" },
  intro: {
    en: "Tell me what you've got — I'll pick the best next meal.",
    roman_urdu: "Bataiye aap ke paas kya hai — main best meal chunta hoon.",
  },
  placeholder: {
    en: "e.g. Mere paas anda, roti, daal, chicken hai. Kya khaon?",
    roman_urdu: "e.g. Mere paas anda, roti, daal, chicken hai. Kya khaon?",
  },
  ask: { en: "Ask", roman_urdu: "Poochein" },
  thinking: { en: "Thinking…", roman_urdu: "Soch raha hoon…" },
  tryThese: { en: "Try one of these", roman_urdu: "In mein se koshish karein" },
  best: { en: "Best option", roman_urdu: "Behtareen option" },
  why: { en: "Why", roman_urdu: "Kyun behtar hai" },
  avoid: { en: "Avoid", roman_urdu: "Kya avoid karein" },
  remaining: { en: "left today", roman_urdu: "aaj baqi" },
  sendHint: { en: "⌘ + Enter to send", roman_urdu: "⌘ + Enter se bhejein" },
} satisfies Record<string, Record<Lang, string>>;

const EXAMPLES: Record<Lang, string[]> = {
  en: [
    "I have eggs, roti, daal and chicken — what should I eat?",
    "I have 500 calories left and need protein",
    "What's a light dinner?",
  ],
  roman_urdu: [
    "Mere paas anda, roti, daal aur chicken hai",
    "500 calories bachi hain, protein chahiye",
    "Halka dinner kya ho?",
  ],
};

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

  // The user's motivation goal (from Home), translated to a neutral behaviour
  // focus so the coach's advice feels personal. Read from localStorage on mount.
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    const goal = readLocal(EMOTIONAL_GOAL_KEY, DEFAULT_EMOTIONAL_GOAL);
    const hasGoal = goal.selectedPreset || goal.customGoal.trim();
    setFocus(hasGoal ? buildCoachFocus(goal) : null);
  }, []);

  async function runAsk(q: string) {
    const query = q.trim();
    if (!query || busy) return;
    setQuestion(query);
    setBusy(true);
    setError(null);
    try {
      const res = await suggestMeal({ question: query, date: localDateString(), focus });
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

  const showExamples = !busy && !suggestion && !error;

  return (
    <div className="flex flex-col gap-6">
        <header className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {t("title")}
          </h1>
          {remaining.cal !== null ? (
            <div className="inline-flex items-center gap-1.5 rounded-pill bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="tabular-nums">{Math.max(0, remaining.cal)} kcal</span>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">{Math.max(0, remaining.protein ?? 0)} g protein</span>
              <span className="opacity-70">{t("remaining")}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("intro")}</p>
          )}
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runAsk(question);
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                runAsk(question);
              }
            }}
            placeholder={t("placeholder")}
            rows={3}
            disabled={busy}
            className="resize-none rounded-field border border-input bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground transition focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="hidden text-xs text-muted-foreground sm:block">{t("sendHint")}</span>
            <Button type="submit" loading={busy} disabled={busy || !question.trim()} className="ml-auto">
              {busy ? t("thinking") : t("ask")}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        {/* One area that cross-fades between examples → loading → result */}
        <AnimatePresence mode="wait">
          {busy && <LoadingCard key="loading" />}

          {!busy && suggestion && (
            <ResultCard key={`result-${seq}`} suggestion={suggestion} t={t} />
          )}

          {showExamples && (
            <motion.div
              key="examples"
              variants={listContainer}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              className="flex flex-col gap-2"
            >
              <motion.p variants={listItem} className="text-xs font-medium text-muted-foreground">
                {t("tryThese")}
              </motion.p>
              {EXAMPLES[lang].map((ex) => (
                <motion.button
                  key={ex}
                  variants={listItem}
                  type="button"
                  onClick={() => runAsk(ex)}
                  className="rounded-field border border-border bg-card px-4 py-3 text-left text-sm text-foreground shadow-soft transition hover:border-primary/40 hover:bg-muted active:scale-[0.99]"
                >
                  {ex}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}

// Calm "thinking" placeholder that cross-fades into the answer.
function LoadingCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={springSoft}
      className="space-y-4 rounded-card border border-border bg-card p-5 shadow-soft"
    >
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-5 w-40 rounded-pill" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </motion.div>
  );
}

function ResultCard({
  suggestion,
  t,
}: {
  suggestion: MealSuggestion;
  t: (k: keyof typeof T) => string;
}) {
  return (
    <motion.div
      variants={listContainer}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: 8, transition: { duration: 0.12 } }}
      className="overflow-hidden rounded-card border border-border bg-card shadow-soft"
    >
      <div className="space-y-4 p-5">
        {/* hero: the recommendation */}
        <motion.div variants={listItem}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("best")}
          </p>
          <p className="mt-1 font-display text-xl font-semibold leading-snug text-foreground">
            {suggestion.best_option}
          </p>
          {suggestion.approx && (
            <span className="mt-2 inline-block rounded-pill bg-muted px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              ≈ {suggestion.approx}
            </span>
          )}
        </motion.div>

        {suggestion.why && (
          <motion.div variants={listItem}>
            <Field label={t("why")} value={suggestion.why} />
          </motion.div>
        )}
        {suggestion.avoid && (
          <motion.div variants={listItem}>
            <Field label={t("avoid")} value={suggestion.avoid} />
          </motion.div>
        )}
      </div>

      {suggestion.coach_note && (
        <motion.p
          variants={listItem}
          className="border-t border-border bg-primary-soft px-5 py-3 text-sm text-primary"
        >
          💪 {suggestion.coach_note}
        </motion.p>
      )}
    </motion.div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-foreground">{value}</p>
    </div>
  );
}
