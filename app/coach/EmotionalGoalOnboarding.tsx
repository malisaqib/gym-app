"use client";

import { useEffect, useState } from "react";
import {
  EMOTIONAL_GOAL_OPTIONS,
  type EmotionalGoalProfile,
  getGoalText,
} from "./localCoachTypes";

export default function EmotionalGoalOnboarding({
  value,
  onChange,
}: {
  value: EmotionalGoalProfile;
  onChange: (next: EmotionalGoalProfile) => void;
}) {
  const [customText, setCustomText] = useState(value.customText);
  const [saved, setSaved] = useState(false);
  const selectedGoal = getGoalText(value);

  useEffect(() => {
    setCustomText(value.customText);
  }, [value.customText]);

  function selectPreset(presetKey: string) {
    const shouldClearCustom = presetKey !== "custom";
    onChange({
      presetKey,
      customText: shouldClearCustom ? "" : customText,
      updatedAt: new Date().toISOString(),
    });
    setSaved(true);
  }

  function saveCustom(e: React.FormEvent) {
    e.preventDefault();
    const text = customText.trim();
    if (!text) return;
    onChange({
      presetKey: "custom",
      customText: text,
      updatedAt: new Date().toISOString(),
    });
    setSaved(true);
  }

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Personal reason</p>
        <h2 className="font-display text-lg font-semibold text-foreground">
          What are you preparing for, or what do you personally want?
        </h2>
        <p className="text-sm text-muted-foreground">
          This helps the coach make advice feel like it belongs to your real life.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {EMOTIONAL_GOAL_OPTIONS.map((option) => {
          const active = value.presetKey === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => selectPreset(option.key)}
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

      <form onSubmit={saveCustom} className="mt-4 flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">Or type your own goal</label>
        <textarea
          value={customText}
          onChange={(event) => {
            setCustomText(event.target.value);
            setSaved(false);
          }}
          rows={3}
          placeholder="Example: I want to look better in fitted shirts before university starts."
          className="resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {selectedGoal ? `Current goal: ${selectedGoal}` : "No personal goal saved yet."}
          </p>
          <button
            type="submit"
            disabled={!customText.trim()}
            className="shrink-0 rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
          >
            Save goal
          </button>
        </div>
      </form>

      {saved && <p className="mt-3 text-sm text-primary">Saved. Coach replies will use this context.</p>}
    </section>
  );
}
