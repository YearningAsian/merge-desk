import { test } from "node:test";
import assert from "node:assert/strict";
import { refund } from "../src/refund.js";

test("refund refuses a fraction of a cent", () => {
  assert.throws(() => refund(1000, 12.5), /whole cents/);
});
