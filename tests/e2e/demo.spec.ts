import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Recording, SCENARIOS } from "@/core/recording";

// Demo mode, signed out, against the production build: the committed
// recordings play back at their original pace (runs, steering, the decision
// record and real Lands), and the page makes no API request at all (nothing
// to sign, nothing written). Runs take 10 to 13 s.

const recordings = Object.fromEntries(
  SCENARIOS.map((id) => [
    id,
    Recording.parse(
      JSON.parse(readFileSync(join(process.cwd(), "demo", "recordings", `${id}.json`), "utf8")),
    ),
  ]),
) as Record<(typeof SCENARIOS)[number], Recording>;
const pr = (id: (typeof SCENARIOS)[number]) => recordings[id].source.pr;
const PLAYBACK = { timeout: 30_000 };
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/e2e/screens/${name}.png` });

test.describe.configure({ timeout: 90_000 });

// Every request the page makes to the app's API.
function apiCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) calls.push(request.url());
  });
  return calls;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function noSeriousAxe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

test("demo: three recorded pull requests under the demo banner, no sign-in", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = apiCalls(page);
  await page.goto("/demo");
  const banner = page.getByRole("region", { name: "Demo mode" });
  await expect(banner.getByText("Demo: recorded from a real run")).toBeVisible();
  await expect(banner.getByText("writes nothing to GitHub", { exact: false })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Reset" })).toBeVisible();
  const list = page.getByRole("navigation", { name: "Pull requests" });
  await expect(list.getByRole("button", { name: /\[Demo\]/ })).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Live mode" })).toHaveAttribute("href", "/live");
  await shot(page, "demo-list-1440");
  await noSeriousAxe(page);
  expect(calls).toEqual([]);
});

const landOf = (id: (typeof SCENARIOS)[number], option: string) =>
  recordings[id].runs.find((run) => run.option === option && run.land)!.land!;

test("demo: held and recorded, steered with the recorded line, then the next option", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = apiCalls(page);
  await page.goto(`/demo?pr=${pr("held")}`);
  const detail = page.getByRole("article");
  await expect(detail.getByRole("region", { name: "Current GitHub snapshot" })).toBeVisible();
  await detail.getByRole("button", { name: "Run checks" }).click(PLAYBACK);
  const held = detail.getByRole("group", { name: "Result: HELD" });
  await expect(held).toBeVisible(PLAYBACK);
  await expect(held.getByText("Held at tests", { exact: false })).toBeVisible();
  await expect(held.getByText(/failed \(exit 1/).first()).toBeVisible();
  await expect(held.getByText("Recorded on the pull request.")).toBeVisible(PLAYBACK);
  await expect(page).toHaveTitle(`HELD #${pr("held")} | Merge Desk`);
  await shot(page, "demo-held-1440");

  // Steering replays the real steered retry: the choice-honored check
  // catches what Gemini left out.
  const line = recordings.held.runs.find((run) => run.option === "combine" && run.steer)!.steer!;
  const field = held.getByRole("textbox", { name: /Steer and retry/ });
  await expect(field).toHaveValue(line);
  await expect(field).toHaveAttribute("readonly", "");
  await held.getByRole("button", { name: "Retry" }).click();
  await expect(detail.getByText(`Steered: "${line}"`)).toBeVisible();
  await expect(held.getByText(/MISSING/).first()).toBeVisible(PLAYBACK);
  await shot(page, "demo-steered-1440");

  // The suggestion moves the slider; its recorded run plays too.
  await held.getByRole("button", { name: /^Try / }).click();
  await expect(detail.getByRole("button", { name: /Hold to drop|Run checks/ })).toBeVisible();
  await page.locator("body").press("Control+Enter");
  await expect(detail.getByRole("group", { name: /Result: (HELD|VERIFIED)/ })).toBeVisible(
    PLAYBACK,
  );
  await noSeriousAxe(page);
  expect(calls).toEqual([]);
});

test("demo: the clean pull request is VERIFIED and Land replays the real Land", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = apiCalls(page);
  const land = landOf("clean", "combine");
  await page.goto(`/demo?pr=${pr("clean")}`);
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "Run checks" }).click(PLAYBACK);
  const verified = detail.getByRole("group", { name: "Result: VERIFIED" });
  await expect(verified).toBeVisible(PLAYBACK);
  await expect(verified.getByText(/theirs: .*, present/)).toBeVisible();
  await expect(
    verified.getByText("Does not merge into demo/base.", { exact: false }),
  ).toBeVisible();
  await verified.getByRole("button", { name: `Land: push merge commit to ${land.branch}` }).click();
  const done = detail.getByRole("group", { name: "Land: LANDED" });
  await expect(done).toBeVisible(PLAYBACK);
  await expect(
    done.getByRole("link", { name: new RegExp(`${land.commit.slice(0, 7)} on`) }),
  ).toHaveAttribute("href", `https://github.com/YearningAsian/merge-desk/commit/${land.commit}`);
  await expect(done.getByText("Recorded on the pull request.")).toBeVisible();
  await expect(detail.getByText("1 on the pull request")).toBeVisible();
  // The list shows the pull request as GitHub listed it after the Land.
  const list = page.getByRole("navigation", { name: "Pull requests" });
  await expect(list.getByText("Needs resolution", { exact: true })).toHaveCount(2);
  await shot(page, "demo-landed-1440");
  await noSeriousAxe(page);
  expect(calls).toEqual([]);
});

test("demo: a chosen drop is confirmed, VERIFIED as dropped, and lands", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = apiCalls(page);
  const land = landOf("drop", "keep_ours");
  await page.goto(`/demo?pr=${pr("drop")}`);
  const detail = page.getByRole("article");
  await expect(detail.getByRole("slider", { name: "Resolution" })).toBeVisible(PLAYBACK);
  await page.keyboard.press("1"); // Keep ours, drop theirs
  await expect(detail.getByRole("button", { name: "Hold to drop theirs and run" })).toBeVisible();
  await page.locator("body").press("Control+Enter");
  const verified = detail.getByRole("group", { name: "Result: VERIFIED" });
  await expect(verified).toBeVisible(PLAYBACK);
  await expect(verified.getByText(/dropped as chosen/)).toBeVisible();
  await verified.getByRole("button", { name: `Land: push merge commit to ${land.branch}` }).click();
  await expect(detail.getByRole("group", { name: "Land: LANDED" })).toBeVisible(PLAYBACK);
  await expect(detail.getByText("1 on the pull request")).toBeVisible();
  await shot(page, "demo-drop-1440");
  expect(calls).toEqual([]);
});

test("demo: Reset starts every pull request over, even after a Land", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const land = landOf("clean", "combine");
  await page.goto(`/demo?pr=${pr("clean")}`);
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "Run checks" }).click(PLAYBACK);
  await detail
    .getByRole("button", { name: `Land: push merge commit to ${land.branch}` })
    .click(PLAYBACK);
  await expect(detail.getByRole("group", { name: "Land: LANDED" })).toBeVisible(PLAYBACK);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("article")).toHaveCount(0);
  const list = page.getByRole("navigation", { name: "Pull requests" });
  await expect(list.getByText("Needs resolution", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Demo reset.", { exact: false })).toBeAttached();
  await page.goto(`/demo?pr=${pr("clean")}`);
  await expect(
    page.getByRole("article").getByText("Nothing recorded yet.", { exact: false }),
  ).toBeAttached();
  // A cancelled playback never finishes later.
  await page.getByRole("button", { name: "Run checks" }).click(PLAYBACK);
  await page.getByRole("button", { name: "Reset" }).click();
  await page.waitForTimeout(1_000);
  await expect(page).toHaveTitle("Demo | Merge Desk");
});

test("demo on a phone: the sheet plays a held run from its pinned action bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = apiCalls(page);
  await page.goto(`/demo?pr=${pr("held")}`);
  const sheet = page.getByRole("dialog");
  const bar = sheet.getByRole("group", { name: "Actions" });
  await bar.getByRole("button", { name: "Run checks" }).click(PLAYBACK);
  await expect(sheet.getByRole("group", { name: "Result: HELD" })).toBeVisible(PLAYBACK);
  await expect(bar.getByRole("button", { name: /^Try / })).toBeVisible();
  await noHorizontalOverflow(page);
  await shot(page, "demo-held-390");
  await noSeriousAxe(page);
  await sheet.getByRole("button", { name: "Back to pull requests" }).click();
  await expect(page.getByRole("region", { name: "Demo mode" })).toBeVisible();
  await noHorizontalOverflow(page);
  expect(calls).toEqual([]);
});

test("judge guide: every stop opens its recorded pull request in the demo", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/judge");
    await expect(page.getByRole("heading", { name: "Try it without signing in" })).toBeVisible();
    for (const id of ["held", "clean", "drop"] as const) {
      const link = page.getByRole("link", { name: recordings[id].pull.title, exact: true });
      await expect(link).toHaveAttribute("href", `/demo?pr=${pr(id)}`);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAccessibleDescription(/opens? in a new tab/i);
    }
    await expect(page.getByRole("link", { name: "Open the demo" })).toHaveAttribute(
      "target",
      "_blank",
    );
    await expect(page.getByRole("link", { name: "/api/health" })).toBeVisible();
    await noHorizontalOverflow(page);
    await shot(page, `judge-${width}`);
    await noSeriousAxe(page);
  }
});

test("home: says what Merge Desk is, with the demo one click away", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI merges that wait for proof." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try the demo" })).toHaveAttribute("href", "/demo");
  await expect(page.getByRole("link", { name: "Judge's guide" })).toHaveAttribute("href", "/judge");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/live");
  await noHorizontalOverflow(page);
  await noSeriousAxe(page);
});
