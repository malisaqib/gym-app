"use client";

import { useState } from "react";
import { ChevronDown, Lightbulb, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { haptic } from "@/lib/haptics";
import { suggestUpgrades } from "@/lib/diet/upgrades";
import type { Lang } from "@/lib/database.types";

/** The "what you usually eat" capture (Phase 2). Plain free text we seed from. */
export interface UsualEating {
  breakfast: string;
  lunch: string;
  dinner: string;
  foods: string; // go-to foods
  keep: string; // anything you'd rather not give up
}

const T = {
  title: { en: "What do you usually eat?", roman_urdu: "Aap aam tor par kya khate hain?" },
  intro: {
    en: "A few quick taps and I'll build the plan around your real meals — not replace them.",
    roman_urdu: "Thore se taps, aur main plan aap ke asli khane ke ird-gird banaunga — badlay ga nahi.",
  },
  collapsedEmpty: {
    en: "Want your plan built around your real meals? Tap to add them, then Generate.",
    roman_urdu: "Plan apne asli khane ke ird-gird chahiye? Tap karke add karein, phir Generate.",
  },
  collapsedSet: {
    en: "Built around your usual meals. Tap to edit.",
    roman_urdu: "Aap ke usual khane par bana hai. Tap karke edit karein.",
  },
  breakfast: { en: "Usual breakfast", roman_urdu: "Aam nashta" },
  lunch: { en: "Usual lunch", roman_urdu: "Aam dopahar" },
  dinner: { en: "Usual dinner", roman_urdu: "Aam raat ka khana" },
  foods: { en: "Any go-to foods?", roman_urdu: "Koi pasandeeda foods?" },
  keep: { en: "Anything you'd rather not give up?", roman_urdu: "Koi cheez jo chhorna nahi chahte?" },
  ph: { en: "type or tap below…", roman_urdu: "likhein ya neeche tap karein…" },
  ideasLabel: { en: "Gentle ideas (totally optional)", roman_urdu: "Halki tajaweez (bilkul optional)" },
  ideasNote: {
    en: "Keep what you love — these are just small, take-it-or-leave-it tweaks.",
    roman_urdu: "Jo pasand hai rakhein — ye sirf chhoti, marzi ki tabdeeliyan hain.",
  },
} satisfies Record<string, Record<Lang, string>>;

// Common desi + western quick-add chips per field. Tapping appends the word.
const CHIPS: Record<keyof UsualEating, string[]> = {
  breakfast: ["Paratha", "Egg", "Oats", "Chai", "Dahi", "Bread", "Channay"],
  lunch: ["Roti", "Rice", "Daal", "Chicken salan", "Sabzi", "Qeema"],
  dinner: ["Roti", "Chicken", "Daal", "Sabzi", "Karahi", "Rice"],
  foods: ["Eggs", "Chicken", "Yogurt", "Banana", "Milk", "Daal"],
  keep: ["Chai", "Paratha", "Biryani", "Naan", "Sweets", "Soft drinks"],
};

export default function UsualEatingCard({
  value,
  onChange,
  lang,
}: {
  value: UsualEating;
  onChange: (next: UsualEating) => void;
  lang: Lang;
}) {
  const t = (k: keyof typeof T) => T[k][lang];
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const set = (key: keyof UsualEating, v: string) => onChange({ ...value, [key]: v });

  // Append a chip word to a field unless it's already mentioned there.
  const addChip = (key: keyof UsualEating, word: string) => {
    haptic("tap");
    const cur = value[key].trim();
    if (cur.toLowerCase().includes(word.toLowerCase())) return;
    set(key, cur ? `${cur}, ${word}` : word);
  };

  // Suggestions read the user's own words across every field (deterministic).
  const allText = [value.breakfast, value.lunch, value.dinner, value.foods, value.keep].join(" ");
  const ideas = suggestUpgrades(allText, lang, 3).filter((i) => !dismissed.includes(i.id));
  const hasContent = Boolean(value.breakfast || value.lunch || value.dinner || value.foods || value.keep);

  return (
    <Card className="p-4">
      {/* Collapsible: a short invite that opens the capture on tap, closes again. */}
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {open ? t("intro") : hasContent ? t("collapsedSet") : t("collapsedEmpty")}
          </p>
        </div>
        <ChevronDown
          size={18}
          aria-hidden
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
      <Field label={t("breakfast")} value={value.breakfast} onChange={(v) => set("breakfast", v)} placeholder={t("ph")} chips={CHIPS.breakfast} onChip={(w) => addChip("breakfast", w)} />
      <Field label={t("lunch")} value={value.lunch} onChange={(v) => set("lunch", v)} placeholder={t("ph")} chips={CHIPS.lunch} onChip={(w) => addChip("lunch", w)} />
      <Field label={t("dinner")} value={value.dinner} onChange={(v) => set("dinner", v)} placeholder={t("ph")} chips={CHIPS.dinner} onChip={(w) => addChip("dinner", w)} />
      <Field label={t("foods")} value={value.foods} onChange={(v) => set("foods", v)} placeholder={t("ph")} chips={CHIPS.foods} onChip={(w) => addChip("foods", w)} />
      <Field label={t("keep")} value={value.keep} onChange={(v) => set("keep", v)} placeholder={t("ph")} chips={CHIPS.keep} onChip={(w) => addChip("keep", w)} />

      {ideas.length > 0 && (
        <div className="space-y-2 rounded-field bg-primary-soft p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("ideasLabel")}</p>
          <p className="text-xs text-primary/80">{t("ideasNote")}</p>
          <ul className="space-y-1.5">
            {ideas.map((idea) => (
              <li key={idea.id} className="flex items-start justify-between gap-2 rounded-field bg-card px-3 py-2">
                <span className="flex items-start gap-1.5 text-sm text-foreground">
                  <Lightbulb size={14} aria-hidden className="mt-0.5 shrink-0 text-primary" /> {idea.text}
                </span>
                <button
                  type="button"
                  onPointerDown={() => haptic("tap")}
                  onClick={() => setDismissed((d) => [...d, idea.id])}
                  aria-label="Dismiss"
                  className="shrink-0 rounded-pill px-2 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
        </div>
      )}
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  chips,
  onChip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  chips: string[];
  onChip: (word: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">
        {label}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 h-11 w-full rounded-field border border-input bg-background px-3 text-base text-foreground focus:border-ring focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onChip(w)}
            className="rounded-pill border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary/50 active:scale-[0.97]"
          >
            + {w}
          </button>
        ))}
      </div>
    </div>
  );
}
