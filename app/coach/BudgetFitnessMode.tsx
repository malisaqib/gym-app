"use client";

import { useEffect, useMemo, useState } from "react";
import { type BudgetProfile, getBudgetLabel } from "./localCoachTypes";

const BUDGET_OPTIONS = [
  { value: "300", label: "Rs. 300/day" },
  { value: "500", label: "Rs. 500/day" },
  { value: "800", label: "Rs. 800/day" },
  { value: "1000_plus", label: "Rs. 1000+/day" },
  { value: "custom", label: "Custom" },
] as const;

function mealTemplate(profile: BudgetProfile): string[] {
  const budget = profile.dailyBudget;

  if (budget === "300") {
    return [
      "Breakfast: 1 to 2 eggs with roti, or milk if eggs are not possible.",
      "Lunch: daal chawal or chana with roti.",
      "Snack: banana or chai with controlled sugar.",
      "Dinner: daal, egg, or yogurt with roti.",
    ];
  }

  if (budget === "500" || budget === "custom") {
    return [
      "Breakfast: 2 eggs with roti.",
      "Lunch: daal chawal with yogurt.",
      "Snack: banana or milk.",
      "Dinner: chicken when possible, otherwise eggs or chana with roti.",
    ];
  }

  if (budget === "800") {
    return [
      "Breakfast: omelette, roti, and milk.",
      "Lunch: chicken salan or daal chawal with raita.",
      "Snack: fruit, yogurt, or milk.",
      "Dinner: chicken, eggs, or chana with roti and salad.",
    ];
  }

  if (budget === "1000_plus") {
    return [
      "Breakfast: eggs or oats with milk.",
      "Lunch: chicken, rice or roti, raita, and salad.",
      "Snack: yogurt, fruit, milk, or protein shake if you already use one.",
      "Dinner: lean protein with controlled carbs.",
    ];
  }

  return [
    "Pick a budget first to see a realistic day.",
    "Simple rule: repeatable protein beats fancy diet plans.",
  ];
}

export default function BudgetFitnessMode({
  value,
  onChange,
}: {
  value: BudgetProfile;
  onChange: (next: BudgetProfile) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const meals = useMemo(() => mealTemplate(draft), [draft]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function save() {
    onChange({ ...draft, updatedAt: new Date().toISOString() });
    setSaved(true);
  }

  function toggleSetup(key: keyof BudgetProfile["foodSetup"]) {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      foodSetup: { ...current.foodSetup, [key]: !current.foodSetup[key] },
    }));
  }

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Budget fitness mode</p>
        <h2 className="font-display text-lg font-semibold text-foreground">What is your daily food budget?</h2>
        <p className="text-sm text-muted-foreground">
          The plan should fit your wallet, mess food, and what you can actually buy.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {BUDGET_OPTIONS.map((option) => {
          const active = draft.dailyBudget === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setSaved(false);
                setDraft((current) => ({ ...current, dailyBudget: option.value }));
              }}
              className={`rounded-field border px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
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

      {draft.dailyBudget === "custom" && (
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-foreground">
          Custom daily budget
          <input
            type="number"
            inputMode="numeric"
            value={draft.customBudget}
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({ ...current, customBudget: event.target.value }));
            }}
            placeholder="Example: 650"
            className="rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>
      )}

      <div className="mt-4 grid gap-2">
        <ToggleRow label="Hostel/mess food" active={draft.foodSetup.hostelMess} onClick={() => toggleSetup("hostelMess")} />
        <ToggleRow label="Home food" active={draft.foodSetup.homeFood} onClick={() => toggleSetup("homeFood")} />
        <ToggleRow label="Can cook" active={draft.foodSetup.canCook} onClick={() => toggleSetup("canCook")} />
        <ToggleRow label="Can buy eggs" active={draft.foodSetup.eggs} onClick={() => toggleSetup("eggs")} />
        <ToggleRow label="Can buy chicken" active={draft.foodSetup.chicken} onClick={() => toggleSetup("chicken")} />
        <ToggleRow
          label="Can buy milk/yogurt"
          active={draft.foodSetup.milkYogurt}
          onClick={() => toggleSetup("milkYogurt")}
        />
      </div>

      <div className="mt-4 rounded-field bg-background p-3">
        <p className="text-sm font-semibold text-foreground">
          {getBudgetLabel(draft) || "Choose a budget"} sample day
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
          {meals.map((meal) => (
            <li key={meal}>{meal}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-foreground">
          Not perfect, but repeatable. Protein comes from eggs, daal, chana, yogurt, milk, and chicken when possible.
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {getBudgetLabel(value) ? `Saved: ${getBudgetLabel(value)}` : "Budget is saved only on this device for now."}
        </p>
        <button
          type="button"
          onClick={save}
          className="rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97]"
        >
          Save budget
        </button>
      </div>

      {saved && <p className="mt-3 text-sm text-primary">Saved. The coach will keep advice realistic.</p>}
    </section>
  );
}

function ToggleRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-field border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition hover:border-primary/60"
    >
      <span>{label}</span>
      <span
        className={`h-5 w-9 rounded-pill p-0.5 transition ${active ? "bg-primary" : "bg-muted"}`}
        aria-hidden="true"
      >
        <span
          className={`block h-4 w-4 rounded-full bg-card transition ${active ? "translate-x-4" : "translate-x-0"}`}
        />
      </span>
    </button>
  );
}
