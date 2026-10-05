import { defineConfig } from "@playwright/test";

// End-to-end checks against the production build. Live API calls are
// answered from recorded fixtures (tests/e2e/fixtures), so the suite needs
// no keys and spends nothing. The session secret is a test-only value that
// takes precedence over any .env.local the server would otherwise load.
export const E2E_SESSION_SECRET = "e2e-only-session-secret-0123456789abcdef";
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { SESSION_SECRET: E2E_SESSION_SECRET, ALLOWED_LOGINS: "YearningAsian" },
  },
});
