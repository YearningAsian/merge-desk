// Money helpers for the Merge Desk demo scenarios.

export function toCents(dollars) {
  return Math.round((dollars + Number.EPSILON) * 100);
}
