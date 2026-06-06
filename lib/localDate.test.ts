import { test } from "node:test";
import assert from "node:assert/strict";
import { localDateString } from "./localDate.ts";

// Dates built from LOCAL components (new Date(y, mIdx, d, ...)) are tz-independent
// for these assertions, so the test is deterministic on any runner.

test("formats as YYYY-MM-DD from the local calendar day", () => {
  assert.equal(localDateString(new Date(2026, 5, 7, 13, 30)), "2026-06-07"); // month idx 5 = June
  assert.equal(localDateString(new Date(2026, 0, 3, 9, 0)), "2026-01-03"); // zero-padded
});

test("flips at LOCAL midnight — a 12:01 AM log belongs to the new day", () => {
  // The crux of the bug fix: a log just after midnight must get the NEW day,
  // not the day the page rendered on.
  assert.equal(localDateString(new Date(2026, 5, 6, 23, 59)), "2026-06-06");
  assert.equal(localDateString(new Date(2026, 5, 7, 0, 1)), "2026-06-07");
});
