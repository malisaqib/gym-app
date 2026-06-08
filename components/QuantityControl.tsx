"use client";

/**
 * One reusable quantity control (food logging + diet plan). Countable items get
 * a +/- stepper; portion items get 0.5x/1x/1.5x/2x multiplier chips AND a direct
 * grams field (kept in sync). Fully controlled by `amount`; macros preview live
 * as base × amount. Decoupled from any row type via a plain `QtySpec`.
 */

export interface QtySpec {
  unitMode: "count" | "portion";
  baseCalories: number; // per unit (count) or per gram (portion)
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  servingGrams: number | null; // one base serving (portion only) — anchors the multiplier
  unit: string; // friendly label for count foods ("egg", "roti"); "" if none
}

const MULTIPLIERS = [0.5, 1, 1.5, 2];
const MAX_UNITS = 100;
const MAX_GRAMS = 5000;

export default function QuantityControl({
  spec,
  amount,
  onChange,
}: {
  spec: QtySpec;
  amount: number;
  onChange: (amount: number) => void;
}) {
  const r = (n: number) => Math.round(n);
  const cal = r(spec.baseCalories * amount);
  const pro = r(spec.baseProtein * amount);
  const carb = r(spec.baseCarbs * amount);
  const fat = r(spec.baseFat * amount);

  if (spec.unitMode === "portion") {
    const serving = spec.servingGrams && spec.servingGrams > 0 ? spec.servingGrams : 100;
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
        {spec.unit && <span className="text-sm text-muted-foreground">{spec.unit}</span>}
      </div>

      <Readout main={`${amount} × ${r(spec.baseCalories)} kcal = ${cal} kcal · ${pro}g protein`} sub={`carbs ${carb}g · fat ${fat}g`} />
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
