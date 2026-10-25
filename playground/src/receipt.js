// Receipt lines for the Merge Desk demo scenarios.

export function receipt(order) {
  const lines = [`Subtotal: ${order.subtotalCents} cents`];
  return lines;
}
