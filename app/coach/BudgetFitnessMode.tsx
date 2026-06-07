"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { BUDGET_KEY, readLocal } from "@/lib/coach/localStore";
import { getBudgetMeals } from "@/lib/coach/budgetMeals";
import { toast } from "@/lib/toast";
import { loadBudget, saveBudget } from "./coachData";
import {
  DEFAULT_BUDGET_PROFILE,
  getBudgetLabel,
  type BudgetProfile,
} from "./localCoachTypes";
import type { Lang } from "@/lib/database.types";

/**
 * Phase 4 — Budget mode.
 *
 * Self-contained card (matches the Phase 2/3 pattern): stores the user's daily
 * food budget + what they can realistically buy in localStorage
 * ("gymCoach.budget"), and shows repeatable, realistic meal ideas. Framing is
 * "realistic and repeatable", never restrictive. No DB / AI / auth touched.
 */

const BUDGETS: { key: BudgetProfile["dailyBudget"]; label: string }[] = [
  { key: "300", label: "Rs. 300" },
  { key: "500", label: "Rs. 500" },
  { key: "800", label: "Rs. 800" },
  { key: "1000_plus", label: "Rs. 1000+" },
  { key: "custom", label: "Custom" },
];

const SETUP: { key: keyof BudgetProfile["foodSetup"]; en: string; ur: string }[] = [
  { key: "hostelMess", en: "Hostel / mess food", ur: "Hostel / mess ka khana" },
  { key: "homeFood", en: "Home food", ur: "Ghar ka khana" },
  { key: "canCook", en: "I can cook", ur: "Main cook kar sakta hoon" },
  { key: "eggs", en: "Can buy eggs", ur: "Anday le sakta hoon" },
  { key: "chicken", en: "Can buy chicken", ur: "Chicken le sakta hoon" },
  { key: "milkYogurt", en: "Milk / yogurt", ur: "Doodh / dahi" },
];

const T = {
  eyebrow: { en: "Budget mode", roman_urdu: "Budget mode" },
  prompt: { en: "What's a realistic daily food budget?", roman_urdu: "Rozana khane ka realistic budget kya hai?" },
  helper: {
    en: "This keeps meal ideas realistic and repeatable for your setup — not restrictive.",
    roman_urdu: "Is se meal ideas aap ke hisaab se realistic aur repeatable rehti hain — restrictive nahi.",
  },
  customLabel: { en: "Custom (Rs/day)", roman_urdu: "Custom (Rs/din)" },
  setupLabel: { en: "What can you usually get?", roman_urdu: "Aam tor par kya mil jata hai?" },
  setBtn: { en: "Save budget", roman_urdu: "Budget save karein" },
  editBtn: { en: "Edit", roman_urdu: "Edit" },
  cancelBtn: { en: "Cancel", roman_urdu: "Cancel" },
  mealsLabel: { en: "Repeatable meals for you", roman_urdu: "Aap ke liye repeatable meals" },
  deviceNote: { en: "Saved to your account.", roman_urdu: "Aap ke account mein save hai." },
} satisfies Record<string, Record<Lang, string>>;

export default function BudgetFitnessMode({ lang = "en" }: { lang?: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<BudgetProfile>(DEFAULT_BUDGET_PROFILE);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BudgetProfile>(DEFAULT_BUDGET_PROFILE);

  useEffect(() => {
    let alive = true;
    (async () => {
      const fromDb = await loadBudget();
      if (!alive) return;
      if (fromDb && fromDb.dailyBudget) {
        setProfile(fromDb);
      } else {
        // One-time migration of any legacy localStorage budget.
        const local = readLocal(BUDGET_KEY, DEFAULT_BUDGET_PROFILE);
        if (local.dailyBudget) {
          setProfile(local);
          void saveBudget(local);
        }
      }
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  function openEditor() {
    setDraft(profile);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.dailyBudget) return;
    const next = { ...draft, updatedAt: new Date().toISOString() };
    setProfile(next); // optimistic
    setEditing(false);
    const res = await saveBudget(next);
    if (!res.ok) toast.error("Couldn't save your budget — please try again.");
  }

  const hasBudget = Boolean(profile.dailyBudget);

  if (!hydrated) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-10 w-32 rounded-field" />
      </Card>
    );
  }

  if (editing || !hasBudget) {
    const isEdit = editing;
    return (
      <Card className="space-y-4 p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
          <h2 className="font-display text-lg font-semibold text-foreground">{t("prompt")}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("helper")}</p>
        </div>

        <form onSubmit={save} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((b) => {
              const active = draft.dailyBudget === b.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, dailyBudget: b.key }))}
                  aria-pressed={active}
                  className={`rounded-pill border px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-primary/60"
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
          </div>

          {draft.dailyBudget === "custom" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">{t("customLabel")}</span>
              <input
                type="number"
                inputMode="numeric"
                value={draft.customBudget}
                onChange={(e) => setDraft((d) => ({ ...d, customBudget: e.target.value }))}
                className="rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
              />
            </label>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t("setupLabel")}</p>
            <div className="flex flex-wrap gap-2">
              {SETUP.map((s) => {
                const active = draft.foodSetup[s.key];
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setDraft((d) => ({ ...d, foodSetup: { ...d.foodSetup, [s.key]: !d.foodSetup[s.key] } }))
                    }
                    className={`rounded-pill border px-3 py-1.5 text-sm transition active:scale-[0.98] ${
                      active
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/60"
                    }`}
                  >
                    {lang === "roman_urdu" ? s.ur : s.en}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!draft.dailyBudget}
              className="rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
            >
              {t("setBtn")}
            </button>
            {isEdit && hasBudget && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-field border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted active:scale-[0.97]"
              >
                {t("cancelBtn")}
              </button>
            )}
          </div>
        </form>
      </Card>
    );
  }

  const meals = getBudgetMeals(profile);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("eyebrow")}</p>
          <p className="font-display text-lg font-semibold text-foreground">{getBudgetLabel(profile)}</p>
        </div>
        <button
          type="button"
          onClick={openEditor}
          className="shrink-0 rounded-field border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted active:scale-[0.97]"
        >
          {t("editBtn")}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("mealsLabel")}</p>
        <ul className="space-y-2">
          {meals.map((m) => (
            <li key={m.title} className="rounded-field bg-muted px-3 py-2">
              <p className="text-sm font-medium text-foreground">{m.title}</p>
              <p className="text-sm text-muted-foreground">{m.items}</p>
              <p className="mt-0.5 text-xs text-primary">{m.protein}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">{t("deviceNote")}</p>
    </Card>
  );
}
