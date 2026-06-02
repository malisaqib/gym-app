"use client";

import { useEffect, useState } from "react";
import type { FoodLog } from "@/lib/database.types";
import { sumMacros } from "@/lib/food/totals";
import { getFoodLogs, logFood, correctFoodItem, deleteFoodItem } from "./actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressRing } from "@/components/ui/ProgressRing";

// Today's date in the USER's local timezone as YYYY-MM-DD (DB runs in UTC, so
// we never derive "today" on the server).
function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function FoodLogger({
  calorieTarget,
  proteinTarget,
}: {
  calorieTarget: number;
  proteinTarget: number;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [items, setItems] = useState<FoodLog[]>([]);
  const [text, setText] = useState("");
  const [isLogging, setIsLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load today's items once we know the local date (client-only).
  useEffect(() => {
    const today = localDateString();
    setDate(today);
    getFoodLogs(today).then(setItems);
  }, []);

  const eaten = sumMacros(items);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !date) return;
    setIsLogging(true);
    setError(null);
    try {
      const res = await logFood({ text, date });
      if (res.ok) {
        setItems((prev) => [...prev, ...res.items]);
        setText("");
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsLogging(false);
    }
  }

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
            disabled={isLogging}
          />
          <Button type="submit" loading={isLogging} disabled={!text.trim()}>
            Log
          </Button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </form>

      {/* Today's items */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Today{items.length > 0 ? ` · ${items.length}` : ""}
        </h2>
        {items.length === 0 ? (
          <EmptyState icon="🍽️" title="Nothing logged yet" hint="Type a meal above to get started." />
        ) : (
          items.map((item) => (
            <FoodItemRow
              key={item.id}
              item={item}
              onUpdate={(updated) =>
                setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
              }
              onDelete={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
            />
          ))
        )}
      </section>
    </div>
  );
}

// --- one food item, with inline one-tap correction ------------------------

function FoodItemRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: FoodLog;
  onUpdate: (item: FoodLog) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cal, setCal] = useState(String(item.calories));
  const [protein, setProtein] = useState(String(item.protein_g));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await correctFoodItem(item.id, {
        calories: Number(cal),
        protein_g: Number(protein),
      });
      if (res.ok) {
        onUpdate(res.item);
        setEditing(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await deleteFoodItem(item.id);
      if (res.ok) onDelete(item.id);
    } finally {
      setBusy(false);
    }
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
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} disabled={busy}>
            {editing ? "Close" : "Edit"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={busy}
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
            <Input
              type="number"
              value={cal}
              onChange={(e) => setCal(e.target.value)}
              className="h-9 w-24"
            />
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
          <Button size="sm" onClick={save} loading={busy}>
            Save
          </Button>
        </div>
      )}
    </Card>
  );
}
