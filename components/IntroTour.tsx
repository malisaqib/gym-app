"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import type { Lang } from "@/lib/database.types";

/**
 * One-time, skippable walkthrough of the bottom tabs. Shown on the first visit
 * only (gated by a localStorage flag) — purely informational, no logic. A mini
 * tab strip highlights the tab each step describes, mirroring the real nav.
 */

const SEEN_KEY = "gymCoach.hasSeenIntro";

interface TourStep {
  emoji: string;
  title: Record<Lang, string>;
  body: Record<Lang, string>;
}

const STEPS: TourStep[] = [
  {
    emoji: "🏠",
    title: { en: "Home", roman_urdu: "Home" },
    body: {
      en: "Log what you eat and see your calories & protein left for today.",
      roman_urdu: "Jo khaayein log karein aur dekhein aaj ki calories/protein kitni baqi hain.",
    },
  },
  {
    emoji: "🍽️",
    title: { en: "Eat", roman_urdu: "Eat" },
    body: {
      en: "Ask the coach what to eat next, or estimate any meal's calories.",
      roman_urdu: "Coach se poochein ab kya khaayein, ya kisi meal ki calories ka andaza lagayein.",
    },
  },
  {
    emoji: "🥗",
    title: { en: "Plan", roman_urdu: "Plan" },
    body: {
      en: "Get a full day of meals built to hit your daily calories & protein.",
      roman_urdu: "Poora din ka meal plan jo aap ki rozana calories aur protein pe set ho.",
    },
  },
  {
    emoji: "🏋️",
    title: { en: "Train", roman_urdu: "Train" },
    body: {
      en: "Your workout plan, built from your goal — log sets as you go.",
      roman_urdu: "Aap ke goal se bana workout plan — sets log karte jayein.",
    },
  },
  {
    emoji: "📈",
    title: { en: "Progress", roman_urdu: "Progress" },
    body: {
      en: "Log your weight and watch the trend toward your goal.",
      roman_urdu: "Apna wazan log karein aur goal ki taraf trend dekhein.",
    },
  },
];

export default function IntroTour({ lang }: { lang: Lang }) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  // Only show on the very first visit.
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // localStorage unavailable (private mode) — just don't show the tour.
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }

  function next() {
    if (step < STEPS.length - 1) {
      haptic("tap");
      setStep((s) => s + 1);
    } else {
      haptic("success");
      dismiss();
    }
  }

  if (!open) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const t = (r: Record<Lang, string>) => r[lang];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          key={step}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mx-auto mb-24 w-full max-w-md px-4"
        >
          <Card className="space-y-4 p-5">
            {/* Mini tab strip — highlights the tab this step is about. */}
            <div className="flex items-stretch justify-around rounded-field bg-muted p-1.5">
              {STEPS.map((st, i) => (
                <span
                  key={st.emoji}
                  className={`flex flex-1 items-center justify-center rounded-pill py-1.5 text-lg transition ${
                    i === step ? "scale-110 bg-primary-soft" : "opacity-40"
                  }`}
                  aria-hidden
                >
                  {st.emoji}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden>
                {s.emoji}
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  {step + 1} / {STEPS.length}
                </p>
                <h2 className="font-display text-lg font-semibold text-foreground">{t(s.title)}</h2>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">{t(s.body)}</p>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-field px-2 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
              >
                {lang === "roman_urdu" ? "Chhor dein" : "Skip"}
              </button>
              <Button size="sm" onClick={next}>
                {isLast
                  ? lang === "roman_urdu"
                    ? "Shuru karein"
                    : "Got it"
                  : lang === "roman_urdu"
                    ? "Aage"
                    : "Next"}
              </Button>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
