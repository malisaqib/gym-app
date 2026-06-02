import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRelatableGoal, buildPlanGuidance } from "./goals.ts";

test("relatable goals map to the right practical goal", () => {
  assert.equal(mapRelatableGoal("wedding_event").goal, "lose_fat");
  assert.equal(mapRelatableGoal("shirt_look").goal, "lose_fat");
  assert.equal(mapRelatableGoal("belly_fat").goal, "lose_fat");
  assert.equal(mapRelatableGoal("skinny_bulk").goal, "gain_muscle");
  assert.equal(mapRelatableGoal("sports").goal, "maintain");
  assert.equal(mapRelatableGoal("general").goal, "maintain");
});

test("unknown goal falls back to general/maintain", () => {
  assert.equal(mapRelatableGoal("nonsense").goal, "maintain");
});

test("plan guidance is built in the chosen language and mentions the timeline", () => {
  const en = buildPlanGuidance({
    relatableGoalKey: "shirt_look",
    timeline: "8_weeks",
    foodPreference: "normal_desi",
    trainingLocation: "gym",
    lang: "en",
  });
  assert.match(en.headline, /goal/i);
  assert.match(en.explanation, /8 weeks/);
  assert.ok(en.diet.length > 0 && en.workout.length > 0);

  const ur = buildPlanGuidance({
    relatableGoalKey: "skinny_bulk",
    timeline: "no_deadline",
    foodPreference: "budget",
    trainingLocation: "home",
    lang: "roman_urdu",
  });
  assert.match(ur.headline, /samajh gaya/);
});
