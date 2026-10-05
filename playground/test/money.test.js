import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents } from "../src/money.js";

test("toCents converts whole dollars", () => {
  assert.equal(toCents(5), 500);
});
