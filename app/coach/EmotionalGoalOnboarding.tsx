"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EMOTIONAL_GOAL_KEY, readLocal, writeLocal } from "@/lib/coach/localStore";
import { buildCoachFocus } from "@/lib/coach/goalContext";
import { suggestsSupport } from "@/lib/coach/supportSignals";
import { SupportNudge } from "@/components/SupportNudge";
import {
  DEFAULT_EMOTIONAL_GOAL,
  EMOTIONAL_GOAL_OPTIONS,
  type EmotionalGoalProfile,
  getGoalText,
  hasEmotionalGoal,
} from "./localCoachTypes";
import type { Lang } from "@/lib/database.types";

/**
 * Phase 2 — motivation/emotional goal.
 *
 * Self-contained card for the coach dashboard. Reads/writes the goal in
 * localStorage ("gymCoach.emotionalGoal") — no DB, no AI, no auth touched.
 * Three states: empty (prompt to set), saved (goal card + edit), and editing
 * (preset chips + custom text). The "Coach focus" line is always neutral and
 * behavior-based (see lib/coach/goalContext.ts), never appearance framing.
 */

const T = {
  eyebrow: { en: "Your goal", roman_urdu: "Aap ka goal" },
  prompt: {
    en: "What are you really preparing for?",
    roman_urdu: "Aap asal mein kis cheez ki tayari kar rahe hain?",
  },
  helper: {
    en: "Maybe it's a wedding, a university glow-up, looking better in shirts, or just feeling confident again. Your coach uses this to make your plan feel personal.",
    roman_urdu:
      "Shayad koi shaadi, university glow-up, shirts mein behtar lagna, ya bas dobara confident feel karna. Coach is se aap ka plan personal banata hai.",
  },
  setBtn: { en: "Set my goal", roman_urdu: "Goal set karein" },
  editBtn: { en: "Edit goal", roman_urdu: "Goal edit karein" },
  saveBtn: { en: "Save goal", roman_urdu: "Goal save karein" },
  cancelBtn: { en: "Cancel", roman_urdu: "Cancel" },
  presetLabel: { en: "Pick what fits", roman_urdu: "Jo theek lage chunein" },
  customLabel: { en: "Or say it in your own words", roman_urdu: "Ya apne lafzon mein likhein" },
  customPlaceholder: {
    en: "e.g. I want confidence before university starts",
    roman_urdu: "misal: university shuru hone se pehle confidence chahiye",
  },
  focusLabel: { en: "Coach focus", roman_urdu: "Coach ka focus" },
  savedMsg: { en: "Saved. Your coach will keep this in mind.", roman_urdu: "Save hogaya. Coach ise yaad rakhega." },
  deviceNote: {
    en: "Saved on this device for now.",
    roman_urdu: "Abhi sirf is device par save hai.",
  },
} satisfies Record<string, Record<Lang, string>>;

export default function EmotionalGoalOnboarding({ lang = "en" }: { lang?: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  // hydrated guards against a server/client mismatch: first render matches the
  // server (default/empty), then we load the real saved goal on mount.
  const [hydrated, setHydrated] = useState(false);
  const [goal, setGoal] = useState<EmotionalGoalProfile>(DEFAULT_EMOTIONAL_GOAL);
  const [editing, setEditing] = useState(false);
  const [draftPreset, setDraftPreset] = useState("");
  const [draftCustom, setDraftCustom] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setGoal(readLocal(EMOTIONAL_GOAL_KEY, DEFAULT_EMOTIONAL_GOAL));
    setHydrated(true);
  }, []);

  function openEditor() {
    setDraftPreset(goal.selectedPreset);
    setDraftCustom(goal.customGoal);
    setJustSaved(false);
    setEditing(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const custom = draftCustom.trim();
    if (!draftPreset && !custom) return;

    const now = new Date().toISOString();
    const next: EmotionalGoalProfile = {
      selectedPreset: draftPreset,
      customGoal: custom,
      createdAt: goal.createdAt || now,
      updatedAt: now,
    };
    writeLocal(EMOTIONAL_GOAL_KEY, next);
    setGoal(next);
    setEditing(false);
    setJustSaved(true);
  }

  const canSave = Boolean(draftPreset || draftCustom.trim());

  // Loading state — avoids an empty-state flash before localStorage is read.
  if (!hydrated) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-10 w-32 rounded-field" />
      </Card>
    );
  }

  // Editing state — preset chips + custom text + save/cancel.
  if (editing) {
    return (
      <Card className="space-y-4 p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
          <h2 className="font-display text-lg font-semibold text-foreground">{t("prompt")}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("helper")}</p>
        </div>

        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t("presetLabel")}</p>
            <div className="flex flex-wrap gap-2">
              {EMOTIONAL_GOAL_OPTIONS.map((option) => {
                const active = draftPreset === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setDraftPreset(active ? "" : option.key)}
                    aria-pressed={active}
                    className={`rounded-pill border px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/60"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t("customLabel")}</span>
            <textarea
              value={draftCustom}
              onChange={(event) => setDraftCustom(event.target.value)}
              rows={3}
              placeholder={t("customPlaceholder")}
              className="resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
            >
              {t("saveBtn")}
            </button>
            {hasEmotionalGoal(goal) && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-field border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted active:scale-[0.97]"
              >
                {t("cancelBtn")}
              </button>
            )}
          </div>
        </form>
      </Card>
    );
  }

  // Empty state — no goal set yet.
  if (!hasEmotionalGoal(goal)) {
    return (
      <Card className="space-y-4 p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
          <h2 className="font-display text-lg font-semibold text-foreground">{t("prompt")}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("helper")}</p>
        </div>
        <button
          type="button"
          onClick={openEditor}
          className="rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97]"
        >
          {t("setBtn")}
        </button>
      </Card>
    );
  }

  // Saved state — show the goal + neutral coach focus + edit.
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
          <p className="font-display text-lg font-semibold leading-snug text-foreground">{getGoalText(goal)}</p>
        </div>
        <button
          type="button"
          onClick={openEditor}
          className="shrink-0 rounded-field border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted active:scale-[0.97]"
        >
          {t("editBtn")}
        </button>
      </div>

      <div className="rounded-field bg-primary-soft px-3 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("focusLabel")}</p>
        <p className="mt-1 text-sm leading-relaxed text-primary">{buildCoachFocus(goal)}</p>
      </div>

      {suggestsSupport(getGoalText(goal)) && <SupportNudge lang={lang} />}

      <p className="text-xs text-muted-foreground">{justSaved ? t("savedMsg") : t("deviceNote")}</p>
    </Card>
  );
}
