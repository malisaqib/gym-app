"use client";

import { motion } from "motion/react";
import { listContainer, listItem } from "@/lib/motion";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import BottomNav from "@/components/BottomNav";
import MealCoach from "./MealCoach";
import EmotionalGoalOnboarding from "./EmotionalGoalOnboarding";
import DesiFoodEstimator from "./DesiFoodEstimator";
import BudgetFitnessMode from "./BudgetFitnessMode";
import type { Lang } from "@/lib/database.types";

/**
 * Phase 1 — Coach dashboard shell (visual only).
 *
 * Lays out the coach landing: welcome, today's focus, quick actions, and the
 * feature sections. The "Ask the coach" section embeds the existing MealCoach
 * (its AI logic is untouched). Goal / check-in / progress show friendly empty
 * states for now; their real components get wired in later phases.
 *
 * Copy is intentionally encouraging, habit-based, and non-judgmental — no
 * appearance framing, no good/bad-food language.
 */

const T = {
  hi: { en: "Salam", roman_urdu: "Salam" },
  welcomeLine: {
    en: "Your coach is here — one small, doable step at a time.",
    roman_urdu: "Aap ka coach yahan hai — ek chhota, asaan step ek baar mein.",
  },
  focusTitle: { en: "Today's focus", roman_urdu: "Aaj ka focus" },
  focusBody: {
    en: "Protein with each meal, a little water before you eat, and a short walk. Consistency beats perfection.",
    roman_urdu:
      "Har meal mein protein, khaane se pehle thora pani, aur ek choti walk. Consistency hi sab kuch hai.",
  },
  qEat: { en: "What should I eat next?", roman_urdu: "Ab kya khaon?" },
  qGoal: { en: "Update my goal", roman_urdu: "Goal update karein" },
  qCheckin: { en: "Weekly check-in", roman_urdu: "Weekly check-in" },
  qProgress: { en: "View progress", roman_urdu: "Progress dekhein" },
  goalTitle: { en: "Your goal", roman_urdu: "Aap ka goal" },
  goalEmpty: {
    en: "Set a goal so your coach can personalise advice. Coming up in this update.",
    roman_urdu: "Goal set karein taake coach personalize kar sake. Is update mein aa raha hai.",
  },
  checkinTitle: { en: "Weekly check-in", roman_urdu: "Weekly check-in" },
  checkinEmpty: {
    en: "Your weekly check-in will live here — energy, sleep, and consistency, not just the scale.",
    roman_urdu: "Yahan weekly check-in hoga — energy, neend, aur consistency, sirf wazan nahi.",
  },
  progressTitle: { en: "Your progress", roman_urdu: "Aap ki progress" },
  progressEmpty: {
    en: "Complete your first weekly check-in to see your progress.",
    roman_urdu: "Pehla weekly check-in mukammal karein, phir progress dikhegi.",
  },
} satisfies Record<string, Record<Lang, string>>;

export default function CoachDashboard({ lang, name }: { lang: Lang; name: string | null }) {
  const t = (k: keyof typeof T) => T[k][lang];
  const firstName = name?.trim().split(" ")[0] ?? "";

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const actions = [
    { id: "coach", emoji: "🍽️", label: t("qEat") },
    { id: "goal", emoji: "🎯", label: t("qGoal") },
    { id: "checkin", emoji: "📝", label: t("qCheckin") },
    { id: "progress", emoji: "📈", label: t("qProgress") },
  ];

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 pb-28 pt-8">
        {/* Header block animates in as a gentle stagger */}
        <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-5">
          <motion.div variants={listItem}>
            <Card className="p-5">
              <h1 className="font-display text-2xl font-semibold text-foreground">
                {t("hi")}
                {firstName ? `, ${firstName}` : ""} 👋
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("welcomeLine")}</p>
            </Card>
          </motion.div>

          <motion.div variants={listItem}>
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("focusTitle")}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">{t("focusBody")}</p>
            </Card>
          </motion.div>

          <motion.div variants={listItem} className="grid grid-cols-2 gap-2">
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => goTo(a.id)}
                className="flex items-center gap-2 rounded-card border border-border bg-card px-3 py-3 text-left text-sm font-medium text-foreground shadow-soft transition hover:border-primary/40 hover:bg-muted active:scale-[0.98]"
              >
                <span className="text-lg leading-none">{a.emoji}</span>
                <span className="leading-tight">{a.label}</span>
              </button>
            ))}
          </motion.div>
        </motion.div>

        {/* Ask the coach — the existing meal advisor, embedded (logic unchanged) */}
        <section id="coach" className="scroll-mt-4">
          <MealCoach lang={lang} />
        </section>

        {/* Goal — Phase 2: motivation/emotional goal (self-contained, localStorage) */}
        <section id="goal" className="scroll-mt-4">
          <EmotionalGoalOnboarding lang={lang} />
        </section>

        {/* Estimate — Phase 3: desi food estimator (static, dataset-driven) */}
        <section id="estimate" className="scroll-mt-4">
          <DesiFoodEstimator lang={lang} />
        </section>

        {/* Budget — Phase 4: realistic, repeatable meals on a student budget */}
        <section id="budget" className="scroll-mt-4">
          <BudgetFitnessMode lang={lang} />
        </section>

        {/* Weekly check-in — wired in Phase 6 */}
        <section id="checkin" className="scroll-mt-4 space-y-2">
          <h2 className="font-display text-lg font-semibold text-foreground">{t("checkinTitle")}</h2>
          <EmptyState icon="📝" title={t("checkinEmpty")} />
        </section>

        {/* Progress — wired in Phase 7 */}
        <section id="progress" className="scroll-mt-4 space-y-2">
          <h2 className="font-display text-lg font-semibold text-foreground">{t("progressTitle")}</h2>
          <EmptyState icon="📈" title={t("progressEmpty")} />
        </section>
      </main>
      <BottomNav />
    </>
  );
}
