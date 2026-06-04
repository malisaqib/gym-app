import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { filterExercises, type Exercise } from "./exerciseDb.ts";

// Load the vendored dataset directly from disk. (exerciseCatalog.ts uses a
// bundler-style JSON import that Node ESM can't resolve without import
// attributes; reading the file keeps this test runnable under `node --test`,
// and still proves the filter works against the REAL data.)
const here = dirname(fileURLToPath(import.meta.url));
const dataPath = join(here, "..", "..", "data", "exercises.json");
const ALL = JSON.parse(readFileSync(dataPath, "utf8")) as Exercise[];

test("dataset loads with the expected fields", () => {
  assert.ok(ALL.length > 800, `expected 800+ exercises, got ${ALL.length}`);
  const sample = ALL[0];
  for (const key of ["id", "name", "level", "equipment", "primaryMuscles", "instructions"] as const) {
    assert.ok(key in sample, `missing field: ${key}`);
  }
});

test("beginner compound exercises that need no equipment", () => {
  const res = filterExercises(ALL, {
    level: "beginner",
    mechanic: "compound",
    equipment: ["body only"],
  });
  assert.ok(res.length > 0, "expected at least one beginner bodyweight compound");
  for (const ex of res) {
    assert.equal(ex.level, "beginner");
    assert.equal(ex.mechanic, "compound");
    assert.equal(ex.equipment, "body only");
  }
});

test("muscleGroups filter matches on primary muscles", () => {
  const chest = filterExercises(ALL, { muscleGroups: ["chest"] });
  assert.ok(chest.length > 0);
  for (const ex of chest) assert.ok(ex.primaryMuscles.includes("chest"));
});

test("equipment acts as an allow-list", () => {
  const res = filterExercises(ALL, { equipment: ["body only", "dumbbell"] });
  assert.ok(res.length > 0);
  for (const ex of res) {
    assert.ok(ex.equipment === "body only" || ex.equipment === "dumbbell");
  }
});

test("level can be a list", () => {
  const res = filterExercises(ALL, { level: ["beginner", "intermediate"] });
  assert.ok(res.length > 0);
  assert.ok(res.every((e) => e.level === "beginner" || e.level === "intermediate"));
});

test("an empty filter returns the whole catalog", () => {
  assert.equal(filterExercises(ALL, {}).length, ALL.length);
});
