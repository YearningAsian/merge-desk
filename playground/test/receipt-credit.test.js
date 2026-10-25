import { test } from "node:test";
import assert from "node:assert/strict";
import { receipt } from "../src/receipt.js";

const order = { subtotalCents: 1000, coupon: "FALL10", couponCents: 100, creditCents: 300 };

test("store credit is the last line on the receipt", () => {
  assert.equal(receipt(order).at(-1), "Store credit: -300 cents");
});
