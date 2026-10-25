// Receipt lines for the Merge Desk demo scenarios.

export function receipt(order) {
  const lines = [`Subtotal: ${order.subtotalCents} cents`];
  if (order.coupon) lines.push(`Coupon ${order.coupon}: -${order.couponCents} cents`);
  if (order.creditCents) lines.push(`Store credit: -${order.creditCents} cents`);
  return lines;
}
