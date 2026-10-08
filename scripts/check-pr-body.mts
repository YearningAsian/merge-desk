// The PR description is untrusted: this runs from the base branch (pull_request_target),
// so a pull request can't change the check that judges it.
export function checkPrBody(body: string | undefined): string[] {
  const lines = (body ?? "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^(?:\s|>|[-*+]|\d+[.)]|\[[ xX]\]|_{2})*/, ""));
  const problems: string[] = [];
  if (!lines.some((line) => /^VERIFIED\b/.test(line)))
    problems.push("no claim starts with VERIFIED (verify-this verdict)");
  if (lines.some((line) => /^(NOT VERIFIED|INCONCLUSIVE)\b/.test(line)))
    problems.push("a claim is NOT VERIFIED or INCONCLUSIVE: fix it or move it to 'Not checked:'");
  const shipping = (line: string) =>
    /^Review:/.test(line) && /\bponytail-review Ship\b/.test(line) && !/\b(not|fix)\b/i.test(line);
  if (!lines.some(shipping))
    problems.push("no shipping 'Review:' line (ponytail-review Ship, nothing NOT or fix)");
  return problems;
}

if (import.meta.main) {
  const problems = checkPrBody(process.env.PR_BODY);
  for (const problem of problems) console.error(`merge gate: ${problem}`);
  if (problems.length) process.exit(1);
  console.log("merge gate: verification and review verdicts present");
}
