"use client";

import type { FoodLog } from "@/lib/database.types";

/**
 * One reusable quantity control for food logging (Phase 2). Countable foods get
 * a +/- stepper; portion foods get 0.5x/1x/1.5x/2x multiplier chips AND a direct
 * grams field (kept in sync). Fully controlled by `amount`; macros are previewed
 * live as base × amount. Large tap targets for one-handed use.
 */

const MULTIPLIERS = [0.5, 1, 1.5, 2];
const MAX_UNITS = 100;
const MAX_GRAMS = 5000;

export default function QuantityControl({
  item,
  amount,
  onChange,
}: {
  item: FoodLog;
  amount: number;
  onChange: (amount: number) => void;
}) {
  const mode = item.unit_mode ?? "count";
  // base = per unit (count) or per gram (portion); fall back to stored totals.
  const base = {
    cal: item.base_calories ?? item.calories,
    pro: item.base_protein_g ?? item.protein_g,
    carb: item.base_carbs_g ?? item.carbs_g,
    fat: item.base_fat_g ?? item.fat_g,
  };
  const r = (n: number) => Math.round(n);
  const cal = r(base.cal * amount);
  const pro = r(base.pro * amount);
  const carb = r(base.carb * amount);
  const fat = r(base.fat * amount);

  if (mode === "portion") {
    const serving = item.serving_grams && item.serving_grams > 0 ? item.serving_grams : 100;
    return (
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {MULTIPLIERS.map((m) => {
            const grams = Math.round(m * serving);
            const active = Math.abs(amount - grams) < 1;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(grams)}
                className={`min-h-[40px] rounded-pill border px-4 text-sm font-medium transition active:scale-[0.97] ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-primary/50"
                }`}
              >
                {m}×
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          Grams
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n) && n > 0) onChange(Math.min(n, MAX_GRAMS));
            }}
            className="h-11 w-24 rounded-field border border-input bg-background px-3 text-base text-foreground focus:border-ring focus:outline-none"
          />
          <span className="text-muted-foreground">g</span>
        </label>

        <Readout main={`${amount}g → ${cal} kcal · ${pro}g protein`} sub={`carbs ${carb}g · fat ${fat}g`} />
      </div>
    );
  }

  // countable
  const unitLabel = item.unit && item.unit !== "item" ? item.unit : "";
  const step = (d: number) => onChange(Math.max(1, Math.min(MAX_UNITS, Math.round(amount) + d)));
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-3">
        <StepBtn label="Less" onClick={() => step(-1)} disabled={amount <= 1}>
          −
        </StepBtn>
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            if (Number.isFinite(n) && n > 0) onChange(Math.min(n, MAX_UNITS));
          }}
          className="h-11 w-16 rounded-field border border-input bg-background text-center text-base text-foreground focus:border-ring focus:outline-none"
        />
        <StepBtn label="More" onClick={() => step(1)} disabled={amount >= MAX_UNITS}>
          +
        </StepBtn>
        {unitLabel && <span className="text-sm text-muted-foreground">{unitLabel}</span>}
      </div>

      <Readout main={`${amount} × ${r(base.cal)} kcal = ${cal} kcal · ${pro}g protein`} sub={`carbs ${carb}g · fat ${fat}g`} />
    </div>
  );
}

function StepBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-11 items-center justify-center rounded-field border border-border bg-background text-lg font-semibold text-foreground transition hover:border-primary/50 active:scale-[0.95] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Readout({ main, sub }: { main: string; sub: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground tabular-nums">{main}</p>
      <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>
    </div>
  );
}
