"use client";

import { useEffect, useState } from "react";
import type { FoodLog } from "@/lib/database.types";
import { sumMacros, remaining, percent } from "@/lib/food/totals";
import { getFoodLogs, logFood, correctFoodItem, deleteFoodItem } from "./actions";

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

    const res = await logFood({ text, date });
    if (res.ok) {
      setItems((prev) => [...prev, ...res.items]);
      setText("");
    } else {
      setError(res.error);
    }
    setIsLogging(false);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Progress vs target */}
      <div className="grid grid-cols-2 gap-3">
        <ProgressCard
          label="Calories"
          eaten={eaten.calories}
          target={calorieTarget}
          unit="kcal"
        />
        <ProgressCard
          label="Protein"
          eaten={eaten.protein_g}
          target={proteinTarget}
          unit="g"
        />
      </div>

      {/* Log food by text */}
      <form onSubmit={handleLog} className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700">
          What did you eat?
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. do roti, ek pyali daal"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none"
            disabled={isLogging}
          />
          <button
            type="submit"
            disabled={isLogging || !text.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
          >
            {isLogging ? "Logging…" : "Log"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {/* Today's items */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Today{items.length > 0 ? ` (${items.length})` : ""}
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing logged yet. Type a meal above to get started.
          </p>
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
      </div>
    </div>
  );
}

// --- progress card ---------------------------------------------------------

function ProgressCard({
  label,
  eaten,
  target,
  unit,
}: {
  label: string;
  eaten: number;
  target: number;
  unit: string;
}) {
  const left = remaining(target, eaten);
  const over = left < 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800">
        {Math.round(eaten)}
        <span className="text-sm font-normal text-slate-400"> / {target} {unit}</span>
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full ${over ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${percent(eaten, target)}%` }}
        />
      </div>
      <p className={`mt-1 text-xs ${over ? "text-amber-600" : "text-slate-500"}`}>
        {over ? `${Math.abs(left)} ${unit} over` : `${left} ${unit} left`}
      </p>
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
    const res = await correctFoodItem(item.id, {
      calories: Number(cal),
      protein_g: Number(protein),
    });
    setBusy(false);
    if (res.ok) {
      onUpdate(res.item);
      setEditing(false);
    }
  }

  async function remove() {
    setBusy(true);
    const res = await deleteFoodItem(item.id);
    setBusy(false);
    if (res.ok) onDelete(item.id);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">
            {item.food_name}
            {item.quantity ? (
              <span className="text-slate-400">
                {" "}
                · {item.quantity} {item.unit}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-slate-500">
            {item.calories} kcal · {item.protein_g}g protein
            {item.source === "corrected" && (
              <span className="ml-1 text-emerald-600">· edited</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2 text-xs">
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-slate-500 underline"
            disabled={busy}
          >
            {editing ? "Close" : "Edit"}
          </button>
          <button onClick={remove} className="text-red-500" disabled={busy}>
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-2 flex items-end gap-2">
          <label className="flex flex-col text-xs text-slate-500">
            Calories
            <input
              type="number"
              value={cal}
              onChange={(e) => setCal(e.target.value)}
              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Protein (g)
            <input
              type="number"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={save}
            disabled={busy}
            className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
