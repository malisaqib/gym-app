import { test } from "node:test";
import assert from "node:assert/strict";
import { toSeries, weightChange, latestWeight } from "./series.ts";

const row = (logged_on: string, weight_kg: number, created_at: string) => ({
  logged_on,
  weight_kg,
  created_at,
});

test("toSeries sorts ascending and keeps the latest entry per day", () => {
  const series = toSeries([
    row("2026-06-02", 80, "2026-06-02T08:00:00Z"),
    row("2026-06-01", 81, "2026-06-01T08:00:00Z"),
    row("2026-06-02", 79, "2026-06-02T20:00:00Z"), // later same day wins
  ]);
  assert.deepEqual(series, [
    { date: "2026-06-01", weight: 81 },
    { date: "2026-06-02", weight: 79 },
  ]);
});

test("weightChange is last minus first, rounded; null if <2 points", () => {
  assert.equal(weightChange([{ date: "a", weight: 81 }, { date: "b", weight: 79.4 }]), -1.6);
  assert.equal(weightChange([{ date: "a", weight: 80 }]), null);
  assert.equal(weightChange([]), null);
});

test("latestWeight returns the last point or null", () => {
  assert.equal(latestWeight([{ date: "a", weight: 80 }, { date: "b", weight: 78 }]), 78);
  assert.equal(latestWeight([]), null);
});
