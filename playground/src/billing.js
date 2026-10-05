// Billing helpers for the Merge Desk demo scenarios.

export function chargeCustomer(customerId, amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new RangeError("amountCents must be a positive integer");
  }
  return { customerId, amountCents, currency: "usd", status: "charged" };
}

export function chargeMonthly(customer) {
  return chargeCustomer(customer.id, customer.planCents);
}
