"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { searchDietFoods, type FoodOption } from "./actions";
import type { MealSlot } from "@/lib/diet/foodCatalog";
import type { Lang } from "@/lib/database.types";

/**
 * Per-meal "add a food" control (Phase 3). Search the dataset (deterministic,
 * filter-aware) OR type a food in free text. Typed input is matched to the
 * curated Diet Plan catalog server-side and rejected when no safe match exists.
 * Busy state is owned by the parent (it runs the add + closes the panel).
 */

const T = {
  placeholder: { en: "Search or type a food…", roman_urdu: "Food dhoondein ya likhein…" },
  searching: { en: "Searching…", roman_urdu: "Dhoond rahe hain…" },
  addTyped: { en: "Add", roman_urdu: "Add karein" },
  asTyped: { en: "from Diet Plan foods", roman_urdu: "Diet Plan foods se" },
  noResults: { en: "No Diet Plan match. Try another name or report it as missing.", roman_urdu: "Diet Plan mein match nahi mila. Doosra naam try karein ya missing report karein." },
  reportMissing: { en: "Report it as missing", roman_urdu: "Missing report karein" },
  cancel: { en: "Cancel", roman_urdu: "Cancel" },
} satisfies Record<string, Record<Lang, string>>;

export default function AddFoodPanel({
  slot,
  lang,
  busy,
  onPick,
  onCustom,
  onCancel,
  onReportMissing,
}: {
  slot: MealSlot;
  lang: Lang;
  busy: boolean;
  onPick: (foodId: string) => void;
  onCustom: (text: string) => void;
  onCancel: () => void;
  // Report the current query as a missing food (independent of adding it).
  onReportMissing?: (text: string) => void;
}) {
  const t = (k: keyof typeof T) => T[k][lang];
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodOption[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced dataset search (250ms) so we don't hit the server on every keystroke.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const res = await searchDietFoods(slot, query);
      setResults(res.ok ? res.foods : []);
      setSearching(false);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, slot]);

  const canAddTyped = q.trim().length >= 2;

  return (
    <div className="space-y-2 rounded-field border border-dashed border-border bg-background p-2">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("placeholder")}
        disabled={busy}
        className="h-10 w-full rounded-field border border-input bg-card px-3 text-base text-foreground focus:border-ring focus:outline-none disabled:opacity-60"
      />

      {searching && <p className="px-1 text-xs text-muted-foreground">{t("searching")}</p>}

      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={busy}
                onPointerDown={() => haptic("tap")}
                onClick={() => onPick(f.id)}
                className="flex w-full items-center justify-between gap-2 rounded-field border border-border bg-card px-3 py-2 text-left transition hover:border-primary/50 active:scale-[0.99] disabled:opacity-50"
              >
                <span className="min-w-0 truncate text-sm text-foreground">
                  {f.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{f.portion}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {f.calories} · {f.protein}g
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!searching && q.trim().length >= 2 && results.length === 0 && (
        <div className="space-y-1 px-1">
          <p className="text-xs text-muted-foreground">{t("noResults")}</p>
          {onReportMissing && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onReportMissing(q.trim())}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline active:scale-[0.99] disabled:opacity-40"
            >
              {t("reportMissing")}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !canAddTyped}
          onPointerDown={() => haptic("tap")}
          onClick={() => onCustom(q.trim())}
          className="rounded-field bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          {busy ? "…" : `${t("addTyped")} “${q.trim() || "…"}” ${t("asTyped")}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-field border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted active:scale-[0.97] disabled:opacity-40"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
