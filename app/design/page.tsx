"use client";

/**
 * Phase 0 design preview (temporary, dev-only). Renders the Apple-Fitness-style
 * tokens + the ActivityRing in isolation, scoped to the `.fitness` deep-black
 * theme so it doesn't affect any real screen. Visit /design to eyeball it.
 * No app data, logic, auth or RAG involved.
 */

import { notFound } from "next/navigation";
import { ActivityRing } from "@/components/ui/ActivityRing";
import { Counter } from "@/components/ui/Counter";

const SWATCHES: { name: string; var: string }[] = [
  { name: "background", var: "--background" },
  { name: "card", var: "--card" },
  { name: "muted", var: "--muted" },
  { name: "border", var: "--border" },
  { name: "primary / ring-1", var: "--ring-1" },
  { name: "accent / ring-2", var: "--ring-2" },
  { name: "ring-3", var: "--ring-3" },
  { name: "destructive", var: "--destructive" },
];

export default function DesignPreview() {
  // Dev-only preview — not part of the public app.
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="fitness min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto flex max-w-md flex-col gap-10">
        <header>
          <p className="stat-label">Zorfit</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Design preview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Deep-black tokens, Inter, and the ActivityRing — in isolation.</p>
        </header>

        {/* Token swatches */}
        <section className="grid grid-cols-4 gap-3">
          {SWATCHES.map((s) => (
            <div key={s.name} className="flex flex-col items-center gap-1.5">
              <div
                className="h-12 w-12 rounded-card-lg border border-white/10"
                style={{ backgroundColor: `rgb(var(${s.var}))` }}
              />
              <span className="text-center text-[10px] leading-tight text-muted-foreground">{s.name}</span>
            </div>
          ))}
        </section>

        {/* Typography rhythm: huge metric + tiny muted label */}
        <section className="rounded-card-xl bg-card p-6 shadow-elevated">
          <p className="stat-label">Calories remaining</p>
          <div className="mt-1 flex items-baseline gap-2">
            <Counter value={1650} className="stat-value text-6xl text-foreground" />
            <span className="text-base font-semibold text-muted-foreground">kcal</span>
          </div>
        </section>

        {/* Hero single ring with centre metric */}
        <section className="flex flex-col items-center gap-3">
          <ActivityRing value={1650} max={2200} color="rgb(var(--ring-1))" size={240} stroke={26}>
            <div className="flex flex-col items-center">
              <Counter value={1650} className="stat-value text-5xl text-foreground" />
              <span className="stat-label mt-1">of 2,200 kcal</span>
            </div>
          </ActivityRing>
          <p className="text-sm text-muted-foreground">Single ring · emerald · spring fill + glow</p>
        </section>

        {/* Signature concentric rings (our palette) */}
        <section className="flex flex-col items-center gap-3">
          <div className="relative h-[240px] w-[240px]">
            <div className="absolute inset-0 grid place-items-center">
              <ActivityRing value={1650} max={2200} color="rgb(var(--ring-1))" size={240} stroke={22} delay={0} />
            </div>
            <div className="absolute inset-0 grid place-items-center">
              <ActivityRing value={88} max={140} color="rgb(var(--ring-2))" size={184} stroke={22} delay={0.08} />
            </div>
            <div className="absolute inset-0 grid place-items-center">
              <ActivityRing value={5} max={6} color="rgb(var(--ring-3))" size={128} stroke={22} delay={0.16} />
            </div>
          </div>
          <div className="flex gap-5 text-xs">
            <span className="text-[rgb(var(--ring-1))]">● Calories</span>
            <span className="text-[rgb(var(--ring-2))]">● Protein</span>
            <span className="text-[rgb(var(--ring-3))]">● Workouts</span>
          </div>
        </section>

        {/* States: under / complete / over (capped) */}
        <section className="flex items-center justify-around">
          <RingState label="38%" value={38} max={100} color="rgb(var(--ring-2))" />
          <RingState label="100%" value={100} max={100} color="rgb(var(--ring-1))" />
          <RingState label="over" value={130} max={100} color="rgb(var(--destructive))" />
        </section>

        {/* Pill button + card sample */}
        <section className="flex flex-col gap-4">
          <button className="pressable rounded-pill bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-glow-primary">
            Log a meal
          </button>
          <button className="pressable rounded-pill border border-border bg-card px-6 py-3.5 text-base font-semibold text-foreground">
            Secondary
          </button>
          <div className="rounded-card-xl bg-card p-5 shadow-elevated">
            <p className="stat-label">Meal</p>
            <p className="mt-1 font-display text-lg font-bold">Chicken karahi + 2 roti</p>
            <p className="mt-1 text-sm text-muted-foreground">620 kcal · 48g protein</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function RingState({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <ActivityRing value={value} max={max} color={color} size={84} stroke={11} />
      <span className="stat-label">{label}</span>
    </div>
  );
}
