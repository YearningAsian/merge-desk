// Shared by the runners and the Land guards; no I/O.

// A relative path inside the repository, never into .git or out of it.
export function isRepoPath(path: string): boolean {
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  return path
    .split("/")
    .every(
      (segment) =>
        segment !== "" && segment !== "." && segment !== ".." && segment.toLowerCase() !== ".git",
    );
}
