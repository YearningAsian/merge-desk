import { diffArrays } from "diff";
import { alignSide } from "./align";
import { isRenameableIdentifier, normalizedLines, splitLines, tokenize, tokensOf } from "./text";

// A side "renamed" an identifier when, inside its changed lines, it
// consistently replaced one name with a new one: at least one changed line
// differs from the base only by that substitution, the new name did not exist
// in the base, and the old name now appears only next to the new one (an
// alias such as `export const fetchUser = getUser`).

export type Rename = { from: string; to: string; evidence: string };

function substitutions(base: string[], side: string[]): Array<[string, string]> {
  const changes = diffArrays(base, side);
  const found: Array<[string, string]> = [];
  for (let i = 0; i < changes.length - 1; i += 1) {
    const a = changes[i]!;
    const b = changes[i + 1]!;
    const pair = a.removed && b.added ? [a, b] : a.added && b.removed ? [b, a] : null;
    if (!pair) continue;
    const [removed, added] = pair;
    if (removed!.count === 1 && added!.count === 1) {
      const from = removed!.value[0]!;
      const to = added!.value[0]!;
      if (isRenameableIdentifier(from) && isRenameableIdentifier(to)) found.push([from, to]);
    }
  }
  return found;
}

export function applyRenames(line: string, renames: Rename[]): string {
  if (!renames.length) return tokenize(line).join(" ");
  const map = new Map(renames.map(({ from, to }) => [from, to]));
  return tokenize(line)
    .map((token) => map.get(token) ?? token)
    .join(" ");
}

export function detectRenames(baseText: string, sideText: string): Rename[] {
  const base = normalizedLines(splitLines(baseText));
  const side = normalizedLines(splitLines(sideText));
  const alignment = alignSide(base, side);

  const candidates = new Map<string, { to: string; pure: string | null }>();
  const rejected = new Set<string>();

  alignment.base.forEach((state, j) => {
    if (state.kind !== "modified") return;
    const subs = substitutions(tokensOf(base[j]!), tokensOf(state.to));
    const pure =
      subs.length > 0 &&
      applyRenames(
        base[j]!,
        subs.map(([from, to]) => ({ from, to, evidence: "" })),
      ) === state.to;
    for (const [from, to] of subs) {
      const known = candidates.get(from);
      if (known && known.to !== to) rejected.add(from);
      else candidates.set(from, { to, pure: known?.pure ?? (pure ? state.to : null) });
    }
  });

  const baseTokens = new Set(base.flatMap(tokensOf));
  const renames: Rename[] = [];
  for (const [from, { to, pure }] of candidates) {
    if (rejected.has(from) || pure === null || from === to || baseTokens.has(to)) continue;
    const consistent = side.every((line) => {
      const tokens = tokensOf(line);
      return !tokens.includes(from) || tokens.includes(to);
    });
    if (consistent) renames.push({ from, to, evidence: pure });
  }
  return renames.sort((a, b) => a.from.localeCompare(b.from));
}
