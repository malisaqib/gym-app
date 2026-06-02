import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestProgression, type ProgressionTarget } from "./progression.ts";

const target: ProgressionTarget = {
  sets: 3,
  repMax: 15,
  repUnit: "reps",
  harder: "feet-elevated push-ups",
};

test("first time (no history) gives a starter cue, no graduation", () => {
  const a = suggestProgression([], target);
  assert.equal(a.graduate, false);
  assert.match(a.message, /First time/);
});

test("graduates when all sets hit the top of the range", () => {
  const a = suggestProgression([{ reps: 15 }, { reps: 16 }, { reps: 15 }], target);
  assert.equal(a.graduate, true);
  assert.match(a.message, /level up/);
});

test("does not graduate if any set fell short", () => {
  const a = suggestProgression([{ reps: 15 }, { reps: 12 }, { reps: 15 }], target);
  assert.equal(a.graduate, false);
});

test("does not graduate with too few sets, even at max reps", () => {
  const a = suggestProgression([{ reps: 15 }, { reps: 15 }], target);
  assert.equal(a.graduate, false);
});

test("seconds-based targets read as 'sec'", () => {
  const plank: ProgressionTarget = { sets: 3, repMax: 45, repUnit: "seconds", harder: "longer holds" };
  const a = suggestProgression([{ reps: 30 }], plank);
  assert.match(a.message, /sec/);
});
