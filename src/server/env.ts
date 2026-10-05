// Server-only configuration contract. Values are read here and never logged,
// returned or sent to the browser or a sandbox; health reports booleans only.

type Env = Record<string, string | undefined>;

// Code defaults. The environment may narrow these lists but never widen them,
// so an empty or mistyped variable can't open live mode to anyone else.
export const CODE_ALLOWED_LOGINS = ["YearningAsian"] as const;
export const CODE_ALLOWED_REPOS = ["YearningAsian/merge-desk"] as const;

const MIN_SESSION_SECRET_LENGTH = 32;

function listFrom(value: string | undefined): string[] | null {
  if (!value || !value.trim()) return null;
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowed(value: string, defaults: readonly string[], fromEnv: string | undefined) {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return false;
  const inDefaults = defaults.some((item) => item.toLowerCase() === candidate);
  const narrowed = listFrom(fromEnv);
  return inDefaults && (narrowed === null || narrowed.includes(candidate));
}

export function isAllowedLogin(login: string, env: Env = process.env): boolean {
  return isAllowed(login, CODE_ALLOWED_LOGINS, env.ALLOWED_LOGINS);
}

export function isAllowedRepo(fullName: string, env: Env = process.env): boolean {
  return isAllowed(fullName, CODE_ALLOWED_REPOS, env.ALLOWED_REPOS);
}

const present = (env: Env, name: string) => Boolean(env[name]?.trim());

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
  };
}

export function requireEnv(name: string, env: Env = process.env): string {
  const value = env[name];
  if (!value || !value.trim()) throw new Error(`Missing configuration: ${name}`);
  return value;
}
