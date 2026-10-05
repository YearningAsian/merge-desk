import { test } from "node:test";
import assert from "node:assert/strict";
import { chargeCustomer, MINIMUM_CHARGE_CENTS } from "../src/billing.js";

test("chargeCustomer refuses amounts under the minimum", () => {
  assert.throws(() => chargeCustomer("c1", MINIMUM_CHARGE_CENTS - 1), /charges start at/);
});
