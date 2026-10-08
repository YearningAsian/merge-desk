// Merge gate for pull requests into main (PLAN "Merge gate"). The description
// must carry a verify-this verdict for its claims and the review round's verdict.
//
// Usage: PR_BODY="..." node scripts/check-pr-body.mts

export function checkPrBody(body: string | undefined): string[] {
  const lines = (body ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*>]?\s*/, ""));
  const problems: string[] = [];
  if (!lines.some((line) => /^VERIFIED\b/.test(line)))
    problems.push("no claim starts with VERIFIED (verify-this verdict)");
  if (lines.some((line) => /^(NOT VERIFIED|INCONCLUSIVE)\b/.test(line)))
    problems.push("a claim is NOT VERIFIED or INCONCLUSIVE: fix it or move it to 'Not checked:'");
  if (!lines.some((line) => /^Review:.*\b(Ship|CLEAN ROUND)\b/.test(line)))
    problems.push(
      "no 'Review:' line with Ship or CLEAN ROUND (ponytail-review or adversarial round)",
    );
  return problems;
}

if (import.meta.main) {
  const problems = checkPrBody(process.env.PR_BODY);
  for (const problem of problems) console.error(`merge gate: ${problem}`);
  if (problems.length) process.exit(1);
  console.log("merge gate: verification and review verdicts present");
}
