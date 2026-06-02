"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { fadeUp } from "@/lib/motion";
import {
  STEPS,
  UI,
  type Localized,
  type OnboardingInput,
} from "@/lib/onboarding/questions";
import type {
  Experience,
  FoodPreference,
  Lang,
  OnboardingEntry,
  RelatableGoalKey,
  Sex,
  Timeline,
  TrainingLocation,
} from "@/lib/database.types";
import type { TargetResult } from "@/lib/nutrition/engine";
import type { PlanGuidance } from "@/lib/onboarding/goals";
import { saveOnboarding } from "./actions";

type Status = "asking" | "submitting" | "done" | "error";
type AnswerValue = string | number;

export default function Onboarding({ initialLang }: { initialLang: Lang }) {
  const router = useRouter();

  const [lang, setLang] = useState<Lang>(initialLang);
  const [index, setIndex] = useState(0); // which step we're on
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [transcript, setTranscript] = useState<OnboardingEntry[]>([]);
  const [draft, setDraft] = useState(""); // text/number/select being typed/picked
  const [inputError, setInputError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("asking");
  const [result, setResult] = useState<TargetResult | null>(null);
  const [guidance, setGuidance] = useState<PlanGuidance | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Translate a localized string into the current language.
  const tr = (loc: Localized) => loc[lang];

  const currentStep = STEPS[index];
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the conversation scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [index, status, transcript.length]);

  // Record an answer for the current step, then advance or submit.
  function recordAnswer(value: AnswerValue, message: string) {
    const step = STEPS[index];
    const nextAnswers = { ...answers, [step.key]: value };
    const nextTranscript: OnboardingEntry[] = [
      ...transcript,
      { key: step.key, value, message, lang },
    ];
    setAnswers(nextAnswers);
    setTranscript(nextTranscript);
    setDraft("");
    setInputError(null);

    if (index === STEPS.length - 1) {
      void submit(nextAnswers, nextTranscript);
    } else {
      setIndex(index + 1);
    }
  }

  async function submit(a: Record<string, AnswerValue>, t: OnboardingEntry[]) {
    setStatus("submitting");
    setSubmitError(null);

    const payload: OnboardingInput = {
      relatableGoal: a.relatableGoal as RelatableGoalKey,
      timeline: a.timeline as Timeline,
      sex: a.sex as Sex,
      age: Number(a.age),
      heightCm: Number(a.heightCm),
      weightKg: Number(a.weightKg),
      trainingLocation: a.trainingLocation as TrainingLocation,
      trainingDays: Number(a.trainingDays),
      experience: a.experience as Experience,
      foodPreference: a.foodPreference as FoodPreference,
      notes: typeof a.notes === "string" ? a.notes : "",
      preferredLanguage: lang,
      transcript: t,
    };

    const res = await saveOnboarding(payload);
    if (res.ok) {
      setResult(res.result);
      setGuidance(res.guidance);
      setStatus("done");
    } else {
      setSubmitError(res.error || tr(UI.genericError));
      setStatus("error");
    }
  }

  // --- input handlers per widget type ---------------------------------------

  function onNumberSubmit() {
    if (currentStep.kind !== "number") return;
    const n = Number(draft);
    if (!Number.isFinite(n) || n < currentStep.min || n > currentStep.max) {
      setInputError(tr(UI.invalidNumber));
      return;
    }
    recordAnswer(n, draft.trim());
  }

  function onSelectSubmit() {
    if (currentStep.kind !== "select" || !draft) return;
    const opt = currentStep.options.find((o) => o.value === draft);
    if (opt) recordAnswer(opt.value, tr(opt.label));
  }

  // --- render ---------------------------------------------------------------

  const answeredCount = transcript.length;

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col bg-background">
      {/* Header with language toggle */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div>
          <p className="font-semibold text-foreground">{tr(UI.headerTitle)}</p>
          <p className="text-xs text-muted-foreground">
            {answeredCount}/{STEPS.length}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-pill border border-border text-xs">
          <button
            onClick={() => setLang("en")}
            className={`px-3 py-1 transition-colors ${lang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            English
          </button>
          <button
            onClick={() => setLang("roman_urdu")}
            className={`px-3 py-1 transition-colors ${lang === "roman_urdu" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Roman Urdu
          </button>
        </div>
      </header>

      {/* Conversation */}
      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <BotBubble>{tr(UI.intro)}</BotBubble>

        {/* Each answered step: the question, then what the user "said". */}
        {transcript.map((entry, i) => (
          <div key={i} className="contents">
            <BotBubble>{tr(STEPS[i].prompt)}</BotBubble>
            <UserBubble>{entry.message || "—"}</UserBubble>
          </div>
        ))}

        {/* The current, unanswered question (keyed so each new one animates in) */}
        {status === "asking" && currentStep && (
          <BotBubble key={`q-${index}`}>{tr(currentStep.prompt)}</BotBubble>
        )}

        {status === "submitting" && <BotBubble>{tr(UI.calculating)}</BotBubble>}

        {status === "done" && result && (
          <BotBubble>
            <p className="mb-2">{tr(UI.doneTitle)}</p>
            <div className="flex gap-2">
              <TargetPill label={tr(UI.caloriesLabel)} value={`${result.calorieTarget}`} unit="kcal" />
              <TargetPill label={tr(UI.proteinLabel)} value={`${result.proteinTargetG}`} unit="g" />
            </div>
            {result.safetyFloorApplied && (
              <p className="mt-2 text-xs text-warning">{tr(UI.safetyNote)}</p>
            )}
          </BotBubble>
        )}

        {/* Friendly plan guidance tied to the user's relatable goal */}
        {status === "done" && guidance && (
          <BotBubble>
            <p className="font-medium text-foreground">{guidance.headline}</p>
            <p className="mt-2 text-foreground">{guidance.explanation}</p>
            <p className="mt-2 text-foreground">🍽️ {guidance.diet}</p>
            <p className="mt-1 text-foreground">🏋️ {guidance.workout}</p>
          </BotBubble>
        )}

        {status === "error" && <BotBubble>{submitError ?? tr(UI.genericError)}</BotBubble>}
      </div>

      {/* Input area — changes per question type */}
      <div className="border-t border-border bg-card px-4 py-3">
        {status === "asking" && currentStep.kind === "choice" && (
          <div className="flex flex-wrap gap-2">
            {currentStep.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => recordAnswer(opt.value, tr(opt.label))}
                className="rounded-pill border border-primary px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary-soft active:scale-[0.97]"
              >
                {tr(opt.label)}
              </button>
            ))}
          </div>
        )}

        {status === "asking" && currentStep.kind === "select" && (
          <div className="flex gap-2">
            <select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 rounded-field border border-input bg-card px-3 py-2 text-base text-foreground"
            >
              <option value="" disabled>
                {tr(UI.choosePlaceholder)}
              </option>
              {currentStep.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {tr(opt.label)}
                </option>
              ))}
            </select>
            <PrimaryButton onClick={onSelectSubmit} disabled={!draft}>
              {tr(UI.next)}
            </PrimaryButton>
          </div>
        )}

        {status === "asking" && currentStep.kind === "number" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onNumberSubmit();
            }}
            className="flex flex-col gap-1"
          >
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={tr(currentStep.placeholder)}
                className="flex-1 rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
                autoFocus
              />
              <PrimaryButton type="submit" disabled={!draft}>
                {tr(UI.next)}
              </PrimaryButton>
            </div>
            {inputError && <p className="text-xs text-destructive">{inputError}</p>}
          </form>
        )}

        {status === "asking" && currentStep.kind === "text" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              recordAnswer(draft.trim(), draft.trim());
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={tr(currentStep.placeholder)}
              className="flex-1 rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
              autoFocus
            />
            {currentStep.optional && !draft.trim() ? (
              <PrimaryButton type="button" onClick={() => recordAnswer("", "—")}>
                {tr(UI.skip)}
              </PrimaryButton>
            ) : (
              <PrimaryButton type="submit" disabled={!draft.trim()}>
                {tr(UI.send)}
              </PrimaryButton>
            )}
          </form>
        )}

        {status === "submitting" && (
          <p className="text-center text-sm text-muted-foreground">{tr(UI.calculating)}</p>
        )}

        {status === "done" && (
          <PrimaryButton onClick={() => router.push("/dashboard")} className="w-full">
            {tr(UI.goToDashboard)}
          </PrimaryButton>
        )}

        {status === "error" && (
          <PrimaryButton onClick={() => submit(answers, transcript)} className="w-full">
            {tr(UI.next)}
          </PrimaryButton>
        )}
      </div>
    </main>
  );
}

// --- small presentational helpers ------------------------------------------

// Bubbles rise in with the house spring (a natural chat feel).
function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-soft"
    >
      {children}
    </motion.div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
    >
      {children}
    </motion.div>
  );
}

function TargetPill({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex-1 rounded-field bg-primary-soft px-3 py-2 text-center">
      <p className="text-xs text-primary">{label}</p>
      <p className="text-lg font-bold text-primary">
        {value}
        <span className="ml-0.5 text-xs font-normal">{unit}</span>
      </p>
    </div>
  );
}

function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
