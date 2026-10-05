import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./git.mts";

// Loads local configuration the way `next dev` ranks it: values already in
// the environment win, then .env.development.local (Vercel's pulled OIDC
// token), then .env.local (your keys). Nothing is printed.
export function loadLocalEnv() {
  for (const file of [".env.development.local", ".env.local"]) {
    const path = join(ROOT, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
