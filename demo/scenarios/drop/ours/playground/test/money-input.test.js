import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents } from "../src/money.js";

test("toCents parses price strings", () => {
  assert.equal(toCents("$1,234.50"), 123450);
  assert.equal(toCents("19.99"), 1999);
});

test("toCents refuses text that is not an amount", () => {
  assert.throws(() => toCents("soon"), TypeError);
});
