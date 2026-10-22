// Which branches Merge Desk may ever write to. Scripts (demo reset, seeding)
// stay on demo/*; Land may write any well-formed branch of the allowed
// repository, and its own guards still refuse main, the default branch, the
// base and forks. Both are reviewed code, never an environment variable, so
// configuration can't widen them.

export type BranchScope = "demo-only" | "repository";

export const WRITE_SCOPE: BranchScope = "demo-only";
export const LAND_SCOPE: BranchScope = "repository";

export const DEMO_PREFIX = "demo/";

export type ScopeCheck = { ok: true; branch: string } | { ok: false; reason: string };

const HEADS = "refs/heads/";

// A conservative subset of git's ref-name rules (git check-ref-format).
function isWellFormedBranch(name: string): boolean {
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) return false;
  if (name.startsWith("/") || name.endsWith("/") || name.endsWith(".")) return false;
  if (name.includes("..") || name.includes("//")) return false;
  if (name.endsWith(".lock")) return false;
  return name.split("/").every((segment) => segment.length > 0 && !segment.startsWith("."));
}

export function checkWritableBranch(ref: string, scope: BranchScope = WRITE_SCOPE): ScopeCheck {
  let branch = ref;
  if (ref.startsWith("refs/")) {
    if (!ref.startsWith(HEADS)) return { ok: false, reason: `Not a branch: ${ref}` };
    branch = ref.slice(HEADS.length);
  }
  if (!isWellFormedBranch(branch)) return { ok: false, reason: `Not a valid branch name: ${ref}` };
  if (
    scope === "demo-only" &&
    !(branch.startsWith(DEMO_PREFIX) && branch.length > DEMO_PREFIX.length)
  ) {
    return {
      ok: false,
      reason: `Refused: Merge Desk may write only demo/* branches (got ${branch})`,
    };
  }
  return { ok: true, branch };
}
