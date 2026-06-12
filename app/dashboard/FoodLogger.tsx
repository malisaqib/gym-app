"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookmarkPlus, CopyPlus, Flag, History, UtensilsCrossed, X } from "lucide-react";
import type { FoodLog, Lang, ReportContext, ReportType } from "@/lib/database.types";
import { listContainer, listItem, fadeUp } from "@/lib/motion";
import { sumMacros } from "@/lib/food/totals";
import { itemMacros } from "@/lib/food/quantity";
import { localDateString } from "@/lib/localDate";
import { redirectIfSignedOut } from "@/lib/clientAuth";
import {
  logFood,
  getFoodLogs,
  setFoodItemAmount,
  correctFoodItem,
  deleteFoodItem,
  copyFoodLogs,
  getRecentLogFoods,
  searchLogFoods,
  logSearchedFood,
  saveMeal,
  listSavedMeals,
  logSavedMeal,
  deleteSavedMeal,
  type LogFoodSearchOption,
  type SavedMealSummary,
} from "./actions";
import QuantityControl, { type QtySpec } from "@/components/QuantityControl";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityRing } from "@/components/ui/ActivityRing";
import { Counter } from "@/components/ui/Counter";
import { WeekStrip } from "@/components/ui/WeekStrip";
import ReportFoodSheet from "@/components/ReportFoodSheet";

// A food report being composed (drives the shared report sheet). Kept after
// close so the sheet's exit animation can play before it clears.
interface ReportTarget {
  reportType: ReportType;
  context: ReportContext;
  text: string;
  matchedFoodId: string | null;
}

const REPORT_T = {
  cantFind: { en: "Can't find that? Tell us and we'll add it.", roman_urdu: "Nahi mila? Bataayein, hum add kar dein ge." },
  report: { en: "Report", roman_urdu: "Report" },
  noExact: { en: "No exact match. Log will estimate it.", roman_urdu: "Exact match nahi mila. Log estimate kar de ga." },
  showMore: { en: "Show more", roman_urdu: "Aur dikhayein" },
  showLess: { en: "Show less", roman_urdu: "Kam dikhayein" },
  howTo: {
    en: "Type any meal with amounts (English or Roman Urdu — “200g chicken and 2 roti”), or tap a suggestion below to log it exactly.",
    roman_urdu: "Koi bhi khana amount ke saath likhein (English ya Roman Urdu — “200g chicken aur 2 roti”), ya neeche suggestion par tap kar ke exact log karein.",
  },
  saveMeal: { en: "Save today's foods as a meal", roman_urdu: "Aaj ke khane ko meal bana kar save karein" },
  mealNamePlaceholder: { en: "Meal name (e.g. My breakfast)", roman_urdu: "Meal ka naam (jaise Mera nashta)" },
  save: { en: "Save", roman_urdu: "Save" },
  mealItems: { en: "items", roman_urdu: "cheezein" },
  deleteMeal: { en: "Delete meal", roman_urdu: "Meal delete karein" },
} satisfies Record<string, Record<Lang, string>>;

// Plain-words explanation of each trust badge (shown as a tooltip / long-press
// title), so "Verified / Imported / Estimated / Edited" are never mystery labels.
const BADGE_TITLES: Record<string, string> = {
  verified: "Verified — nutrition checked by us",
  recent: "Recent — something you logged before",
  imported: "Imported — from the USDA food database",
  estimated: "Estimated — AI estimate, tap Edit to correct it",
  corrected: "Edited — you set these numbers yourself",
};

// A meal being parsed by the LLM — shown immediately so logging feels instant.
interface PendingLog {
  tempId: string;
  text: string;
}

function localDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

export default function FoodLogger({
  calorieTarget,
  proteinTarget,
  initialItems,
  today,
  lang = "en",
}: {
  calorieTarget: number;
  proteinTarget: number;
  initialItems: FoodLog[];
  today: string;
  lang?: Lang;
}) {
  const rt = (k: keyof typeof REPORT_T) => REPORT_T[k][lang];

  // Seeded from the server — no mount fetch, so the list is there on first paint.
  const [items, setItems] = useState<FoodLog[]>(initialItems);
  const [pending, setPending] = useState<PendingLog[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [foodSearching, setFoodSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LogFoodSearchOption[]>([]);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [recentQuick, setRecentQuick] = useState<LogFoodSearchOption[]>([]);
  // Saved meals ("My meals") — named one-tap repeat combos.
  const [savedMeals, setSavedMeals] = useState<SavedMealSummary[]>([]);
  const [mealLogging, setMealLogging] = useState<string | null>(null);
  const [savingMealOpen, setSavingMealOpen] = useState(false);
  const [mealName, setMealName] = useState("");
  const [mealSaving, setMealSaving] = useState(false);
  const [pickPending, setPickPending] = useState(false);
  const [copyPending, setCopyPending] = useState(false);
  // The last meal the parser couldn't recognise — offers a "report missing" CTA.
  const [unrecognized, setUnrecognized] = useState<string | null>(null);
  // The shared report sheet: target data + open flag (data persists across close
  // so the exit animation plays).
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  function openReport(target: ReportTarget) {
    setReportTarget(target);
    setReportOpen(true);
  }
  // Surface a server-action error — an expired session redirects to login
  // instead of dead-ending the installed PWA on "Not signed in." forever.
  function surfaceError(message: string) {
    if (redirectIfSignedOut(message)) return;
    setError(message);
  }
  // Tracks in-flight logs so a focus-refetch doesn't clobber an optimistic add.
  const inFlight = useRef(0);
  // SYNCHRONOUS double-submit latch. React state guards (e.g. pickPending) are
  // set asynchronously — two fast taps both pass the check before the re-render
  // and insert duplicate rows. A ref flips immediately; released in finally.
  const submitLock = useRef(false);
  // Per-item debounce timers for quantity edits (coalesce rapid +/- taps).
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Totals are computed on the fly (base × amount) — never a frozen number.
  const eaten = sumMacros(items.map(itemMacros));

  const refreshRecentQuick = useCallback(async () => {
    const res = await getRecentLogFoods(10);
    if (res.ok) setRecentQuick(res.foods);
  }, []);

  useEffect(() => {
    void refreshRecentQuick();
    // Saved meals load once; mutations update the list locally.
    void listSavedMeals().then((res) => {
      if (res.ok) setSavedMeals(res.meals);
    });
  }, [refreshRecentQuick]);

  // One tap: log every item of a saved meal into today.
  async function handleLogSavedMeal(id: string) {
    if (submitLock.current || mealLogging) return;
    submitLock.current = true;
    setMealLogging(id);
    setError(null);
    inFlight.current += 1;
    try {
      const res = await logSavedMeal(id, localDateString());
      if (res.ok) setItems((prev) => [...prev, ...res.items]);
      else surfaceError(res.error);
    } catch {
      setError("Couldn't log that meal. Please try again.");
    } finally {
      inFlight.current -= 1;
      setMealLogging(null);
      submitLock.current = false;
    }
  }

  async function handleSaveMeal() {
    const name = mealName.trim();
    if (!name || mealSaving) return;
    setMealSaving(true);
    setError(null);
    try {
      const res = await saveMeal(name, items.map((i) => i.id));
      if (res.ok) {
        setSavedMeals((prev) => [res.meal, ...prev]);
        setMealName("");
        setSavingMealOpen(false);
      } else {
        surfaceError(res.error);
      }
    } catch {
      setError("Couldn't save the meal. Please try again.");
    } finally {
      setMealSaving(false);
    }
  }

  async function handleDeleteSavedMeal(id: string) {
    const snapshot = savedMeals;
    setSavedMeals((prev) => prev.filter((m) => m.id !== id)); // optimistic
    const res = await deleteSavedMeal(id);
    if (!res.ok) {
      setSavedMeals(snapshot);
      setError(res.error ?? "Couldn't delete that meal.");
    }
  }

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const query = text.trim();
    setSearchExpanded(false);
    if (query.length < 2) {
      setSearchResults([]);
      setFoodSearching(false);
      return;
    }

    let cancelled = false;
    setFoodSearching(true);
    searchTimer.current = setTimeout(async () => {
      const res = await searchLogFoods(query);
      if (cancelled) return;
      setSearchResults(res.ok ? res.foods : []);
      setFoodSearching(false);
    }, 250);

    return () => {
      cancelled = true;
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [text]);

  // Re-read the day's items when the tab regains focus, and re-align if the
  // CLIENT's local day differs from the server-rendered day (first-visit UTC
  // fallback, or the tab being left open across local midnight). This is the
  // server (DB) truth, so nothing "disappears" just because the page was stale.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (inFlight.current > 0) return; // don't fight an optimistic add mid-write
      const rows = await getFoodLogs(localDateString());
      if (!cancelled) setItems(rows);
      // Keep quick-add lists in sync across tabs too (a meal saved in another
      // tab shows up here on refocus).
      void refreshRecentQuick();
      void listSavedMeals().then((res) => {
        if (!cancelled && res.ok) setSavedMeals(res.meals);
      });
    }
    // Align on mount only when the client's real day != the day we rendered for.
    if (localDateString() !== today) void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [today, refreshRecentQuick]);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    const meal = text.trim();
    if (!meal) return;
    if (submitLock.current) return; // double-Enter = one log, not two
    submitLock.current = true;

    // OPTIMISTIC: show a "reading…" row and clear the input right away.
    const tempId = crypto.randomUUID();
    setPending((p) => [...p, { tempId, text: meal }]);
    setText("");
    setError(null);
    setUnrecognized(null);
    inFlight.current += 1;

    try {
      // Write with the user's LIVE local day (not the stale render-time prop),
      // so the item lands on the day the dashboard will query next.
      const res = await logFood({ text: meal, date: localDateString() });
      if (res.ok) {
        setItems((prev) => [...prev, ...res.items]);
        void refreshRecentQuick();
      } else {
        surfaceError(res.error);
        setText(meal); // never silently drop the user's input — let them retry
        // Only offer "report missing food" when the parser genuinely found
        // nothing (not for network/parse errors).
        if (res.reason === "no_match") setUnrecognized(meal);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setText(meal);
    } finally {
      setPending((p) => p.filter((x) => x.tempId !== tempId));
      inFlight.current -= 1;
      submitLock.current = false;
    }
  }

  async function handlePickSearchResult(optionId: string) {
    if (submitLock.current) return;
    submitLock.current = true;
    setPickPending(true);
    setError(null);
    setUnrecognized(null);
    inFlight.current += 1;
    try {
      const res = await logSearchedFood({ optionId, date: localDateString() });
      if (res.ok) {
        setItems((prev) => [...prev, ...res.items]);
        setText("");
        setSearchResults([]);
        void refreshRecentQuick();
      } else {
        surfaceError(res.error);
      }
    } catch {
      setError("Couldn't log that food. Please try again.");
    } finally {
      inFlight.current -= 1;
      setPickPending(false);
      submitLock.current = false;
    }
  }

  async function copyYesterday() {
    if (submitLock.current || copyPending || count > 0) return;
    submitLock.current = true;
    setCopyPending(true);
    setError(null);
    setUnrecognized(null);
    inFlight.current += 1;
    try {
      const res = await copyFoodLogs({ fromDate: localDateOffset(-1), toDate: localDateString() });
      if (res.ok) {
        setItems(res.items);
        void refreshRecentQuick();
      } else {
        surfaceError(res.error);
      }
    } catch {
      setError("Couldn't copy yesterday. Please try again.");
    } finally {
      inFlight.current -= 1;
      setCopyPending(false);
      submitLock.current = false;
    }
  }

  // Clear any pending quantity-save timers on unmount.
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  // Adjust HOW MUCH was eaten: optimistic + live (itemMacros recomputes the row
  // AND the rings), persisted on a short debounce. On failure we reconcile with
  // the DB so a change is never silently dropped or left phantom.
  function changeAmount(id: string, amount: number) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, amount, source: "corrected" } : i)));
    setError(null);
    if (timers.current[id]) clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      inFlight.current += 1;
      try {
        const res = await setFoodItemAmount(id, amount);
        if (res.ok) {
          setItems((prev) => prev.map((i) => (i.id === id ? res.item : i)));
        } else {
          surfaceError(res.error);
          setItems(await getFoodLogs(localDateString())); // reconcile with DB truth
        }
      } catch {
        setError("Couldn't save the amount. Please try again.");
        setItems(await getFoodLogs(localDateString()));
      } finally {
        inFlight.current -= 1;
      }
    }, 450);
  }

  // Manual exact-numbers correction (optimistic + rollback). Stores the entered
  // total as per-unit base at the current amount so it stays consistent + scales.
  async function correctItem(id: string, patch: { calories: number; protein_g: number }) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const amt = i.amount && i.amount > 0 ? i.amount : 1;
        return {
          ...i,
          calories: patch.calories,
          protein_g: patch.protein_g,
          base_calories: patch.calories / amt,
          base_protein_g: patch.protein_g / amt,
          source: "corrected",
        };
      })
    );
    const res = await correctFoodItem(id, patch);
    if (!res.ok) {
      setItems(snapshot);
      surfaceError(res.error);
    } else {
      setItems((prev) => prev.map((i) => (i.id === id ? res.item : i)));
    }
  }

  // OPTIMISTIC delete: remove now, restore on error.
  async function removeItem(id: string) {
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const res = await deleteFoodItem(id);
    if (!res.ok) {
      setItems(snapshot);
      setError(res.error ?? "Couldn't delete that.");
    }
  }

  const count = items.length + pending.length;
  const query = text.trim();
  const visibleSearchResults = searchExpanded ? searchResults : searchResults.slice(0, 8);
  const showQuickAdd = query.length === 0 && (recentQuick.length > 0 || savedMeals.length > 0 || count === 0);

  return (
    <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-7">
      {/* Current-week date strip (visual only). */}
      <motion.div variants={fadeUp}>
        <WeekStrip />
      </motion.div>

      {/* Hero: two separate rings — calories and protein, side by side. */}
      <motion.section variants={fadeUp}>
        <div className="grid grid-cols-2 gap-2 rounded-card-xl border border-border bg-card p-5">
          <RingStat label="Calories" value={eaten.calories} max={calorieTarget} unit="kcal" tone="primary" />
          <RingStat label="Protein" value={eaten.protein_g} max={proteinTarget} unit="g" tone="accent" />
        </div>
      </motion.section>

      {/* Log food by text */}
      <motion.form variants={fadeUp} onSubmit={handleLog} className="flex flex-col gap-2">
        <label className="stat-label">What did you eat?</label>
        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="do roti, ek pyali daal" />
          <Button type="submit" disabled={!text.trim()}>
            Log
          </Button>
        </div>
        {/* One line of "how this works" — shown only before the first log so it
            teaches without becoming permanent noise. */}
        {count === 0 && <p className="text-xs leading-relaxed text-muted-foreground">{rt("howTo")}</p>}
        {showQuickAdd && (
          <div className="rounded-card-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <History size={14} aria-hidden /> Quick add
              </p>
              {count === 0 && (
                <Button type="button" variant="secondary" size="sm" loading={copyPending} onClick={copyYesterday}>
                  <CopyPlus size={15} aria-hidden />
                  Yesterday
                </Button>
              )}
            </div>
            {/* Saved meals — one tap logs the whole named combo, exactly as saved. */}
            {savedMeals.length > 0 && (
              <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
                {savedMeals.map((meal) => (
                  <div
                    key={meal.id}
                    className="relative w-40 shrink-0 rounded-field border border-primary/30 bg-primary-soft"
                  >
                    <button
                      type="button"
                      disabled={mealLogging !== null}
                      onClick={() => handleLogSavedMeal(meal.id)}
                      className="min-h-[74px] w-full px-3 py-2 text-left transition active:scale-[0.98] disabled:opacity-50"
                    >
                      <span className="block truncate text-sm font-semibold text-primary">
                        {mealLogging === meal.id ? "…" : meal.name}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {meal.itemCount} {rt("mealItems")}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                        {meal.calories} kcal · {meal.protein_g}g
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`${rt("deleteMeal")}: ${meal.name}`}
                      onClick={() => handleDeleteSavedMeal(meal.id)}
                      className="absolute right-1 top-1 rounded-full p-1 text-muted-foreground transition hover:text-foreground"
                    >
                      <X size={13} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {recentQuick.length > 0 ? (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {recentQuick.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    disabled={pickPending || copyPending}
                    onClick={() => handlePickSearchResult(food.id)}
                    className="min-h-[74px] w-40 shrink-0 rounded-field border border-border bg-background px-3 py-2 text-left transition hover:border-primary/50 hover:bg-muted active:scale-[0.98] disabled:opacity-50"
                  >
                    <span className="block truncate text-sm font-semibold text-foreground">{food.name}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{food.portion}</span>
                    <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                      {food.calories} kcal · {food.protein}g
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Your repeated foods will show up here after a few logs.</p>
            )}
          </div>
        )}
        {foodSearching && <p className="px-1 text-xs text-muted-foreground">Searching...</p>}
        {visibleSearchResults.length > 0 && (
          <div className="rounded-card-lg border border-border bg-card p-2">
            <ul className="flex flex-col gap-1">
              {visibleSearchResults.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    disabled={pickPending}
                    onClick={() => handlePickSearchResult(food.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-field px-2.5 py-2 text-left transition hover:bg-muted active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{food.name}</span>
                        <FoodQualityBadge quality={food.quality} label={food.label} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{food.portion}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {food.calories} kcal · {food.protein}g
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {searchResults.length > 8 && (
              <button
                type="button"
                onClick={() => setSearchExpanded((v) => !v)}
                className="mt-1 px-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                {searchExpanded ? rt("showLess") : rt("showMore")}
              </button>
            )}
          </div>
        )}
        {!foodSearching && query.length >= 2 && searchResults.length === 0 && (
          <div className="space-y-1 px-1">
            <p className="text-xs text-muted-foreground">{rt("noExact")}</p>
            <button
              type="button"
              onClick={() => openReport({ reportType: "missing", context: "home_log", text: query, matchedFoodId: null })}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline active:scale-[0.99]"
            >
              {rt("cantFind")}
            </button>
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {/* Primary trigger: parser found nothing → offer to report it as missing. */}
        {unrecognized && (
          <button
            type="button"
            onClick={() =>
              openReport({ reportType: "missing", context: "home_log", text: unrecognized, matchedFoodId: null })
            }
            className="self-start text-sm font-medium text-primary underline-offset-2 hover:underline active:scale-[0.99]"
          >
            {rt("cantFind")}
          </button>
        )}
      </motion.form>

      {/* Today's items */}
      <motion.section variants={fadeUp} className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
          Today{count > 0 ? ` · ${count}` : ""}
        </h2>

        {count === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="Nothing logged yet" hint="Type a meal above to get started." />
        ) : (
          <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-2.5">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) => (
                <motion.div key={item.id} variants={listItem} exit="exit" layout>
                  <FoodItemRow
                    item={item}
                    lang={lang}
                    onAmountChange={changeAmount}
                    onCorrect={correctItem}
                    onDelete={removeItem}
                    onReport={(it) =>
                      openReport({ reportType: "incorrect", context: "home_log", text: it.food_name, matchedFoodId: null })
                    }
                  />
                </motion.div>
              ))}
              {pending.map((p) => (
                <motion.div key={p.tempId} variants={listItem} exit="exit" layout>
                  <PendingRow text={p.text} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Save today's items as a named meal — most logs are repeats, so the
            next time it's ONE tap from Quick add instead of typing it all again. */}
        {items.length >= 2 && (
          <div className="rounded-card-lg border border-border bg-card p-3">
            {savingMealOpen ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSaveMeal();
                }}
                className="flex gap-2"
              >
                <Input
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  placeholder={rt("mealNamePlaceholder")}
                  maxLength={60}
                  autoFocus
                />
                <Button type="submit" size="sm" loading={mealSaving} disabled={!mealName.trim()}>
                  {rt("save")}
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setSavingMealOpen(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition active:scale-[0.98]"
              >
                <BookmarkPlus size={16} aria-hidden /> {rt("saveMeal")}
              </button>
            )}
          </div>
        )}
      </motion.section>

      {/* Shared report sheet (missing from the log form, incorrect from a row). */}
      <ReportFoodSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        reportType={reportTarget?.reportType ?? "missing"}
        context={reportTarget?.context ?? "home_log"}
        reportedText={reportTarget?.text ?? ""}
        matchedFoodId={reportTarget?.matchedFoodId ?? null}
        lang={lang}
      />
    </motion.div>
  );
}

// One daily metric as its own ring: a big count-up number inside the ring, with
// a muted label above and "X left" below. Calories = emerald, protein = amber.
function RingStat({
  label,
  value,
  max,
  unit,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  tone: "primary" | "accent";
}) {
  const left = Math.round(max - value);
  const over = max > 0 && value > max;
  const ringColor = over ? "rgb(var(--destructive))" : tone === "accent" ? "rgb(var(--ring-2))" : "rgb(var(--ring-1))";
  const leftColor = over ? "text-destructive" : tone === "accent" ? "text-accent" : "text-primary";

  return (
    <div className="flex flex-col items-center gap-2.5">
      <p className="stat-label">{label}</p>
      <ActivityRing value={value} max={max} color={ringColor} size={132} stroke={13}>
        <div className="flex flex-col items-center">
          <Counter value={value} className="stat-value text-2xl text-foreground" />
          <span className="text-[10px] text-muted-foreground">
            of {Math.round(max)} {unit}
          </span>
        </div>
      </ActivityRing>
      <p className={`text-xs font-semibold ${leftColor}`}>
        {over ? `${Math.abs(left)} ${unit} over` : `${left} ${unit} left`}
      </p>
    </div>
  );
}

function FoodQualityBadge({ quality, label }: { quality: LogFoodSearchOption["quality"]; label: string }) {
  const tone =
    quality === "verified" ? "success" : quality === "recent" ? "primary" : quality === "estimated" ? "warning" : "muted";
  return (
    <Badge tone={tone} title={BADGE_TITLES[quality]}>
      {label}
    </Badge>
  );
}

/**
 * Trust badge for a LOGGED item: keyed to nutrition_source (where the NUMBERS
 * came from), not `source` (how the row was created) — a typed meal that
 * grounded to the verified catalog must show "Verified", not "estimated".
 * Legacy rows (logged before the provenance migration) fall back to `source`.
 */
function NutritionSourceBadge({ item }: { item: FoodLog }) {
  const ns =
    item.nutrition_source ??
    (item.source === "llm" ? "estimated" : item.source === "corrected" ? "corrected" : null);
  if (ns === "verified") return <Badge tone="success" title={BADGE_TITLES.verified}>Verified</Badge>;
  if (ns === "imported") return <Badge tone="muted" title={BADGE_TITLES.imported}>Imported</Badge>;
  if (ns === "corrected") return <Badge tone="primary" title={BADGE_TITLES.corrected}>Edited</Badge>;
  if (ns === "estimated") return <Badge tone="warning" title={BADGE_TITLES.estimated}>Estimated</Badge>;
  return null;
}

function PendingRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card-lg border border-border bg-card p-4 opacity-70">
      <Spinner size="sm" className="text-primary" label="Reading your meal" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{text}</p>
        <p className="text-xs text-muted-foreground">Reading…</p>
      </div>
    </div>
  );
}

// --- one food item, with inline one-tap correction ------------------------

function FoodItemRow({
  item,
  lang,
  onAmountChange,
  onCorrect,
  onDelete,
  onReport,
}: {
  item: FoodLog;
  lang: Lang;
  onAmountChange: (id: string, amount: number) => void;
  onCorrect: (id: string, patch: { calories: number; protein_g: number }) => void;
  onDelete: (id: string) => void;
  onReport: (item: FoodLog) => void;
}) {
  const [editing, setEditing] = useState(false);
  const m = itemMacros(item); // live total = base × amount
  const amount = item.amount ?? 1;
  // Editable exact numbers shown alongside quantity. They follow the quantity
  // (resync when amount changes); a manual edit + Save overrides them.
  const [cal, setCal] = useState(String(m.calories));
  const [pro, setPro] = useState(String(m.protein_g));
  useEffect(() => {
    const t = itemMacros(item);
    setCal(String(t.calories));
    setPro(String(t.protein_g));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);
  const qtyLabel =
    item.unit_mode === "portion"
      ? `${amount} g`
      : `${amount}${item.unit && item.unit !== "item" ? ` ${item.unit}` : ""}`;

  // base = per unit (count) or per gram (portion); fall back to stored totals.
  const spec: QtySpec = {
    unitMode: item.unit_mode ?? "count",
    baseCalories: item.base_calories ?? item.calories,
    baseProtein: item.base_protein_g ?? item.protein_g,
    baseCarbs: item.base_carbs_g ?? item.carbs_g,
    baseFat: item.base_fat_g ?? item.fat_g,
    servingGrams: item.serving_grams,
    unit: item.unit && item.unit !== "item" ? item.unit : "",
  };

  return (
    <div className="rounded-card-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {item.food_name}
            <span className="font-normal text-muted-foreground"> · {qtyLabel}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{m.calories}</span> kcal ·{" "}
            <span className="font-semibold text-accent tabular-nums">{m.protein_g}g</span> protein
            <NutritionSourceBadge item={item} />
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={REPORT_T.report[lang]}
            title={REPORT_T.report[lang]}
            onClick={() => onReport(item)}
            className="px-2 text-muted-foreground hover:text-foreground"
          >
            <Flag size={15} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item.id)}
            className="text-destructive hover:bg-destructive/10"
          >
            Delete
          </Button>
        </div>
      </div>

      {editing && (
        <>
          <QuantityControl spec={spec} amount={amount} onChange={(a) => onAmountChange(item.id, a)} />
          {/* Exact calories + protein, shown with the quantity. Follow the qty;
              hand-edit + Save to override. */}
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Calories
              <Input type="number" value={cal} onChange={(e) => setCal(e.target.value)} className="h-10 w-24" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Protein (g)
              <Input type="number" value={pro} onChange={(e) => setPro(e.target.value)} className="h-10 w-24" />
            </label>
            <Button size="sm" onClick={() => onCorrect(item.id, { calories: Number(cal), protein_g: Number(pro) })}>
              Save
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
