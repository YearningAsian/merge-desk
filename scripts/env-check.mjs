#!/usr/bin/env node
// Presence check for Merge Desk configuration. Prints a fixed list of variable
// names with "set" or "missing" and nothing else: never a value, a length, a
// prefix, or any key the file itself contains (multi-line values such as a PEM
// can look like extra keys to a line-based reader).
//
// Usage: node scripts/env-check.mjs [--file .env.local]
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const REQUIRED = [
  "GITHUB_APP_ID",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
  "GEMINI_API_KEY",
  "SESSION_SECRET",
  "ALLOWED_LOGINS",
  "ALLOWED_REPOS",
  "RUNNER",
  "DAILY_LIVE_RUN_CAP",
];
const OPTIONAL = ["GEMINI_MODEL", "VERCEL_OIDC_TOKEN", "DEPS_SNAPSHOT_ID"];

const flag = process.argv.indexOf("--file");
const file = flag > -1 ? process.argv[flag + 1] : ".env.local";

let parsed;
try {
  parsed = parseEnv(readFileSync(file, "utf8"));
} catch {
  // The error could quote file content, so it is never printed.
  console.log(`${file}: not readable`);
  process.exit(2);
}

const isSet = (name) => typeof parsed[name] === "string" && parsed[name].trim().length > 0;
const pemShape = (value) =>
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) &&
  /-----END [A-Z ]*PRIVATE KEY-----/.test(value);

console.log(file);
let missing = 0;
for (const name of REQUIRED) {
  let status = isSet(name) ? "set" : "missing";
  if (status === "set" && name === "GITHUB_APP_PRIVATE_KEY" && !pemShape(parsed[name])) {
    status = "set, but not a complete PEM (check the quotes around the multi-line value)";
  }
  if (status !== "set") missing += 1;
  console.log(`  ${name}: ${status}`);
}
for (const name of OPTIONAL) {
  console.log(`  ${name} (optional): ${isSet(name) ? "set" : "missing"}`);
}
process.exit(missing ? 1 : 0);
