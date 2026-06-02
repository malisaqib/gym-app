"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STEPS,
  UI,
  type Localized,
  type OnboardingInput,
} from "@/lib/onboarding/questions";
import type {
  Experience,
  Goal,
  Lang,
  OnboardingEntry,
  Sex,
} from "@/lib/database.types";
import type { TargetResult } from "@/lib/nutrition/engine";
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
      goal: a.goal as Goal,
      sex: a.sex as Sex,
      age: Number(a.age),
      heightCm: Number(a.heightCm),
      weightKg: Number(a.weightKg),
      trainingDays: Number(a.trainingDays),
      experience: a.experience as Experience,
      notes: typeof a.notes === "string" ? a.notes : "",
      preferredLanguage: lang,
      transcript: t,
    };

    const res = await saveOnboarding(payload);
    if (res.ok) {
      setResult(res.result);
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
    <main className="mx-auto flex h-screen max-w-md flex-col bg-slate-50">
      {/* Header with language toggle */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="font-semibold">{tr(UI.headerTitle)}</p>
          <p className="text-xs text-slate-500">
            {answeredCount}/{STEPS.length}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-full border border-slate-300 text-xs">
          <button
            onClick={() => setLang("en")}
            className={`px-3 py-1 ${lang === "en" ? "bg-emerald-600 text-white" : "text-slate-600"}`}
          >
            English
          </button>
          <button
            onClick={() => setLang("roman_urdu")}
            className={`px-3 py-1 ${lang === "roman_urdu" ? "bg-emerald-600 text-white" : "text-slate-600"}`}
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

        {/* The current, unanswered question */}
        {status === "asking" && currentStep && <BotBubble>{tr(currentStep.prompt)}</BotBubble>}

        {status === "submitting" && <BotBubble>{tr(UI.calculating)}</BotBubble>}

        {status === "done" && result && (
          <BotBubble>
            <p className="mb-2">{tr(UI.doneTitle)}</p>
            <div className="flex gap-2">
              <TargetPill label={tr(UI.caloriesLabel)} value={`${result.calorieTarget}`} unit="kcal" />
              <TargetPill label={tr(UI.proteinLabel)} value={`${result.proteinTargetG}`} unit="g" />
            </div>
            {result.safetyFloorApplied && (
              <p className="mt-2 text-xs text-amber-700">{tr(UI.safetyNote)}</p>
            )}
          </BotBubble>
        )}

        {status === "error" && <BotBubble>{submitError ?? tr(UI.genericError)}</BotBubble>}
      </div>

      {/* Input area — changes per question type */}
      <div className="border-t border-slate-200 bg-white px-4 py-3">
        {status === "asking" && currentStep.kind === "choice" && (
          <div className="flex flex-wrap gap-2">
            {currentStep.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => recordAnswer(opt.value, tr(opt.label))}
                className="rounded-full border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
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
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base"
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
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none"
                autoFocus
              />
              <PrimaryButton type="submit" disabled={!draft}>
                {tr(UI.next)}
              </PrimaryButton>
            </div>
            {inputError && <p className="text-xs text-red-600">{inputError}</p>}
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
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none"
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
          <p className="text-center text-sm text-slate-400">{tr(UI.calculating)}</p>
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

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-sm">
      {children}
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-emerald-600 px-4 py-2 text-sm text-white">
      {children}
    </div>
  );
}

function TargetPill({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex-1 rounded-lg bg-emerald-50 px-3 py-2 text-center">
      <p className="text-xs text-emerald-700">{label}</p>
      <p className="text-lg font-bold text-emerald-800">
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
      className={`rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
