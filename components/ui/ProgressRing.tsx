import { cn } from "@/lib/cn";

interface ProgressRingProps {
  value: number; // eaten so far
  max: number; // daily target
  label: string; // "Calories" / "Protein"
  unit: string; // "kcal" / "g"
  tone?: "primary" | "accent";
  size?: number;
}

/**
 * Circular progress for a daily metric. The arc fills toward the target; going
 * over turns it amber (warning) so it reads at a glance, with text backing up
 * the colour (accessibility — never colour alone).
 */
export function ProgressRing({
  value,
  max,
  label,
  unit,
  tone = "primary",
  size = 128,
}: ProgressRingProps) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const safeMax = max > 0 ? max : 1;
  const fraction = Math.min(value / safeMax, 1);
  const over = max > 0 && value > max;
  const dashOffset = circumference * (1 - fraction);
  const left = Math.round(max - value);

  const arcColor = over ? "text-warning" : tone === "accent" ? "text-accent" : "text-primary";

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>

      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            stroke="currentColor"
            className="text-border"
          />
          {/* value arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={cn("transition-[stroke-dashoffset] duration-500", arcColor)}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold tabular-nums text-foreground">
            {Math.round(value)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            / {max} {unit}
          </span>
        </div>
      </div>

      <p className={cn("text-xs font-medium", over ? "text-warning" : "text-muted-foreground")}>
        {over ? `${Math.abs(left)} ${unit} over` : `${left} ${unit} left`}
      </p>
    </div>
  );
}
