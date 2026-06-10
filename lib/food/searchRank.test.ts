import { test } from "node:test";
import assert from "node:assert/strict";
import { rankFoodsForSearch, qualityForFoodSource, labelForFoodQuality, expandFoodQueries } from "./searchRank.ts";

test("verified curated matches rank ahead of imported matches", () => {
  const ranked = rankFoodsForSearch("roti", [
    { name: "Roti, whole wheat", aliases: [], source: "usda_sr", score: 0.92 },
    { name: "Roti / chapati", aliases: ["chapati", "phulka"], source: "curated", score: 0.5 },
  ]);
  assert.equal(ranked[0].source, "curated");
});

test("aliases and Roman Urdu spellings are ranked as strong matches", () => {
  const ranked = rankFoodsForSearch("aam", [
    { name: "Apple", aliases: [], source: "curated", score: 0.5 },
    { name: "Mango", aliases: ["aam"], source: "curated", score: 0.2 },
  ]);
  assert.equal(ranked[0].name, "Mango");
});

test("an exact imported match can beat an unrelated curated row", () => {
  const ranked = rankFoodsForSearch("soba noodles", [
    { name: "Daal (lentils)", aliases: ["daal"], source: "curated", score: 0.8 },
    { name: "Soba noodles, cooked", aliases: [], source: "usda_sr", score: 0.4 },
  ]);
  assert.equal(ranked[0].name, "Soba noodles, cooked");
});

test("short food words do not match inside unrelated longer words", () => {
  const ranked = rankFoodsForSearch("roti", [
    { name: "Chicken, rotisserie", aliases: [], source: "usda_sr", score: 0.8 },
    { name: "Roti / chapati", aliases: ["chapati"], source: "curated", score: 0.2 },
  ]);
  assert.equal(ranked[0].name, "Roti / chapati");
});

test("quality labels are stable", () => {
  assert.equal(labelForFoodQuality(qualityForFoodSource("curated")), "Verified");
  assert.equal(labelForFoodQuality(qualityForFoodSource("usda_sr")), "Imported");
  assert.equal(labelForFoodQuality(qualityForFoodSource("user_estimate")), "Estimated");
});

test("common Roman Urdu queries expand to English food terms", () => {
  assert.ok(expandFoodQueries("aam").includes("mango"));
  assert.ok(expandFoodQueries("anda").includes("egg"));
  assert.ok(expandFoodQueries("chawal").includes("rice"));
});
