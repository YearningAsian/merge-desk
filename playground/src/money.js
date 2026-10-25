// Money helpers for the Merge Desk demo scenarios.

export function toCents(amount) {
  const dollars = typeof amount === "string" ? Number(amount.replace(/[$,\s]/g, "")) : amount;
  if (!Number.isFinite(dollars)) {
    throw new TypeError(`Not an amount: ${amount}`);
  }
  return Math.round(dollars * 100);
}
