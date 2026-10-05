import { chargeCustomer } from "./billing.js";

export const LATE_FEE_CENTS = 1500;

export function chargeLateFee(customerId) {
  return chargeCustomer(customerId, LATE_FEE_CENTS);
}
