"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { FoodLog, Lang, ReportContext, ReportType } from "@/lib/database.types";
import { listContainer, listItem, fadeUp } from "@/lib/motion";
import { sumMacros } from "@/lib/food/totals";
import { itemMacros } from "@/lib/food/quantity";
import { localDateString } from "@/lib/localDate";
import { logFood, getFoodLogs, setFoodItemAmount, correctFoodItem, deleteFoodItem } from "./actions";
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
} satisfies Record<string, Record<Lang, string>>;

// A meal being parsed by the LLM — shown immediately so logging feels instant.
interface PendingLog {
  tempId: string;
  text: string;
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
  // Tracks in-flight logs so a focus-refetch doesn't clobber an optimistic add.
  const inFlight = useRef(0);
  // Per-item debounce timers for quantity edits (coalesce rapid +/- taps).
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Totals are computed on the fly (base × amount) — never a frozen number.
  const eaten = sumMacros(items.map(itemMacros));
  const calLeft = Math.round(calorieTarget - eaten.calories);
  const calOver = calorieTarget > 0 && eaten.calories > calorieTarget;

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
  }, [today]);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    const meal = text.trim();
    if (!meal) return;

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
      } else {
        setError(res.error);
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
          setError(res.error);
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
      setError(res.error);
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

  return (
    <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-7">
      {/* Current-week date strip (visual only). */}
      <motion.div variants={fadeUp}>
        <WeekStrip />
      </motion.div>

      {/* Hero: concentric activity rings (calories + protein) with the big metric. */}
      <motion.section variants={fadeUp} className="flex flex-col items-center gap-6">
        <div className="relative grid place-items-center" style={{ width: 248, height: 248 }}>
          <ActivityRing
            value={eaten.calories}
            max={calorieTarget}
            color={calOver ? "rgb(var(--destructive))" : "rgb(var(--ring-1))"}
            size={248}
            stroke={24}
            className="absolute"
          />
          <ActivityRing
            value={eaten.protein_g}
            max={proteinTarget}
            color="rgb(var(--ring-2))"
            size={186}
            stroke={24}
            delay={0.08}
            className="absolute"
          />
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center">
              <Counter value={eaten.calories} className="stat-value text-[3.25rem] leading-none text-foreground" />
              <span className="stat-label mt-1.5">of {calorieTarget} kcal</span>
              <span className={`mt-2 text-xs font-semibold ${calOver ? "text-destructive" : "text-primary"}`}>
                {calOver ? `${Math.abs(calLeft)} over` : `${calLeft} left`}
              </span>
            </div>
          </div>
        </div>

        {/* Macro tiles — big number / small label rhythm. */}
        <div className="grid w-full grid-cols-3 gap-3">
          <MacroTile label="Protein" value={eaten.protein_g} target={proteinTarget} unit="g" tone="accent" />
          <MacroTile label="Carbs" value={eaten.carbs_g} unit="g" />
          <MacroTile label="Fat" value={eaten.fat_g} unit="g" />
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
          <EmptyState icon="🍽️" title="Nothing logged yet" hint="Type a meal above to get started." />
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

// A daily macro readout: big tabular number + tiny muted label (Apple rhythm).
function MacroTile({
  label,
  value,
  target,
  unit,
  tone,
}: {
  label: string;
  value: number;
  target?: number;
  unit: string;
  tone?: "accent";
}) {
  return (
    <div className="rounded-card-lg border border-border bg-card px-3 py-3.5 text-center">
      <div className="flex items-baseline justify-center gap-0.5">
        <Counter value={value} className={`stat-value text-2xl ${tone === "accent" ? "text-accent" : "text-foreground"}`} />
        <span className="text-xs font-medium text-muted-foreground">{unit}</span>
      </div>
      <p className="stat-label mt-1.5">{label}</p>
      {target ? <p className="mt-0.5 text-[10px] text-muted-foreground">of {Math.round(target)}{unit}</p> : null}
    </div>
  );
}

// A meal still being parsed — instant feedback while the LLM works.
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
            {item.source === "corrected" && <Badge tone="primary">edited</Badge>}
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
            ⚐
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
