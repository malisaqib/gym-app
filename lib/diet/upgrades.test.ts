import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestUpgrades } from "./upgrades.ts";

test("suggests gentle ideas for chai-with-sugar and paratha", () => {
  const ups = suggestUpgrades("chai with 3 sugar, 2 paratha for breakfast");
  const ids = ups.map((u) => u.id);
  assert.ok(ids.includes("chai-sugar"), "should suggest a chai idea");
  assert.ok(ids.includes("paratha"), "should suggest a paratha idea");
});

test("plain chai WITHOUT sugar gets no chai nudge (guarded)", () => {
  const ups = suggestUpgrades("just a cup of chai");
  assert.ok(!ups.some((u) => u.id === "chai-sugar"), "no nudge without a sugar cue");
});

test("never shames — no 'bad', 'junk', 'unhealthy', or 'stop' language", () => {
  const inputs = [
    "biryani, samosa, jalebi, coke, naan, paratha, chai with sugar",
    "ice cream and cake and fries and pepsi",
  ];
  const banned = /\b(bad|junk|unhealthy|stop eating|cut out|never eat|guilt)\b/i;
  for (const inp of inputs) {
    for (const u of suggestUpgrades(inp, "en", 8)) {
      assert.ok(!banned.test(u.text), `shaming language in: ${u.text}`);
    }
  }
});

test("empty input returns nothing", () => {
  assert.deepEqual(suggestUpgrades(""), []);
  assert.deepEqual(suggestUpgrades("   "), []);
});

test("caps the number of suggestions (never overwhelming)", () => {
  const ups = suggestUpgrades("biryani, samosa, jalebi, coke, naan, paratha", "en", 3);
  assert.ok(ups.length <= 3, `too many: ${ups.length}`);
});

test("roman urdu returns roman-urdu copy", () => {
  const ups = suggestUpgrades("2 paratha", "roman_urdu");
  assert.equal(ups[0].id, "paratha");
  assert.ok(/pasand hai|anda|dahi/.test(ups[0].text), "expected roman-urdu wording");
});
