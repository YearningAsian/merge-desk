// Billing helpers for the Merge Desk demo scenarios.

export const MINIMUM_CHARGE_CENTS = 50;

export function chargeCustomer(customerId, amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new RangeError("amountCents must be a positive integer");
  }
  if (amountCents < MINIMUM_CHARGE_CENTS) {
    throw new RangeError(`charges start at ${MINIMUM_CHARGE_CENTS} cents`);
  }
  return { customerId, amountCents, currency: "usd", status: "charged", receipt: `rcpt_${customerId}` };
}

export function chargeMonthly(customer) {
  return chargeCustomer(customer.id, customer.planCents);
}
