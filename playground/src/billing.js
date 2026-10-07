// Billing helpers for the Merge Desk demo scenarios.

export function chargeCustomer({ customerId, amountCents, currency = "usd" }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new RangeError("amountCents must be a positive integer");
  }
  return { customerId, amountCents, currency, status: "charged" };
}

export function chargeMonthly(customer) {
  return chargeCustomer({
    customerId: customer.id,
    amountCents: customer.planCents,
    currency: customer.currency,
  });
}
