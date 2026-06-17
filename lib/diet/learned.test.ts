import { test } from "node:test";
import assert from "node:assert/strict";
import { poolIdFromMatched, rankLoggedFoods, type LoggedFoodRow } from "./learned.ts";

test("poolIdFromMatched maps each logging convention to a pool id", () => {
  assert.equal(poolIdFromMatched("catalog:rice"), "rice");
  assert.equal(poolIdFromMatched("db:abc-123"), "db:abc-123");
  assert.equal(poolIdFromMatched("food:abc-123"), "db:abc-123"); // picker id → logged form
  assert.equal(poolIdFromMatched(null), null);
  assert.equal(poolIdFromMatched(""), null);
  assert.equal(poolIdFromMatched("   "), null);
  assert.equal(poolIdFromMatched("catalog:"), null); // empty after prefix
  assert.equal(poolIdFromMatched("weird:thing"), null); // unknown — don't guess
});

const NOW = new Date("2026-06-17T12:00:00Z");
const row = (matched: string | null, daysAgo: number, name = "Food"): LoggedFoodRow => {
  const d = new Date(Date.UTC(2026, 5, 17 - daysAgo));
  return { matched_food_id: matched, food_name: name, logged_on: d.toISOString().slice(0, 10) };
};

test("rankLoggedFoods counts by pool id and ignores unmatched estimates", () => {
  const ranked = rankLoggedFoods(
    [
      row("catalog:rice", 0, "Boiled rice"),
      row("catalog:rice", 1, "Boiled rice"),
      row("catalog:chicken_breast", 0, "Grilled chicken breast"),
      row(null, 0, "Some estimate"), // ignored — no match
    ],
    { now: NOW }
  );
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].poolId, "rice"); // logged twice → ranks first
  assert.equal(ranked[0].count, 2);
  assert.equal(ranked[1].poolId, "chicken_breast");
});

test("rankLoggedFoods weights recent logs above old ones at equal count", () => {
  const ranked = rankLoggedFoods(
    [
      row("catalog:rice", 13), // both logged once, but...
      row("catalog:daal", 0), // ...daal is today → higher score
    ],
    { now: NOW, days: 14 }
  );
  assert.deepEqual(ranked.map((r) => r.poolId), ["daal", "rice"]);
});

test("rankLoggedFoods drops rows outside the window and respects the limit", () => {
  const ranked = rankLoggedFoods(
    [row("catalog:rice", 0), row("catalog:daal", 20), row("catalog:roti2", 0)],
    { now: NOW, days: 14, limit: 1 }
  );
  assert.equal(ranked.length, 1); // limit
  assert.ok(ranked.every((r) => r.poolId !== "daal")); // 20 days ago is out of window
});

test("rankLoggedFoods is deterministic on ties", () => {
  const rows = [row("catalog:rice", 0), row("catalog:daal", 0)];
  const a = rankLoggedFoods(rows, { now: NOW });
  const b = rankLoggedFoods([...rows].reverse(), { now: NOW });
  assert.deepEqual(a.map((r) => r.poolId), b.map((r) => r.poolId)); // id tiebreak
});
