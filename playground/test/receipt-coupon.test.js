import { test } from "node:test";
import assert from "node:assert/strict";
import { receipt } from "../src/receipt.js";

test("receipt shows the coupon", () => {
  assert.deepEqual(receipt({ subtotalCents: 1000, coupon: "FALL10", couponCents: 100 }), [
    "Subtotal: 1000 cents",
    "Coupon FALL10: -100 cents",
  ]);
});
