// Server-only configuration contract. Values are read here and never logged,
// returned or sent to the browser or a sandbox; health reports booleans only.

type Env = Record<string, string | undefined>;

// The demo's repository: the recordings, the demo desk and the scripts use it.
export const DEMO_OWNER = "YearningAsian";
export const DEMO_REPO = `${DEMO_OWNER}/merge-desk`;

// Live mode is open to any GitHub account. What a request may touch is
// decided per repository by the signer's own GitHub permission
// (server/github/access.ts). ALLOWED_LOGINS and ALLOWED_REPOS, when set, are
// an emergency narrowing: only the listed names get through.
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;

export function isRepoName(value: string): boolean {
  return REPO_NAME.test(value) && !/\/\.{1,2}$/.test(value);
}

const MIN_SESSION_SECRET_LENGTH = 32;

function listFrom(value: string | undefined): string[] | null {
  if (!value || !value.trim()) return null;
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowed(value: string, fromEnv: string | undefined) {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return false;
  const narrowed = listFrom(fromEnv);
  return narrowed === null || narrowed.includes(candidate);
}

export function isAllowedLogin(login: string, env: Env = process.env): boolean {
  return isAllowed(login, env.ALLOWED_LOGINS);
}

export function isAllowedRepo(fullName: string, env: Env = process.env): boolean {
  return isRepoName(fullName) && isAllowed(fullName, env.ALLOWED_REPOS);
}

const present = (env: Env, name: string) => Boolean(env[name]?.trim());

// The trusted dependency snapshot built by `npm run snapshot` (optional).
export function depsSnapshotId(env: Env = process.env): string | null {
  const id = env.DEPS_SNAPSHOT_ID?.trim();
  return id && /^snap_[A-Za-z0-9]{1,64}$/.test(id) ? id : null;
}

export function integrationStatus(env: Env = process.env) {
  return {
    github: [
      "GITHUB_APP_ID",
      "GITHUB_APP_CLIENT_ID",
      "GITHUB_APP_CLIENT_SECRET",
      "GITHUB_APP_PRIVATE_KEY",
    ].every((name) => present(env, name)),
    gemini: present(env, "GEMINI_API_KEY"),
    sandbox: present(env, "VERCEL_OIDC_TOKEN"),
    session: (env.SESSION_SECRET?.trim().length ?? 0) >= MIN_SESSION_SECRET_LENGTH,
    snapshot: depsSnapshotId(env) !== null,
  };
}

export function requireEnv(name: string, env: Env = process.env): string {
  const value = env[name];
  if (!value || !value.trim()) throw new Error(`Missing configuration: ${name}`);
  return value;
}
