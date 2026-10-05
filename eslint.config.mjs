import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // demo code under test and seeded scenario files are not app code
    "playground/**",
    "demo/**",
    "tests/fixtures/**",
    // installed agent skills and local tooling
    ".agents/**",
    "agent/**",
    ".claude/**",
    ".github/skills/**",
  ]),
]);
