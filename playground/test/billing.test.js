import { test } from "node:test";
import assert from "node:assert/strict";
import { chargeCustomer, chargeMonthly } from "../src/billing.js";

test("chargeCustomer charges a positive amount", () => {
  assert.equal(chargeCustomer({ customerId: "c1", amountCents: 1200 }).status, "charged");
});

test("chargeCustomer refuses a zero amount", () => {
  assert.throws(() => chargeCustomer({ customerId: "c1", amountCents: 0 }), RangeError);
});

test("chargeCustomer records the currency", () => {
  assert.equal(chargeCustomer({ customerId: "c1", amountCents: 500, currency: "eur" }).currency, "eur");
});

test("chargeMonthly charges the plan price", () => {
  assert.equal(chargeMonthly({ id: "c1", planCents: 900 }).amountCents, 900);
});
