import { test } from "node:test";
import assert from "node:assert/strict";
import { keywordPreferences } from "./dietCoach.ts";

// The deterministic fallback must catch specific "avoid X" foods even without AI.
test("keywordPreferences extracts a specific avoided food (whey)", () => {
  const f = keywordPreferences("avoid adding the whey protein shake since it's out of my budget");
  assert.ok(f.excludeFoods?.some((p) => p.includes("whey protein shake")), JSON.stringify(f));
});

test("keywordPreferences maps a known category to a tag", () => {
  const f = keywordPreferences("no beef please");
  assert.ok(f.excludeTags?.includes("beef"));
});

test("keywordPreferences detects vegetarian", () => {
  assert.equal(keywordPreferences("I'm vegetarian").vegetarian, true);
});

test("keywordPreferences handles Roman Urdu 'X nahi'", () => {
  const f = keywordPreferences("biryani nahi khani");
  assert.ok(f.excludeFoods?.some((p) => p.includes("biryani")), JSON.stringify(f));
});

test("no false positives on a plain positive sentence", () => {
  const f = keywordPreferences("I like chicken and rice");
  assert.equal(f.excludeFoods, undefined);
  assert.equal(f.excludeTags, undefined);
});
