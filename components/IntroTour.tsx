"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Sparkles,
  Home,
  Utensils,
  ClipboardList,
  Dumbbell,
  TrendingUp,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import type { Lang } from "@/lib/database.types";

/**
 * Skippable feature walkthrough — shown ONLY when explicitly launched:
 *   • once after onboarding (`/dashboard?tour=1` from the onboarding finale)
 *   • when the user taps "Replay app tour" in Settings (same param)
 *
 * It does NOT auto-open on every login or first dashboard visit; that was
 * confusing returning users who hadn't dismissed the overlay yet.
 * Purely informational. The mini tab strip mirrors the real bottom nav.
 */

const SEEN_KEY = "gymCoach.hasSeenIntro";

// Bottom-tab icons in real nav order — the mini strip mirrors BottomNav.
const TAB_ICONS: LucideIcon[] = [Home, Utensils, ClipboardList, Dumbbell, TrendingUp];

interface TourStep {
  icon: LucideIcon;
  highlight: number | null; // index into TAB_ICONS, or null for welcome/closing
  title: Record<Lang, string>;
  body: Record<Lang, string>;
}

const STEPS: TourStep[] = [
  {
    icon: Sparkles,
    highlight: null,
    title: { en: "Welcome to Zorfit", roman_urdu: "Zorfit mein khush aamdeed" },
    body: {
      en: "Your targets are set. Here's a 30-second tour of the five tabs — skip anytime.",
      roman_urdu: "Aap ke targets set hain. Ye paanch tabs ka 30-second tour hai — jab chahein chhor dein.",
    },
  },
  {
    icon: Home,
    highlight: 0,
    title: { en: "Home — log & track", roman_urdu: "Home — log aur track" },
    body: {
      en: "Type what you ate in plain words (English or Roman Urdu) and watch your calories & protein left for today. This is your daily check-in.",
      roman_urdu: "Jo khaaya simple alfaaz mein likhein (English ya Roman Urdu) aur dekhein aaj ki calories/protein kitni baqi hain. Ye aap ka rozana check-in hai.",
    },
  },
  {
    icon: Utensils,
    highlight: 1,
    title: { en: "Eat — ask the coach", roman_urdu: "Eat — coach se poochein" },
    body: {
      en: "Not sure what to eat next? The coach suggests a meal that fits your calories left — or estimates any meal you describe.",
      roman_urdu: "Samajh nahi aa raha ab kya khaayein? Coach aap ki baqi calories ke hisaab se meal batata hai — ya kisi bhi meal ka andaza laga deta hai.",
    },
  },
  {
    icon: ClipboardList,
    highlight: 2,
    title: { en: "Plan — your day's meals", roman_urdu: "Plan — din ka khana" },
    body: {
      en: "A simple full-day plan built to hit your protein and calories from everyday foods. Swap anything you don't fancy — it stays on target.",
      roman_urdu: "Rozmarra ke khane se bana ek simple poora-din plan jo aap ka protein aur calories poora kare. Jo pasand na ho swap karein — target par rehta hai.",
    },
  },
  {
    icon: Dumbbell,
    highlight: 3,
    title: { en: "Train — your workout", roman_urdu: "Train — workout" },
    body: {
      en: "A workout plan matched to your goal, level and equipment. Log your sets as you go and it remembers your last session.",
      roman_urdu: "Aap ke goal, level aur saaman ke mutabiq workout plan. Sets log karte jayein — ye aap ka pichla session yaad rakhta hai.",
    },
  },
  {
    icon: TrendingUp,
    highlight: 4,
    title: { en: "Progress — see it work", roman_urdu: "Progress — nateeja dekhein" },
    body: {
      en: "Log your weight to see the trend toward your goal. Your targets quietly adapt as your weight changes, so you stay on track.",
      roman_urdu: "Apna wazan log karein aur goal ki taraf trend dekhein. Wazan badalne par aap ke targets khud adjust hote hain.",
    },
  },
  {
    icon: CheckCircle2,
    highlight: null,
    title: { en: "You're all set", roman_urdu: "Sab tayyar hai" },
    body: {
      en: "Start by logging your first meal on Home. You can replay this tour anytime from Settings.",
      roman_urdu: "Home par apna pehla meal log kar ke shuru karein. Ye tour kabhi bhi Settings se dobara dekh sakte hain.",
    },
  },
];

const UI = {
  skip: { en: "Skip", roman_urdu: "Chhor dein" },
  back: { en: "Back", roman_urdu: "Peeche" },
  next: { en: "Next", roman_urdu: "Aage" },
  start: { en: "Start logging", roman_urdu: "Shuru karein" },
} satisfies Record<string, Record<Lang, string>>;

export default function IntroTour({ lang, forceTour = false }: { lang: Lang; forceTour?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  // Only open when the URL (or Settings link) passes ?tour=1 — not on every login.
  useEffect(() => {
    if (forceTour) setOpen(true);
  }, [forceTour]);

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
    // Strip ?tour=1 so a refresh doesn't relaunch it (no-op if absent).
    if (forceTour) router.replace("/dashboard");
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

  function back() {
    if (step === 0) return;
    haptic("tap");
    setStep((s) => s - 1);
  }

  if (!open) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const t = (r: Record<Lang, string>) => r[lang];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col justify-end bg-black/55 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={t(s.title)}
      >
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mx-auto mb-24 w-full max-w-md px-4"
        >
          <Card className="space-y-4 p-5">
            {/* Mini tab strip — mirrors the real bottom nav, highlights this step. */}
            <div className="flex items-stretch justify-around rounded-field bg-muted p-1.5">
              {TAB_ICONS.map((Icon, i) => (
                <span
                  key={i}
                  className={`flex flex-1 items-center justify-center rounded-pill py-1.5 transition ${
                    i === s.highlight ? "scale-110 bg-primary-soft" : ""
                  }`}
                  aria-hidden
                >
                  <Icon size={18} className={i === s.highlight ? "text-primary" : "text-muted-foreground"} />
                </span>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <s.icon size={28} className="shrink-0 text-primary" aria-hidden />
              <h2 className="font-display text-lg font-semibold text-foreground">{t(s.title)}</h2>
            </div>

            <p className="min-h-[3.5rem] text-sm leading-relaxed text-muted-foreground">{t(s.body)}</p>

            {/* Progress dots */}
            <div className="flex justify-center gap-1.5" aria-hidden>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === step ? "w-5 bg-primary" : "w-1.5 bg-border"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {step === 0 ? (
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-field px-2 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                >
                  {t(UI.skip)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={back}
                  className="rounded-field px-2 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                >
                  {t(UI.back)}
                </button>
              )}
              <Button size="sm" onClick={next}>
                {isLast ? t(UI.start) : t(UI.next)}
              </Button>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
