// Refunds for the Merge Desk demo scenarios.

export function refund(chargeCents, amount) {
  if (amount > chargeCents) {
    throw new RangeError("a refund can't be more than the charge");
  }
  return { amountCents: amount, status: "refunded" };
}
