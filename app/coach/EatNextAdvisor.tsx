"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { adviseEatNext } from "@/lib/coach/desiFoodEstimator";
import { EMOTIONAL_GOAL_KEY, BUDGET_KEY, readLocal } from "@/lib/coach/localStore";
import {
  DEFAULT_EMOTIONAL_GOAL,
  DEFAULT_BUDGET_PROFILE,
  getGoalText,
  getBudgetLabel,
} from "./localCoachTypes";
import type { Lang } from "@/lib/database.types";

/**
 * Phase 5 — "What should I eat next?" advisor (static, instant, NO AI).
 *
 * Self-contained: reads the saved goal + budget from localStorage and runs the
 * static desi-food advisor (lib/coach/desiFoodEstimator). Complements the AI
 * meal coach above with an offline, always-works pick. Tone is practical and
 * non-judgmental — never shaming a choice.
 */

const T = {
  eyebrow: { en: "Eat next", roman_urdu: "Ab kya khaon" },
  prompt: { en: "What are your options right now?", roman_urdu: "Abhi aap ke paas kya options hain?" },
  helper: {
    en: "List what you have, or what you're choosing between. I'll suggest a pick — no judgment.",
    roman_urdu: "Jo aap ke paas hai ya jin mein se choose kar rahe hain likhein. Main pick batata hoon — bina judgment.",
  },
  placeholder: {
    en: "e.g. roti, daal, eggs, banana — or biryani vs shawarma",
    roman_urdu: "misal: roti, daal, anday, kela — ya biryani vs shawarma",
  },
  askBtn: { en: "Suggest", roman_urdu: "Batayein" },
  best: { en: "Best pick", roman_urdu: "Behtareen pick" },
  okay: { en: "Also okay", roman_urdu: "Ye bhi theek" },
  easy: { en: "Go easy on", roman_urdu: "Thora kam" },
  portion: { en: "Portion", roman_urdu: "Portion" },
  why: { en: "Why", roman_urdu: "Kyun" },
  tip: { en: "Tip", roman_urdu: "Tip" },
} satisfies Record<string, Record<Lang, string>>;

export default function EatNextAdvisor({ lang = "en" }: { lang?: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [goalText, setGoalText] = useState("");
  const [budgetLabel, setBudgetLabel] = useState("");
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");

  // Pull saved goal + budget (used to tailor the pick) once on mount.
  useEffect(() => {
    setGoalText(getGoalText(readLocal(EMOTIONAL_GOAL_KEY, DEFAULT_EMOTIONAL_GOAL)));
    setBudgetLabel(getBudgetLabel(readLocal(BUDGET_KEY, DEFAULT_BUDGET_PROFILE)));
  }, []);

  const advice = useMemo(
    () =>
      submitted
        ? adviseEatNext({ optionsText: submitted, personalGoal: goalText || null, budgetLabel: budgetLabel || null })
        : null,
    [submitted, goalText, budgetLabel]
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = text.trim();
    if (next) setSubmitted(next);
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
        <h2 className="font-display text-lg font-semibold text-foreground">{t("prompt")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("helper")}</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={t("placeholder")}
          className="resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="self-start rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          {t("askBtn")}
        </button>
      </form>

      {advice && (
        <div className="space-y-3">
          <Row label={t("best")} value={advice.best} tone="primary" />
          <Row label={t("okay")} value={advice.okay} tone="muted" />
          <Row label={t("easy")} value={advice.limit} tone="warning" />
          <div className="rounded-field bg-muted px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("portion")}</p>
            <p className="mt-0.5 text-sm text-foreground">{advice.portion}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t("why")}:</span> {advice.reason}
          </p>
          {advice.nextAction && (
            <p className="rounded-field bg-primary-soft px-3 py-2 text-sm text-primary">
              💡 {advice.nextAction}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "primary" | "muted" | "warning" }) {
  const labelColor =
    tone === "primary" ? "text-primary" : tone === "warning" ? "text-warning" : "text-muted-foreground";
  return (
    <div>
      <p className={`text-xs font-medium uppercase tracking-wide ${labelColor}`}>{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
