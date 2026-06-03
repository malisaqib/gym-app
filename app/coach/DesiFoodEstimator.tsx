"use client";

import { useMemo, useState } from "react";
import { estimateDesiMeal } from "@/lib/coach/desiFoodEstimator";

export default function DesiFoodEstimator({ personalGoal }: { personalGoal?: string }) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("biryani plate");

  const estimate = useMemo(() => estimateDesiMeal(submitted, personalGoal), [submitted, personalGoal]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = text.trim();
    if (!next) return;
    setSubmitted(next);
  }

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Desi food estimator</p>
        <h2 className="font-display text-lg font-semibold text-foreground">Estimate calories without overthinking it</h2>
        <p className="text-sm text-muted-foreground">
          Use ranges. A home plate and restaurant plate can be very different.
        </p>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder="Example: 2 roti, chicken salan, chai"
          className="resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="self-start rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          Estimate meal
        </button>
      </form>

      <div className="mt-4 rounded-field bg-background p-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">Result for</p>
        <p className="text-sm font-semibold text-foreground">{estimate.input}</p>

        {estimate.matches.length > 0 ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric label="Calories" value={`${estimate.caloriesMin}-${estimate.caloriesMax}`} unit="kcal" />
              <Metric label="Protein" value={`${estimate.proteinMin}-${estimate.proteinMax}`} unit="g" />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {estimate.matches.map((match) => (
                <div
                  key={`${match.food.name}-${match.matchedAlias}`}
                  className="rounded-field border border-border bg-card px-3 py-2"
                >
                  <p className="text-sm font-medium text-foreground">
                    {match.quantity > 1 ? `${match.quantity} x ` : ""}
                    {match.food.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {match.food.serving} usually gives {match.food.caloriesMin}-{match.food.caloriesMax} kcal.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{match.food.notes}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{estimate.summary}</p>
        )}

        <div className="mt-3 rounded-field bg-primary-soft px-3 py-2">
          <p className="text-sm font-medium text-primary">{estimate.goalFit}</p>
          <p className="mt-1 text-sm text-primary">{estimate.suggestion}</p>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-field border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">
        {value}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}
