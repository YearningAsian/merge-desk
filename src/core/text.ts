// Line and token normalization shared by every check. Lines compare by their
// tokens, so whitespace and formatting differences never count as changes.

const TOKEN = /[A-Za-z_$][\w$]*|\d[\w.]*|\S/g;

export const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const JS_KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "of",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

export function tokenize(line: string): string[] {
  return line.match(TOKEN) ?? [];
}

export function normalizeLine(line: string): string {
  return tokenize(line).join(" ");
}

export function normalizedLines(lines: string[]): string[] {
  return lines.map(normalizeLine).filter((line) => line.length > 0);
}

export function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

// A normalized line's tokens (normalized lines join tokens with one space).
export function tokensOf(normalized: string): string[] {
  return normalized ? normalized.split(" ") : [];
}

export function isRenameableIdentifier(token: string): boolean {
  return IDENTIFIER.test(token) && !JS_KEYWORDS.has(token);
}
