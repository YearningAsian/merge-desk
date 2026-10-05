import { test } from "node:test";
import assert from "node:assert/strict";
import { chargeCustomer, chargeMonthly } from "../src/billing.js";

test("chargeCustomer charges a positive amount", () => {
  assert.equal(chargeCustomer("c1", 1200).status, "charged");
});

test("chargeCustomer refuses a zero amount", () => {
  assert.throws(() => chargeCustomer("c1", 0), RangeError);
});

test("chargeMonthly charges the plan price", () => {
  assert.equal(chargeMonthly({ id: "c1", planCents: 900 }).amountCents, 900);
});
