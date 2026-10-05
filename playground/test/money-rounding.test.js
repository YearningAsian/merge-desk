import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents } from "../src/money.js";

test("toCents rounds 19.99 to 1999 cents", () => {
  assert.equal(toCents(19.99), 1999);
});

test("toCents rounds 0.29 to 29 cents", () => {
  assert.equal(toCents(0.29), 29);
});
