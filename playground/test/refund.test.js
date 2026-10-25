import { test } from "node:test";
import assert from "node:assert/strict";
import { refund } from "../src/refund.js";

test("refund returns the refunded amount", () => {
  assert.equal(refund(1000, 250).amountCents, 250);
});

test("refund refuses more than the charge", () => {
  assert.throws(() => refund(1000, 1500), RangeError);
});
