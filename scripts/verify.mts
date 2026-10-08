import { spawnSync } from "node:child_process";

const STEPS = [
  "format:check",
  "lint",
  "typecheck",
  "test",
  "recordings:check",
  "test:playground",
  "build",
];

for (const step of STEPS) {
  console.log(`\n> npm run ${step}`);
  const { status } = spawnSync("npm", ["run", step], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (status !== 0) {
    console.error(`verify: ${step} failed`);
    process.exit(status ?? 1);
  }
}
console.log("\nverify: every step passed");
