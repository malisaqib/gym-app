"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { listContainer, listItem } from "@/lib/motion";
import { Card } from "@/components/ui/Card";
import BottomNav from "@/components/BottomNav";
import MealCoach from "./MealCoach";
import DesiFoodEstimator from "./DesiFoodEstimator";
import type { Lang } from "@/lib/database.types";

/**
 * Coach dashboard (the "Eat" tab).
 *
 * Focused on food decisions: the AI "What should I eat?" coach + a meal
 * estimator. Goal lives on Home, budget in Settings, check-ins/progress in the
 * Progress tab. Encouraging, habit-based, non-judgmental copy.
 */

const T = {
  hi: { en: "Salam", roman_urdu: "Salam" },
  welcomeLine: {
    en: "Let's sort out food — simple, doable, no judgment.",
    roman_urdu: "Chalein khane ko asaan banayein — bina judgment.",
  },
  focusTitle: { en: "Today's focus", roman_urdu: "Aaj ka focus" },
  focusBody: {
    en: "Protein with each meal, a little water before you eat, and a short walk. Consistency beats perfection.",
    roman_urdu:
      "Har meal mein protein, khaane se pehle thora pani, aur ek choti walk. Consistency hi sab kuch hai.",
  },
  qEat: { en: "What should I eat next?", roman_urdu: "Ab kya khaon?" },
  qEstimate: { en: "Estimate a meal", roman_urdu: "Meal estimate karein" },
  planTitle: { en: "Build my day's plan", roman_urdu: "Mere din ka plan banayein" },
  planBody: {
    en: "A simple, repeatable day of meals built around your targets.",
    roman_urdu: "Aap ke targets ke mutabiq ek asaan, repeatable din ka plan.",
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
    { id: "estimate", emoji: "🔢", label: t("qEstimate") },
  ];

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 pb-28 pt-8">
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

          <motion.div variants={listItem}>
            <Link href="/diet" className="block">
              <Card className="flex items-center justify-between p-5 transition hover:border-primary/40 hover:bg-muted active:scale-[0.99]">
                <div>
                  <h2 className="font-display text-base font-semibold text-foreground">🥗 {t("planTitle")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("planBody")}</p>
                </div>
                <span className="shrink-0 text-muted-foreground">→</span>
              </Card>
            </Link>
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

        {/* Ask the coach — AI meal advisor (logic unchanged) */}
        <section id="coach" className="scroll-mt-4">
          <MealCoach lang={lang} />
        </section>

        {/* Meal estimator — dataset-backed (western + desi), friendly ranges */}
        <section id="estimate" className="scroll-mt-4">
          <DesiFoodEstimator lang={lang} />
        </section>
      </main>
      <BottomNav />
    </>
  );
}
