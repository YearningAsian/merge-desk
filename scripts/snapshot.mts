// Builds the trusted dependency snapshot the sandbox needs to run the app's
// own unit tests (`npm run test:core`). Run by a person, never by Merge Desk.
//
//   npm run snapshot
//
// It boots a sandbox from main's current head on GitHub (only admins can
// update main), installs exactly that package-lock.json with
// `npm ci --ignore-scripts` into <cwd>/node_modules, outside the checkout,
// and writes a marker with the sha256 of the package.json and
// package-lock.json it installed. A run uses the snapshot only when the
// merge's two files hash to the marker's; anything else is held. Prints the
// snapshot id to set as DEPS_SNAPSHOT_ID (here and in the Vercel project).
// The boot is tagged like every live boot, so it counts toward the day.

import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import { CODE_ALLOWED_REPOS } from "@/server/env";
import { DEPS_FILES, DEPS_MARKER, SANDBOX_IMAGE, SANDBOX_TAGS } from "@/server/runner/sandbox";
import { loadLocalEnv } from "./lib/env.mts";
import { remoteRefs } from "./lib/git.mts";

loadLocalEnv();

const REPO = CODE_ALLOWED_REPOS[0];
const POLICY = "npm ci --ignore-scripts --no-audit --no-fund";
// Covers the judging window; rebuild when main's dependencies change.
const EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;

const revision = remoteRefs("refs/heads/main").get("refs/heads/main");
if (!revision || !/^[0-9a-f]{40}$/.test(revision)) throw new Error("Couldn't read main on GitHub");
console.log(`Building the dependency snapshot from main ${revision.slice(0, 12)}...`);

const started = Date.now();
const sandbox = await Sandbox.create({
  source: { type: "git", url: `https://github.com/${REPO}.git`, revision },
  image: SANDBOX_IMAGE,
  persistent: false,
  timeout: 10 * 60 * 1000,
  resources: { vcpus: 2 },
  tags: SANDBOX_TAGS,
});

async function run(cmd: string, args: string[], cwd: string) {
  let output = "";
  const sink = new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const finished = await sandbox.runCommand({
    cmd,
    args,
    cwd,
    env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp/merge-desk-npm", NODE_OPTIONS: "" },
    stdout: sink,
    stderr: sink,
  });
  // The SDK reports a missing exit code as 0; read the raw one (see sandbox.ts).
  const code = (finished as unknown as { cmd?: { exitCode?: unknown } }).cmd?.exitCode;
  if (code !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${output.slice(-2000)}`);
  return output;
}

let snapshotId: string;
try {
  const home = sandbox.cwd.replace(/\/+$/, "");
  const checkout = `${home}/${REPO.split("/")[1]}`;
  const head = (await run("git", ["rev-parse", "HEAD"], checkout)).trim();
  if (head !== revision) throw new Error(`The sandbox checked out ${head}, not ${revision}`);
  // A full history keeps later fetches of a pull request's commits small.
  if ((await run("git", ["rev-parse", "--is-shallow-repository"], checkout)).trim() === "true")
    await run("git", ["fetch", "--quiet", "--unshallow", "--no-tags", "origin"], checkout);
  await run("cp", ["--", ...DEPS_FILES.map((name) => `${checkout}/${name}`), home], home);
  await run("npm", POLICY.split(" ").slice(1), home);
  await run("rm", ["-rf", "--", "/tmp/merge-desk-npm"], home);
  const hashes = JSON.parse(
    await run(
      "node",
      [
        "-e",
        `const fs=require("node:fs"),c=require("node:crypto");process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(DEPS_FILES)}.map((n)=>[n,c.createHash("sha256").update(fs.readFileSync(n)).digest("hex")]))))`,
      ],
      checkout,
    ),
  ) as Record<string, string>;
  await sandbox.writeFiles([
    {
      path: `${home}/${DEPS_MARKER}`,
      content: JSON.stringify(
        {
          v: 1,
          repo: REPO,
          revision,
          image: SANDBOX_IMAGE,
          policy: POLICY,
          files: hashes,
          builtAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    },
  ]);
  const snapshot = await sandbox.snapshot({ expiration: EXPIRATION_MS });
  snapshotId = snapshot.snapshotId;
} catch (error) {
  await sandbox.stop().catch(() => undefined);
  throw error;
}

console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
console.log(`DEPS_SNAPSHOT_ID=${snapshotId}`);
console.log(
  "Set it in .env.local and in the Vercel project (production), then redeploy. It expires in 30 days.",
);
