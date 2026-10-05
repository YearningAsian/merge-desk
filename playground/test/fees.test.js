import { test } from "node:test";
import assert from "node:assert/strict";
import { chargeLateFee, LATE_FEE_CENTS } from "../src/fees.js";

test("chargeLateFee charges the late fee with a receipt", () => {
  const charge = chargeLateFee("c1");
  assert.equal(charge.amountCents, LATE_FEE_CENTS);
  assert.equal(charge.receipt, "rcpt_c1");
});
