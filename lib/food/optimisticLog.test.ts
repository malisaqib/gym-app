import assert from "node:assert/strict";
import test from "node:test";
import {
  createOptimisticLog,
  failOptimisticLog,
  optimisticLogKey,
  releaseOptimisticLog,
  removeOptimisticLog,
  reserveOptimisticLog,
} from "./optimisticLog.ts";

test("text optimistic keys collapse whitespace and casing", () => {
  const a = createOptimisticLog({ kind: "text", text: "  2 Eggs ", tempId: "a", now: 1 });
  const b = createOptimisticLog({ kind: "text", text: "2   eggs", tempId: "b", now: 2 });

  assert.equal(optimisticLogKey(a), optimisticLogKey(b));
});

test("search optimistic keys use the selected option id", () => {
  const a = createOptimisticLog({ kind: "search", text: "Banana", optionId: "food:1", tempId: "a", now: 1 });
  const b = createOptimisticLog({ kind: "search", text: "Banana", optionId: "food:2", tempId: "b", now: 1 });

  assert.notEqual(optimisticLogKey(a), optimisticLogKey(b));
});

test("reserve/release blocks only the same in-flight optimistic log", () => {
  const active = new Set<string>();
  const key = "text:banana";

  assert.equal(reserveOptimisticLog(active, key), true);
  assert.equal(reserveOptimisticLog(active, key), false);
  assert.equal(reserveOptimisticLog(active, "text:2 eggs"), true);

  releaseOptimisticLog(active, key);
  assert.equal(reserveOptimisticLog(active, key), true);
});

test("failed and removed pending rows update only the target temp row", () => {
  const logs = [
    createOptimisticLog({ kind: "text", text: "2 eggs", tempId: "a", now: 1 }),
    createOptimisticLog({ kind: "text", text: "banana", tempId: "b", now: 2 }),
  ];

  const failed = failOptimisticLog(logs, "a", "Could not log that.");
  assert.equal(failed[0].status, "failed");
  assert.equal(failed[0].error, "Could not log that.");
  assert.equal(failed[1].status, "logging");

  const removed = removeOptimisticLog(failed, "a");
  assert.deepEqual(removed.map((log) => log.tempId), ["b"]);
});
