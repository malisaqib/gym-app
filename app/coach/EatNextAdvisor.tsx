"use client";

import { useMemo, useState } from "react";
import { adviseEatNext } from "@/lib/coach/desiFoodEstimator";

export default function EatNextAdvisor({
  personalGoal,
  budgetLabel,
}: {
  personalGoal?: string;
  budgetLabel?: string;
}) {
  const [text, setText] = useState("roti, daal, eggs, banana, milk");
  const [submitted, setSubmitted] = useState("roti, daal, eggs, banana, milk");
  const advice = useMemo(
    () => adviseEatNext({ optionsText: submitted, personalGoal, budgetLabel }),
    [submitted, personalGoal, budgetLabel]
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = text.trim();
    if (!next) return;
    setSubmitted(next);
  }

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Eat next advisor</p>
        <h2 className="font-display text-lg font-semibold text-foreground">What should I eat from what I have?</h2>
        <p className="text-sm text-muted-foreground">
          Type home foods or outside options. The advisor will pick the most useful choice.
        </p>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder="Example: I am outside and options are biryani, shawarma, zinger, daal chawal"
          className="resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="self-start rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          Choose best option
        </button>
      </form>

      <div className="mt-4 grid gap-2">
        <AdviceRow label="Best option" value={advice.best} tone="primary" />
        <AdviceRow label="Okay option" value={advice.okay} />
        <AdviceRow label="Limit" value={advice.limit} tone="warning" />
      </div>

      <div className="mt-3 rounded-field bg-background p-3">
        <p className="text-sm font-semibold text-foreground">Portion</p>
        <p className="mt-1 text-sm text-muted-foreground">{advice.portion}</p>
        <p className="mt-3 text-sm font-semibold text-foreground">Reason</p>
        <p className="mt-1 text-sm text-muted-foreground">{advice.reason}</p>
        <p className="mt-3 text-sm font-semibold text-foreground">Next action</p>
        <p className="mt-1 text-sm text-muted-foreground">{advice.nextAction}</p>
      </div>

      {advice.matches.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Static fallback matched {advice.matches.length} food option{advice.matches.length === 1 ? "" : "s"}.
        </p>
      )}
    </section>
  );
}

function AdviceRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "warning";
}) {
  const toneClass =
    tone === "primary"
      ? "border-primary bg-primary-soft text-primary"
      : tone === "warning"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-border bg-background text-foreground";

  return (
    <div className={`rounded-field border px-3 py-2 ${toneClass}`}>
      <p className="text-xs font-medium uppercase">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
