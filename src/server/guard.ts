// Server-side guards. Slice 1: which real test suite a merge runs. Land
// guards (allowlists, branch scope, workflow files, moved revisions) join
// this module in slice 5.

export type TestSuite =
  | { id: "playground"; cwd: "playground"; command: ["node", "--test"]; label: string }
  | { id: "app"; cwd: "."; command: ["npm", "run", "test:core"]; label: string }
  | { id: "none"; label: string };

const isUnderPlayground = (path: string) =>
  path.startsWith("playground/") &&
  !path.split("/").some((segment) => segment === ".." || segment === ".");

export function chooseTestSuite(changedFiles: string[]): TestSuite {
  if (!changedFiles.length) return { id: "none", label: "no changed files" };
  if (changedFiles.every(isUnderPlayground)) {
    return {
      id: "playground",
      cwd: "playground",
      command: ["node", "--test"],
      label: "node --test (playground)",
    };
  }
  return { id: "app", cwd: ".", command: ["npm", "run", "test:core"], label: "npm run test:core" };
}
