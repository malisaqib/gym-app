"use client";

import type { WeightPoint } from "@/lib/weight/series";

/**
 * A small, dependency-free SVG line chart for bodyweight over time.
 * Responsive via viewBox; scales the y-axis to the data range with padding.
 */
export default function WeightChart({ series }: { series: WeightPoint[] }) {
  if (series.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Log your weight to start your progress chart.
      </p>
    );
  }

  const W = 320;
  const H = 140;
  const pad = 22;

  const weights = series.map((p) => p.weight);
  let min = Math.min(...weights);
  let max = Math.max(...weights);
  if (min === max) {
    // Flat line — pad so it sits in the middle instead of on an edge.
    min -= 1;
    max += 1;
  }
  const range = max - min;

  const x = (i: number) =>
    series.length === 1 ? W / 2 : pad + (i / (series.length - 1)) * (W - 2 * pad);
  const y = (w: number) => pad + (1 - (w - min) / range) * (H - 2 * pad);

  const points = series.map((p, i) => `${x(i)},${y(p.weight)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weight over time">
      <defs>
        <linearGradient id="wt-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "rgb(var(--primary))", stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: "rgb(var(--primary))", stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      {/* soft area fill under the trend */}
      {series.length > 1 && (
        <polygon points={`${points} ${x(series.length - 1)},${H - pad} ${x(0)},${H - pad}`} fill="url(#wt-fill)" />
      )}

      {/* y-axis range labels */}
      <text x={2} y={y(max) + 4} className="fill-muted-foreground" fontSize="9">
        {max}
      </text>
      <text x={2} y={y(min) + 4} className="fill-muted-foreground" fontSize="9">
        {min}
      </text>

      {/* the line (only when there are at least 2 points) */}
      {series.length > 1 && (
        <polyline
          points={points}
          fill="none"
          className="stroke-primary"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* points */}
      {series.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.weight)} r="2.5" className="fill-primary" />
      ))}

      {/* first & last date labels */}
      <text x={x(0)} y={H - 4} className="fill-muted-foreground" fontSize="9" textAnchor="middle">
        {series[0].date.slice(5)}
      </text>
      {series.length > 1 && (
        <text
          x={x(series.length - 1)}
          y={H - 4}
          className="fill-muted-foreground"
          fontSize="9"
          textAnchor="middle"
        >
          {series[series.length - 1].date.slice(5)}
        </text>
      )}
    </svg>
  );
}
