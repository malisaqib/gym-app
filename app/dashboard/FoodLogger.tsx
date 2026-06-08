"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { FoodLog } from "@/lib/database.types";
import { listContainer, listItem } from "@/lib/motion";
import { sumMacros } from "@/lib/food/totals";
import { itemMacros } from "@/lib/food/quantity";
import { localDateString } from "@/lib/localDate";
import { logFood, getFoodLogs, setFoodItemAmount, correctFoodItem, deleteFoodItem } from "./actions";
import QuantityControl, { type QtySpec } from "@/components/QuantityControl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressRing } from "@/components/ui/ProgressRing";

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
}: {
  calorieTarget: number;
  proteinTarget: number;
  initialItems: FoodLog[];
  today: string;
}) {
  // Seeded from the server — no mount fetch, so the list is there on first paint.
  const [items, setItems] = useState<FoodLog[]>(initialItems);
  const [pending, setPending] = useState<PendingLog[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Tracks in-flight logs so a focus-refetch doesn't clobber an optimistic add.
  const inFlight = useRef(0);
  // Per-item debounce timers for quantity edits (coalesce rapid +/- taps).
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Totals are computed on the fly (base × amount) — never a frozen number.
  const eaten = sumMacros(items.map(itemMacros));

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
    <div className="flex flex-col gap-6">
      {/* Progress vs target — the calm hero of the screen */}
      <Card className="p-5">
        <div className="grid grid-cols-2 gap-2">
          <ProgressRing label="Calories" value={eaten.calories} max={calorieTarget} unit="kcal" tone="primary" />
          <ProgressRing label="Protein" value={eaten.protein_g} max={proteinTarget} unit="g" tone="accent" />
        </div>
      </Card>

      {/* Log food by text */}
      <form onSubmit={handleLog} className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">What did you eat?</label>
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="do roti, ek pyali daal"
          />
          <Button type="submit" disabled={!text.trim()}>
            Log
          </Button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </form>

      {/* Today's items */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Today{count > 0 ? ` · ${count}` : ""}
        </h2>

        {count === 0 ? (
          <EmptyState icon="🍽️" title="Nothing logged yet" hint="Type a meal above to get started." />
        ) : (
          <motion.div
            variants={listContainer}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-2"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) => (
                <motion.div key={item.id} variants={listItem} exit="exit" layout>
                  <FoodItemRow
                    item={item}
                    onAmountChange={changeAmount}
                    onCorrect={correctItem}
                    onDelete={removeItem}
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
      </section>
    </div>
  );
}

// A meal still being parsed — instant feedback while the LLM works.
function PendingRow({ text }: { text: string }) {
  return (
    <Card className="flex items-center gap-3 p-3 opacity-70">
      <Spinner size="sm" className="text-primary" label="Reading your meal" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{text}</p>
        <p className="text-xs text-muted-foreground">Reading…</p>
      </div>
    </Card>
  );
}

// --- one food item, with inline one-tap correction ------------------------

function FoodItemRow({
  item,
  onAmountChange,
  onCorrect,
  onDelete,
}: {
  item: FoodLog;
  onAmountChange: (id: string, amount: number) => void;
  onCorrect: (id: string, patch: { calories: number; protein_g: number }) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const m = itemMacros(item); // live total = base × amount
  const amount = item.amount ?? 1;
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
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {item.food_name}
            <span className="text-muted-foreground"> · {qtyLabel}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {m.calories} kcal · {m.protein_g}g protein
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
          {fixing ? (
            <ManualEdit
              calories={m.calories}
              protein={m.protein_g}
              onSave={(c, p) => {
                onCorrect(item.id, { calories: c, protein_g: p });
                setFixing(false);
              }}
              onCancel={() => setFixing(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setFixing(true)}
              className="mt-3 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Fix exact calories / protein
            </button>
          )}
        </>
      )}
    </Card>
  );
}

// Manual exact-numbers override (the original calories/protein edit), kept as a
// secondary option under the quantity control.
function ManualEdit({
  calories,
  protein,
  onSave,
  onCancel,
}: {
  calories: number;
  protein: number;
  onSave: (calories: number, protein: number) => void;
  onCancel: () => void;
}) {
  const [cal, setCal] = useState(String(calories));
  const [pro, setPro] = useState(String(protein));
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Calories
        <Input type="number" value={cal} onChange={(e) => setCal(e.target.value)} className="h-10 w-24" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Protein (g)
        <Input type="number" value={pro} onChange={(e) => setPro(e.target.value)} className="h-10 w-24" />
      </label>
      <Button size="sm" onClick={() => onSave(Number(cal), Number(pro))}>
        Save
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
