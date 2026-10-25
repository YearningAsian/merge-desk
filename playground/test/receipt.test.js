import { test } from "node:test";
import assert from "node:assert/strict";
import { receipt } from "../src/receipt.js";

test("receipt starts with the subtotal", () => {
  assert.equal(receipt({ subtotalCents: 1000 })[0], "Subtotal: 1000 cents");
});
