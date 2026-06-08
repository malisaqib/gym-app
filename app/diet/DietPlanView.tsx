"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { listContainer, listItem } from "@/lib/motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import {
  generateDietPlan,
  swapDietMeal,
  swapDietItem,
  removeDietItem,
  addDietItem,
  addCustomDietItem,
  setDietItemAmount,
  correctDietItem,
  getDietPlan,
} from "./actions";
import UsualEatingCard, { type UsualEating } from "./UsualEatingCard";
import AddFoodPanel from "./AddFoodPanel";
import QuantityControl, { type QtySpec } from "@/components/QuantityControl";
import { planItemSpec, setPlanItemAmount, setPlanItemMacros, type DietPlan, type DietFilter } from "@/lib/diet/planner";
import type { MealSlot } from "@/lib/diet/foodCatalog";
import type { Lang } from "@/lib/database.types";

// Quick-tap "avoid" options (values must match foodCatalog tags).
const AVOID: { tag: string; label: Record<Lang, string> }[] = [
  { tag: "beef", label: { en: "Beef", roman_urdu: "Beef" } },
  { tag: "chicken", label: { en: "Chicken", roman_urdu: "Chicken" } },
  { tag: "fish", label: { en: "Fish", roman_urdu: "Machli" } },
  { tag: "egg", label: { en: "Egg", roman_urdu: "Anda" } },
  { tag: "dairy", label: { en: "Dairy", roman_urdu: "Dairy" } },
  { tag: "nuts", label: { en: "Nuts", roman_urdu: "Nuts" } },
];

const T = {
  title: { en: "Your day's plan", roman_urdu: "Aap ke din ka plan" },
  intro: {
    en: "Meals built to hit your daily calories & protein. Swap anything you don't fancy.",
    roman_urdu: "Aap ki rozana calories aur protein pe bana plan. Jo pasand na ho, swap karein.",
  },
  vegLabel: { en: "Vegetarian", roman_urdu: "Vegetarian" },
  avoidLabel: { en: "Avoid", roman_urdu: "Avoid karein" },
  notesLabel: { en: "Anything else? (optional)", roman_urdu: "Aur kuch? (optional)" },
  notesPlaceholder: {
    en: "e.g. no beef, hostel food only, vegetarian",
    roman_urdu: "misal: beef nahi, hostel ka khana, vegetarian",
  },
  generate: { en: "Generate my plan", roman_urdu: "Mera plan banayein" },
  regenerate: { en: "Regenerate", roman_urdu: "Naya plan" },
  working: { en: "Working…", roman_urdu: "Ban raha hai…" },
  dirtyNote: {
    en: "Preferences changed — tap Regenerate to apply them.",
    roman_urdu: "Preferences badli hain — apply karne ke liye Regenerate dabayein.",
  },
  swap: { en: "Swap", roman_urdu: "Badlein" },
  remove: { en: "Remove", roman_urdu: "Hatayein" },
  adjust: { en: "Adjust amount", roman_urdu: "Miqdar adjust karein" },
  addFood: { en: "Add food", roman_urdu: "Food add karein" },
  estBadge: { en: "≈ est", roman_urdu: "≈ andaza" },
  addedEst: { en: "Added as an estimate.", roman_urdu: "Andaze ke tor par add ho gaya." },
  overNote: {
    en: "A little over today — totally fine. Remove or swap an item to ease it back, your call.",
    roman_urdu: "Aaj thora over — bilkul theek. Koi item hata ya badal kar kam kar sakte hain, aap ki marzi.",
  },
  habitsOn: { en: "Focus on habits", roman_urdu: "Habits par focus" },
  habitsOff: { en: "Show numbers", roman_urdu: "Numbers dikhayein" },
  daily: { en: "Daily total", roman_urdu: "Din ka total" },
  cal: { en: "kcal", roman_urdu: "kcal" },
  protein: { en: "protein", roman_urdu: "protein" },
  emptyTitle: { en: "No meal plan yet", roman_urdu: "Abhi koi meal plan nahi" },
  emptyHint: {
    en: "Tap “Generate my plan” and I'll build a full day of meals that fits your calories & protein.",
    roman_urdu: "“Mera plan banayein” dabayein — main poora din ka plan banata hoon jo aap ki calories aur protein pe fit ho.",
  },
  habitsLine: {
    en: "Aim for protein + a carb + something fresh at each meal. Numbers are a guide, not a test.",
    roman_urdu: "Har meal mein protein + ek carb + kuch taza. Numbers sirf guide hain, imtihan nahi.",
  },
  proteinShortNote: {
    en: "Protein's a little hard to hit on this calorie budget — this is the closest plan. Adding a protein-rich food (eggs, yogurt, chicken) helps.",
    roman_urdu: "Itni calories mein protein poora karna thora mushkil hai — ye sab se qareeb plan hai. Koi protein wali cheez (anday, dahi, chicken) madad karegi.",
  },
  caloriesShortNote: {
    en: "Couldn't build a full day with these restrictions. Try removing an avoided food or allowing a bit more variety.",
    roman_urdu: "In restrictions ke saath poora din ka plan nahi ban saka. Koi avoid ki hui cheez hata dein ya thori aur variety allow karein.",
  },
} satisfies Record<string, Record<Lang, string>>;

const SLOT_LABEL: Record<MealSlot, Record<Lang, string>> = {
  breakfast: { en: "Breakfast", roman_urdu: "Nashta" },
  lunch: { en: "Lunch", roman_urdu: "Dopahar" },
  dinner: { en: "Dinner", roman_urdu: "Raat" },
  snack: { en: "Snack", roman_urdu: "Snack" },
};

export default function DietPlanView({
  initialPlan,
  initialFilter,
  initialUsual,
  hasTargets,
  lang,
}: {
  initialPlan: DietPlan | null;
  initialFilter: DietFilter;
  initialUsual: UsualEating;
  hasTargets: boolean;
  lang: Lang;
}) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [plan, setPlan] = useState<DietPlan | null>(initialPlan);
  const [usual, setUsual] = useState<UsualEating>(initialUsual);
  const [notes, setNotes] = useState("");
  const [vegetarian, setVegetarian] = useState(initialFilter.vegetarian);
  const [avoid, setAvoid] = useState<string[]>(initialFilter.excludeTags);
  // Specific foods to avoid (free text, e.g. "whey protein shake"). Shown as
  // removable chips so they persist across regenerate until the user clears them.
  const [avoidFoods, setAvoidFoods] = useState<string[]>(initialFilter.excludeFoods ?? []);
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState<MealSlot | null>(null);
  const [habits, setHabits] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-item editing (Phase 3): which item is mid-edit, and the open add panel.
  const [itemBusy, setItemBusy] = useState<string | null>(null); // `${slot}-${index}`
  const [addOpen, setAddOpen] = useState<MealSlot | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [qtyOpen, setQtyOpen] = useState<string | null>(null); // which item's quantity control is open
  const qtyTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Any in-flight plan mutation. We serialize edits: concurrent writes to the one
  // saved plan row would silently overwrite each other (last-write-wins), so only
  // one generate/swap/add/remove runs at a time.
  const mutating = busy || swapping !== null || itemBusy !== null || addBusy;

  const toggleAvoid = (tag: string) =>
    setAvoid((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));

  // The on-screen prefs vs the prefs the displayed plan was built with. Toggling
  // chips doesn't auto-rebuild, so we flag when a Regenerate is needed (otherwise
  // it looks like the filter was ignored).
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
  const planStale =
    !!plan &&
    (plan.filter.vegetarian !== vegetarian ||
      !sameSet(plan.filter.excludeTags, avoid) ||
      !sameSet(plan.filter.excludeFoods ?? [], avoidFoods) ||
      notes.trim().length > 0);

  async function generate() {
    if (mutating) return;
    setBusy(true);
    setError(null);
    try {
      const res = await generateDietPlan({
        notes,
        vegetarian,
        excludeTags: avoid,
        excludeFoods: avoidFoods,
        usualEating: usual,
      });
      if (res.ok) {
        setPlan(res.plan);
        // Surface any newly-parsed exclusions as chips, and clear the note box.
        setAvoidFoods(res.plan.filter.excludeFoods ?? []);
        setVegetarian(res.plan.filter.vegetarian);
        setAvoid(res.plan.filter.excludeTags);
        setNotes("");
        haptic("success");
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    } catch {
      const message = "Couldn't build a plan. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function swap(slot: MealSlot) {
    if (mutating) return;
    setSwapping(slot);
    setError(null);
    try {
      const res = await swapDietMeal(slot);
      if (res.ok) {
        setPlan(res.plan);
        haptic("tap");
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    } catch {
      const message = "Couldn't swap that meal. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSwapping(null);
    }
  }

  // --- per-item editing -----------------------------------------------------

  // Remove is optimistic (mirrors the server recompute) and rolls back on failure.
  async function removeItem(slot: MealSlot, index: number) {
    if (!plan || mutating) return;
    const prev = plan;
    setItemBusy(`${slot}-${index}`);
    setPlan(localRemove(plan, slot, index));
    haptic("tap");
    try {
      const res = await removeDietItem(slot, index);
      if (res.ok) setPlan(res.plan);
      else {
        setPlan(prev);
        toast.error(res.error);
      }
    } catch {
      setPlan(prev);
      toast.error("Couldn't remove that — please try again.");
    } finally {
      setItemBusy(null);
    }
  }

  // Swap/add need the catalog + (for typed adds) the estimator, so they run
  // server-authoritative with a small pending state rather than optimistically.
  async function swapItem(slot: MealSlot, index: number) {
    if (mutating) return;
    setItemBusy(`${slot}-${index}`);
    try {
      const res = await swapDietItem(slot, index);
      if (res.ok) {
        setPlan(res.plan);
        haptic("tap");
      } else toast.error(res.error);
    } catch {
      toast.error("Couldn't swap that item — please try again.");
    } finally {
      setItemBusy(null);
    }
  }

  async function addItem(slot: MealSlot, foodId: string) {
    if (mutating) return;
    setAddBusy(true);
    try {
      const res = await addDietItem(slot, foodId);
      if (res.ok) {
        setPlan(res.plan);
        setAddOpen(null);
        haptic("success");
      } else toast.error(res.error);
    } catch {
      toast.error("Couldn't add that — please try again.");
    } finally {
      setAddBusy(false);
    }
  }

  async function addCustom(slot: MealSlot, text: string) {
    if (mutating) return;
    setAddBusy(true);
    try {
      const res = await addCustomDietItem(slot, text);
      if (res.ok) {
        setPlan(res.plan);
        setAddOpen(null);
        haptic("success");
        if (res.approx) toast.success(t("addedEst"));
      } else toast.error(res.error);
    } catch {
      toast.error("Couldn't add that — please try again.");
    } finally {
      setAddBusy(false);
    }
  }

  // Adjust how much of a plan item — optimistic + live (recomputes the meal and
  // day totals), debounced persist. setDietItemAmount load-modifies-saves on the
  // latest DB plan, so it won't clobber a concurrent swap; reconcile on failure.
  useEffect(() => () => Object.values(qtyTimers.current).forEach(clearTimeout), []);
  function changeItemAmount(slot: MealSlot, index: number, amount: number) {
    setPlan((prev) => (prev ? setPlanItemAmount(prev, slot, index, amount) : prev));
    const k = `${slot}-${index}`;
    if (qtyTimers.current[k]) clearTimeout(qtyTimers.current[k]);
    qtyTimers.current[k] = setTimeout(async () => {
      const res = await setDietItemAmount(slot, index, amount);
      if (res.ok) setPlan(res.plan);
      else {
        toast.error(res.error);
        const fresh = await getDietPlan();
        if (fresh) setPlan(fresh); // reconcile with DB truth
      }
    }, 450);
  }

  // Manual exact calories/protein override for a plan item (optimistic + persist).
  async function correctItem(slot: MealSlot, index: number, patch: { calories: number; protein_g: number }) {
    setPlan((prev) => (prev ? setPlanItemMacros(prev, slot, index, patch) : prev));
    const res = await correctDietItem(slot, index, patch);
    if (res.ok) setPlan(res.plan);
    else {
      toast.error(res.error);
      const fresh = await getDietPlan();
      if (fresh) setPlan(fresh);
    }
  }

  if (!hasTargets) {
    return (
      <Card className="space-y-2 p-5">
        <h2 className="font-display text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">
          Finish setting your goal first — your plan is built around your daily calorie and protein
          targets.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      {/* Phase 2 — build WITH the user: capture real meals to seed the plan. */}
      <UsualEatingCard value={usual} onChange={setUsual} lang={lang} />

      <Card className="space-y-3 p-4">
        {/* Quick-tap preferences (seeded from onboarding/your profile). */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={vegetarian} onClick={() => setVegetarian((v) => !v)}>
            🥦 {t("vegLabel")}
          </Chip>
          <span className="text-xs text-muted-foreground">· {t("avoidLabel")}:</span>
          {AVOID.map((a) => (
            <Chip key={a.tag} active={avoid.includes(a.tag)} onClick={() => toggleAvoid(a.tag)}>
              {a.label[lang]}
            </Chip>
          ))}
        </div>

        {/* Specific foods you've asked to avoid (from your notes). Tap ✕ to allow again. */}
        {avoidFoods.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("avoidLabel")}:</span>
            {avoidFoods.map((f) => (
              <button
                key={f}
                type="button"
                onPointerDown={() => haptic("tap")}
                onClick={() => setAvoidFoods((cur) => cur.filter((x) => x !== f))}
                className="min-h-[32px] rounded-pill border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground active:scale-[0.97]"
              >
                {f} ✕
              </button>
            ))}
          </div>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">{t("notesLabel")}</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            className="h-11 w-full rounded-field border border-input bg-background px-3 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          {/* Before a plan exists, this is THE primary action — make it unmissable. */}
          <Button
            onClick={generate}
            loading={busy}
            disabled={mutating}
            fullWidth={!plan}
            size={plan ? "md" : "lg"}
          >
            {busy ? t("working") : plan ? t("regenerate") : t("generate")}
          </Button>
          {plan && (
            <button
              type="button"
              onPointerDown={() => haptic("tap")}
              onClick={() => setHabits((h) => !h)}
              aria-pressed={habits}
              className={`rounded-field border px-3 py-2 text-xs font-medium transition active:scale-[0.97] ${
                habits
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {habits ? t("habitsOff") : t("habitsOn")}
            </button>
          )}
        </div>
        {planStale && !busy && (
          <p className="rounded-field bg-muted px-3 py-2 text-xs text-warning">⚠️ {t("dirtyNote")}</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {/* First-time generation: show meal skeletons instead of a frozen screen. */}
      {busy && !plan && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="space-y-2 p-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-10 w-full rounded-field" />
              <Skeleton className="h-10 w-2/3 rounded-field" />
            </Card>
          ))}
        </div>
      )}

      {!plan && !busy && (
        <Card className="flex flex-col items-center gap-1 p-8 text-center">
          <span className="text-2xl">🍽️</span>
          <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
        </Card>
      )}

      {plan && (
        <>
          {/* Daily totals vs target (hidden in the habits-focused view) */}
          {!habits ? (
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("daily")}</p>
              <div className="mt-1 flex gap-5">
                <TargetBar
                  value={plan.totalCalories}
                  target={plan.calorieTarget}
                  unit={t("cal")}
                  tone={plan.totalCalories > plan.calorieTarget ? "warn" : "ok"}
                />
                <TargetBar
                  value={plan.totalProtein}
                  target={plan.proteinTargetG}
                  unit={`g ${t("protein")}`}
                  tone={plan.proteinShort ? "warn" : "ok"}
                />
              </div>
              {plan.totalCalories > plan.calorieTarget && (
                <p className="mt-2 rounded-field bg-muted px-3 py-2 text-xs text-warning">{t("overNote")}</p>
              )}
              {plan.caloriesShort && (
                <p className="mt-2 rounded-field bg-muted px-3 py-2 text-xs text-warning">
                  {t("caloriesShortNote")}
                </p>
              )}
              {plan.proteinShort && !plan.caloriesShort && plan.totalCalories <= plan.calorieTarget && (
                <p className="mt-2 rounded-field bg-muted px-3 py-2 text-xs text-warning">
                  {t("proteinShortNote")}
                </p>
              )}
            </Card>
          ) : (
            <Card className="bg-primary-soft p-4">
              <p className="text-sm leading-relaxed text-primary">{t("habitsLine")}</p>
            </Card>
          )}

          <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {plan.meals.map((meal) => (
                <motion.div key={meal.slot} variants={listItem} layout>
                  <Card className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-semibold text-foreground">
                          {SLOT_LABEL[meal.slot][lang]}
                        </h3>
                        {!habits && (
                          <p className="text-xs font-normal text-muted-foreground tabular-nums">
                            {meal.calories}/{meal.budget} {t("cal")} · {meal.protein} g
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onPointerDown={() => haptic("tap")}
                        onClick={() => swap(meal.slot)}
                        disabled={mutating}
                        className="min-h-[36px] shrink-0 rounded-pill border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 active:scale-[0.97] disabled:opacity-40"
                      >
                        {swapping === meal.slot ? "…" : `↻ ${t("swap")}`}
                      </button>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {meal.items.map((item, i) => {
                        const key = `${meal.slot}-${i}`;
                        const rowBusy = itemBusy === key;
                        const canSwap = !item.approx; // custom estimates can't be re-selected
                        const ps = planItemSpec(item);
                        const spec: QtySpec = {
                          unitMode: ps.unitMode,
                          baseCalories: ps.baseCalories,
                          baseProtein: ps.baseProtein,
                          baseCarbs: ps.baseCarbs,
                          baseFat: ps.baseFat,
                          servingGrams: ps.servingGrams,
                          unit: ps.unit,
                        };
                        const qtyExpanded = qtyOpen === key;
                        return (
                          <li
                            key={`${item.id}-${i}`}
                            className="rounded-field border border-border bg-background px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-foreground">
                                  {item.name}
                                  <span className="ml-1.5 text-xs text-muted-foreground">{item.portion}</span>
                                  {item.approx && (
                                    <span className="ml-1.5 rounded-pill bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                      {t("estBadge")}
                                    </span>
                                  )}
                                </p>
                                {!habits && (
                                  <p className="text-xs text-muted-foreground tabular-nums">
                                    {item.calories} · {item.protein}g
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                aria-label={t("adjust")}
                                aria-pressed={qtyExpanded}
                                onPointerDown={() => haptic("tap")}
                                onClick={() => setQtyOpen(qtyExpanded ? null : key)}
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border text-sm transition active:scale-[0.95] ${
                                  qtyExpanded
                                    ? "border-primary bg-primary-soft text-primary"
                                    : "border-border bg-card text-foreground hover:border-primary/50"
                                }`}
                              >
                                ⚖
                              </button>
                              {canSwap && (
                                <button
                                  type="button"
                                  aria-label={t("swap")}
                                  disabled={mutating}
                                  onPointerDown={() => haptic("tap")}
                                  onClick={() => swapItem(meal.slot, i)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border border-border bg-card text-sm text-foreground transition hover:border-primary/50 active:scale-[0.95] disabled:opacity-40"
                                >
                                  {rowBusy ? "…" : "↻"}
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={t("remove")}
                                disabled={mutating}
                                onPointerDown={() => haptic("tap")}
                                onClick={() => removeItem(meal.slot, i)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border border-border bg-card text-sm text-muted-foreground transition hover:border-destructive/50 hover:text-destructive active:scale-[0.95] disabled:opacity-40"
                              >
                                {rowBusy ? "…" : "✕"}
                              </button>
                            </div>
                            {qtyExpanded && (
                              <PlanItemEditor
                                spec={spec}
                                amount={ps.amount}
                                calories={item.calories}
                                protein={item.protein}
                                onAmountChange={(a) => changeItemAmount(meal.slot, i, a)}
                                onCorrect={(c, p) => correctItem(meal.slot, i, { calories: c, protein_g: p })}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {/* Per-meal add: searchable dataset list OR free-typed food. */}
                    {addOpen === meal.slot ? (
                      <AddFoodPanel
                        slot={meal.slot}
                        lang={lang}
                        busy={mutating}
                        onPick={(foodId) => addItem(meal.slot, foodId)}
                        onCustom={(text) => addCustom(meal.slot, text)}
                        onCancel={() => setAddOpen(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={mutating}
                        onPointerDown={() => haptic("tap")}
                        onClick={() => setAddOpen(meal.slot)}
                        className="w-fit rounded-field border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground active:scale-[0.97] disabled:opacity-40"
                      >
                        + {t("addFood")}
                      </button>
                    )}
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </div>
  );
}

// Optimistic remove that mirrors the server's recompute, so totals update with
// no flicker before the authoritative response arrives (0.85 = SHORT_THRESHOLD).
function localRemove(plan: DietPlan, slot: MealSlot, index: number): DietPlan {
  const meals = plan.meals.map((m) => {
    if (m.slot !== slot) return m;
    const items = m.items.filter((_, i) => i !== index);
    return {
      ...m,
      items,
      calories: items.reduce((s, i) => s + i.calories, 0),
      protein: items.reduce((s, i) => s + i.protein, 0),
    };
  });
  const totalCalories = meals.reduce((s, m) => s + m.calories, 0);
  const totalProtein = meals.reduce((s, m) => s + m.protein, 0);
  return {
    ...plan,
    meals,
    totalCalories,
    totalProtein,
    proteinShort: totalProtein < plan.proteinTargetG,
    caloriesShort: totalCalories < plan.calorieTarget * 0.85,
  };
}

// Expanded per-item editor on the Plan tab: quantity + exact calories/protein
// together (mirrors Home). The number fields follow the quantity and can be
// hand-edited + Saved to override.
function PlanItemEditor({
  spec,
  amount,
  calories,
  protein,
  onAmountChange,
  onCorrect,
}: {
  spec: QtySpec;
  amount: number;
  calories: number;
  protein: number;
  onAmountChange: (amount: number) => void;
  onCorrect: (calories: number, protein_g: number) => void;
}) {
  const [cal, setCal] = useState(String(calories));
  const [pro, setPro] = useState(String(protein));
  useEffect(() => {
    setCal(String(calories));
    setPro(String(protein));
  }, [amount, calories, protein]);

  const field =
    "h-10 w-24 rounded-field border border-input bg-background px-3 text-base text-foreground focus:border-ring focus:outline-none";
  return (
    <>
      <QuantityControl spec={spec} amount={amount} onChange={onAmountChange} />
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Calories
          <input type="number" inputMode="numeric" value={cal} onChange={(e) => setCal(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Protein (g)
          <input type="number" inputMode="numeric" value={pro} onChange={(e) => setPro(e.target.value)} className={field} />
        </label>
        <button
          type="button"
          onPointerDown={() => haptic("tap")}
          onClick={() => onCorrect(Number(cal), Number(pro))}
          className="rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97]"
        >
          Save
        </button>
      </div>
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={() => haptic("tap")}
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[32px] rounded-pill border px-3 py-1.5 text-xs font-medium transition active:scale-[0.97] ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:border-primary/50"
      }`}
    >
      {children}
    </button>
  );
}

// Value-vs-target with a thin progress bar. `tone` lets protein show "short"
// (amber) vs on-track (primary). Bars cap at 100% (calories never exceed target).
function TargetBar({
  value,
  target,
  unit,
  tone = "ok",
}: {
  value: number;
  target: number;
  unit: string;
  tone?: "ok" | "warn";
}) {
  const rawPct = target > 0 ? Math.round((value / target) * 100) : 0;
  const barPct = Math.min(100, rawPct); // bar caps at full; label shows the real %
  const bar = tone === "warn" ? "bg-warning" : "bg-primary";
  return (
    <div className="flex-1">
      <p className="font-display text-lg font-semibold tabular-nums text-foreground">
        {value}
        <span className="text-sm font-normal text-muted-foreground"> / {target}</span>
        <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-pill bg-muted">
        <div className={`h-full rounded-pill ${bar} transition-all`} style={{ width: `${barPct}%` }} />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{rawPct}% of target</p>
    </div>
  );
}
