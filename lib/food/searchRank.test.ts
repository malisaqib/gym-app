import { test } from "node:test";
import assert from "node:assert/strict";
import { rankFoodsForSearch, foodSearchScore, qualityForFoodSource, labelForFoodQuality, expandFoodQueries, expandFoodQueryTerms } from "./searchRank.ts";

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

test("obscure imported foods rank below common imported foods for broad searches", () => {
  const ranked = rankFoodsForSearch("mushrooms", [
    { name: "Mushrooms, straw, canned, drained solids", aliases: [], source: "usda_sr", score: 0.9 },
    { name: "Mushrooms, white, cooked, boiled, drained, without salt", aliases: [], source: "usda_sr", score: 0.2 },
  ]);
  assert.equal(ranked[0].name, "Mushrooms, white, cooked, boiled, drained, without salt");
});

test("specific searches can still find obscure imported foods", () => {
  const ranked = rankFoodsForSearch("straw mushrooms", [
    { name: "Mushrooms, white, cooked, boiled, drained, without salt", aliases: [], source: "usda_sr", score: 0.9 },
    { name: "Mushrooms, straw, canned, drained solids", aliases: [], source: "usda_sr", score: 0.2 },
  ]);
  assert.equal(ranked[0].name, "Mushrooms, straw, canned, drained solids");
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

test("desi dish spellings bridge to USDA/FNDDS names", () => {
  assert.ok(expandFoodQueries("beef kebab").includes("kabob")); // FNDDS spells it kabob
  assert.ok(expandFoodQueries("chicken handi").includes("curry"));
  assert.ok(expandFoodQueries("daal").includes("dal"));
});

test("expansion terms carry the right sourceWord (synonyms only, never the full query)", () => {
  const aam = expandFoodQueryTerms("aam").find((t) => t.term === "mango");
  assert.equal(aam?.sourceWord, "aam"); // true synonym: attach "aam" to mango rows

  // Token splits must reference THEMSELVES — attaching the full query "beef
  // kebab" to rows found via "beef" made a plain steak match as a kebab.
  const terms = expandFoodQueryTerms("beef kebab");
  const beef = terms.find((t) => t.term === "beef");
  assert.equal(beef?.sourceWord, "beef");
  assert.ok(terms.every((t) => t.term === "beef kebab" || t.sourceWord !== "beef kebab"));
});

// --- Phase 7B: base food beats compound/derived food for a bare query --------

const BANANA = { name: "Banana", aliases: [], source: "curated", score: 0 };
const BANANA_SHAKE = { name: "Banana shake", aliases: ["milkshake", "banana milkshake"], source: "curated", score: 0 };
const CHANA = { name: "Chana / cholay", aliases: ["chana", "chickpea", "chickpeas", "chole", "cholay"], source: "curated", score: 0 };
const CHANA_CHAAT = { name: "Chana chaat", aliases: ["cholay chaat", "chickpea chaat", "chana chat"], source: "curated", score: 0 };
const OATMEAL = { name: "Oatmeal", aliases: ["oats", "oatmeal", "porridge", "dalia"], source: "curated", score: 0 };
const COTTAGE = { name: "Cottage cheese", aliases: ["farmers cheese"], source: "curated", score: 0 };
const PANEER = { name: "Paneer", aliases: ["panir"], source: "curated", score: 0 };
const FISH_CURRY = { name: "Fish curry", aliases: ["machli", "machli curry"], source: "curated", score: 0 };
const WHITE_FISH = { name: "White fish (cod/tilapia)", aliases: ["cod", "tilapia", "white fish"], source: "curated", score: 0 };
const EGGS2 = { name: "2 eggs (boiled/fried)", aliases: ["anda", "anday", "andey", "eggs"], source: "curated", score: 0 };
const BOILED_EGG = { name: "1 boiled egg", aliases: ["boiled egg", "boiled eggs", "ubla anda"], source: "curated", score: 0 };
const EGG_WHITE = { name: "Egg white", aliases: ["egg whites", "anda ki safedi", "andey ki safedi"], source: "curated", score: 0 };
const SCRAMBLED = { name: "Scrambled eggs", aliases: ["scrambled eggs"], source: "curated", score: 0 };

test("bare 'banana' ranks the plain fruit above Banana shake", () => {
  assert.equal(rankFoodsForSearch("banana", [BANANA_SHAKE, BANANA])[0].name, "Banana");
});

test("'banana shake' still ranks the shake first", () => {
  assert.equal(rankFoodsForSearch("banana shake", [BANANA, BANANA_SHAKE])[0].name, "Banana shake");
});

test("bare 'chana' ranks plain Chana above Chana chaat", () => {
  assert.equal(rankFoodsForSearch("chana", [CHANA_CHAAT, CHANA])[0].name, "Chana / cholay");
});

test("'chana chaat' still ranks Chana chaat first", () => {
  assert.equal(rankFoodsForSearch("chana chaat", [CHANA, CHANA_CHAAT])[0].name, "Chana chaat");
});

test("'oats' matches Oatmeal via the new alias", () => {
  assert.equal(rankFoodsForSearch("oats", [BANANA, OATMEAL])[0].name, "Oatmeal");
});

test("'cottage cheese' finds cottage cheese, not paneer", () => {
  assert.equal(rankFoodsForSearch("cottage cheese", [PANEER, COTTAGE])[0].name, "Cottage cheese");
});

test("'fish curry' still finds Fish curry (compound term is in the query)", () => {
  assert.equal(rankFoodsForSearch("fish curry", [WHITE_FISH, FISH_CURRY])[0].name, "Fish curry");
});

test("'white fish' still finds white fish", () => {
  assert.equal(rankFoodsForSearch("white fish", [FISH_CURRY, WHITE_FISH])[0].name, "White fish (cod/tilapia)");
});

test("bare 'fish' prefers plain white fish over a fried/curry compound", () => {
  assert.equal(rankFoodsForSearch("fish", [FISH_CURRY, WHITE_FISH])[0].name, "White fish (cod/tilapia)");
});

test("bare egg terms prefer whole eggs over egg whites or prepared egg dishes", () => {
  const pool = [EGG_WHITE, SCRAMBLED, EGGS2, BOILED_EGG];
  assert.equal(rankFoodsForSearch("egg", pool)[0].name, "1 boiled egg");
  assert.equal(rankFoodsForSearch("anda", pool)[0].name, "1 boiled egg");
  assert.equal(rankFoodsForSearch("anday", pool)[0].name, "2 eggs (boiled/fried)");
  assert.equal(rankFoodsForSearch("2 anday", pool)[0].name, "2 eggs (boiled/fried)");
});

test("specific egg white queries still find Egg white", () => {
  assert.equal(rankFoodsForSearch("egg white", [BOILED_EGG, EGG_WHITE])[0].name, "Egg white");
  assert.equal(rankFoodsForSearch("anda ki safedi", [BOILED_EGG, EGG_WHITE])[0].name, "Egg white");
});

test("compound penalty does not fire on multi-word queries (grounding score bands intact)", () => {
  // A 2-word query never triggers the single-token compound penalty, so the
  // crafted weak/medium/strong grounding fixtures keep their exact bands.
  const before = foodSearchScore("zorba blarg", { name: "Zorba blarg shake", aliases: [], source: "usda_sr", score: 0 });
  const baseline = foodSearchScore("zorba blarg", { name: "Zorba blarg stew", aliases: [], source: "usda_sr", score: 0 });
  assert.equal(before, baseline); // "shake" did NOT subtract for a 2-word query
});
