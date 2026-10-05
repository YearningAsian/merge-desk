import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Live checks against the real services (Gemini, Vercel Sandbox, GitHub).
// They spend a little quota, so they never run in `npm test` or CI.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.live.test.ts"],
    environment: "node",
    testTimeout: 180_000,
    fileParallelism: false,
    silent: false, // the timings printed here are the point
  },
});
