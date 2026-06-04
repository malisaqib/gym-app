"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { FoodLog } from "@/lib/database.types";
import { listContainer, listItem } from "@/lib/motion";
import { sumMacros } from "@/lib/food/totals";
import { logFood, correctFoodItem, deleteFoodItem } from "./actions";
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

  const eaten = sumMacros(items);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    const meal = text.trim();
    if (!meal) return;

    // OPTIMISTIC: show a "reading…" row and clear the input right away.
    const tempId = crypto.randomUUID();
    setPending((p) => [...p, { tempId, text: meal }]);
    setText("");
    setError(null);

    try {
      const res = await logFood({ text: meal, date: today });
      if (res.ok) {
        setItems((prev) => [...prev, ...res.items]);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending((p) => p.filter((x) => x.tempId !== tempId));
    }
  }

  // OPTIMISTIC edit: apply locally, reconcile with the server, roll back on error.
  async function correctItem(id: string, patch: { calories: number; protein_g: number }) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, calories: patch.calories, protein_g: patch.protein_g, source: "corrected" } : i
      )
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
                  <FoodItemRow item={item} onCorrect={correctItem} onDelete={removeItem} />
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
  onCorrect,
  onDelete,
}: {
  item: FoodLog;
  onCorrect: (id: string, patch: { calories: number; protein_g: number }) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cal, setCal] = useState(String(item.calories));
  const [protein, setProtein] = useState(String(item.protein_g));

  function save() {
    onCorrect(item.id, { calories: Number(cal), protein_g: Number(protein) });
    setEditing(false); // optimistic — close immediately
  }

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {item.food_name}
            {item.quantity ? (
              <span className="text-muted-foreground">
                {" "}
                · {item.quantity} {item.unit}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {item.calories} kcal · {item.protein_g}g protein
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
        <div className="mt-3 flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Calories
            <Input type="number" value={cal} onChange={(e) => setCal(e.target.value)} className="h-9 w-24" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Protein (g)
            <Input
              type="number"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              className="h-9 w-24"
            />
          </label>
          <Button size="sm" onClick={save}>
            Save
          </Button>
        </div>
      )}
    </Card>
  );
}
