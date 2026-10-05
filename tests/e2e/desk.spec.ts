import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { SESSION_COOKIE, sealSession } from "@/server/session";
import { E2E_SESSION_SECRET } from "../../playwright.config";

// The desk on desktop and phone, with live API answers replayed from real
// recorded data. Screenshots go to test-results/e2e/screens for review.

const FIXTURES = join(process.cwd(), "tests", "e2e", "fixtures");
const prs = JSON.parse(readFileSync(join(FIXTURES, "prs.json"), "utf8")) as {
  pulls: Array<{ number: number; head: { ref: string } }>;
};
const stream = (scenario: string) =>
  readFileSync(join(FIXTURES, `analyze-${scenario}.ndjson`), "utf8");
const byPr: Record<number, string> = Object.fromEntries(
  prs.pulls.map((pull) => [pull.number, stream(pull.head.ref.split("/")[1]!)]),
);
const CLEAN = prs.pulls.find((pull) => pull.head.ref === "demo/clean/rename")!.number;
const HELD = prs.pulls.find((pull) => pull.head.ref === "demo/held/caller")!.number;
const DROP = prs.pulls.find((pull) => pull.head.ref.startsWith("demo/drop/"))!;
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/e2e/screens/${name}.png` });

async function signIn(page: Page) {
  const value = await sealSession("YearningAsian", { env: { SESSION_SECRET: E2E_SESSION_SECRET } });
  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.route("**/api/live/prs", (route) => route.fulfill({ json: prs }));
  await page.route("**/api/live/analyze", (route) => {
    const { pr } = route.request().postDataJSON() as { pr: number };
    return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: byPr[pr]! });
  });
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

// The desk is one screen: only its panels scroll, never the page itself
// (hidden status text must not stretch it).
async function noPageScroll(page: Page) {
  const extra = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(extra).toBeLessThanOrEqual(0);
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

test("signed out, /live shows only the sign-in panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/live");
  await expect(page.getByRole("heading", { name: "Sign in to use live mode" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in with GitHub" })).toHaveAttribute(
    "href",
    "/api/auth/github",
  );
  await expect(page.getByRole("navigation", { name: "Pull requests" })).toHaveCount(0);
  await shot(page, "signed-out-1440");
  await noSeriousAxe(page);
});

test("a refused sign-in says why", async ({ page }) => {
  await page.goto("/live?signin=refused");
  await expect(page.getByRole("alert").filter({ hasText: "can't use live mode" })).toBeVisible();
});

test("desktop: keyboard to a conflicting pull request, its analysis and options", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/live");
  const list = page.getByRole("navigation", { name: "Pull requests" });
  await expect(list.getByRole("button", { name: /\[Demo\]/ })).toHaveCount(3);
  await expect(list.getByText("Needs resolution", { exact: false }).first()).toBeVisible();

  // J moves focus down the list (focus and selection are different), Enter opens.
  await page.locator("body").press("j");
  for (let i = 0; i < prs.pulls.length; i += 1) await page.keyboard.press("j");
  const clean = list.locator(`[data-pr="${CLEAN}"]`);
  await expect(clean).toBeFocused();
  await expect(clean).not.toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Enter");
  await expect(clean).toHaveAttribute("aria-current", "true");

  const detail = page.getByRole("article");
  await expect(detail.getByRole("heading", { level: 2 })).toContainText(
    "Rename fetchUser to getUser",
  );
  const ours = detail.getByRole("region", { name: "Ours" });
  const theirs = detail.getByRole("region", { name: "Theirs" });
  await expect(ours).toBeVisible();
  await expect(theirs).toBeVisible();

  // Opening one side's commits and files leaves the other panel as it was.
  const theirsHeight = (await theirs.boundingBox())!.height;
  await ours.getByRole("button", { expanded: false }).click();
  await expect(ours.getByRole("button", { name: /^Copy commit/ }).first()).toBeVisible();
  expect((await theirs.boundingBox())!.height).toBe(theirsHeight);
  await ours.getByRole("button", { expanded: true }).click();

  // The slider starts on the recommended option; arrows and 1/2/3 move it
  // from anywhere on the desk, without clicking the slider first.
  const slider = detail.getByRole("slider", { name: "Resolution" });
  await expect(slider).toHaveAttribute("aria-valuetext", /, recommended$/);
  await expect(slider).not.toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "Keep theirs, drop ours");
  await expect(detail.getByText("Drops").first()).toBeVisible();
  await page.keyboard.press("1");
  await expect(slider).toHaveAttribute("aria-valuetext", "Keep ours, drop theirs");
  await shot(page, "desk-clean-keep-ours-1440");
  await detail.getByRole("button", { name: "Use recommended" }).click();
  await expect(slider).toHaveAttribute("aria-valuetext", /, recommended$/);
  await noHorizontalOverflow(page);
  await shot(page, "desk-clean-1440");

  // The diff is drawn before it opens: the moment the row says expanded,
  // the code is already there (never an empty box).
  const fileRow = detail.getByRole("button", { name: /playground\/src\/api\.js/ });
  await fileRow.click();
  await expect(fileRow).toHaveAttribute("aria-expanded", "true");
  const oursDiff = detail.getByRole("region", { name: /ours compared with the merge base/ });
  expect(await oursDiff.getByText("getUser").count()).toBeGreaterThan(0);
  await detail.getByRole("button", { name: "Theirs vs base" }).click();
  await expect(
    detail.getByRole("region", { name: /theirs compared with the merge base/ }).getByText("429"),
  ).not.toHaveCount(0);
  await page.waitForTimeout(300);
  await noPageScroll(page);
  await shot(page, "desk-clean-diff-1440");
  await noSeriousAxe(page);
});

test("phone: the list is home and the detail opens as a full-height sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/live");
  const row = page.locator(`[data-pr="${HELD}"]`);
  await row.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { level: 2 })).toContainText("minimum charge");
  await expect(sheet.getByRole("slider", { name: "Resolution" })).toBeVisible();
  await noHorizontalOverflow(page);
  await noPageScroll(page);
  // The sheet's own scroll area must not scroll sideways either.
  const sideways = await sheet
    .locator("[data-sheet-scroll]")
    .evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  await shot(page, "sheet-held-390");
  await noSeriousAxe(page);
  await sheet.getByRole("button", { name: "Back to pull requests" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row).toBeFocused();
  await shot(page, "list-390");
});

test("a ?pr= link opens that pull request; the slider skips an option not offered", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto(`/live?pr=${DROP.number}`);
  const detail = page.getByRole("article");
  await expect(detail.getByRole("heading", { level: 2 })).toContainText("Parse price strings");
  await expect(page.locator(`[data-pr="${DROP.number}"]`)).toHaveAttribute("aria-current", "true");

  // Combine wasn't offered here, so one step right goes straight to theirs.
  const slider = detail.getByRole("slider", { name: "Resolution" });
  await expect(slider).toHaveAttribute("aria-valuetext", "Keep ours, drop theirs, recommended");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "Keep theirs, drop ours");
  await page.keyboard.press("2");
  await expect(slider).toHaveAttribute("aria-valuetext", "Keep theirs, drop ours");

  // The list row shows the choice; opening another updates the address.
  await expect(page.locator(`[data-pr="${DROP.number}"]`)).toContainText("Keep theirs");
  await page.locator(`[data-pr="${CLEAN}"]`).click();
  await expect(page).toHaveURL(new RegExp(`[?&]pr=${CLEAN}(&|$)`));

  // Details: the exact commits and commands built from them only.
  await detail.getByRole("button", { name: "Details" }).click();
  const clean = prs.pulls.find((pull) => pull.number === CLEAN) as unknown as {
    head: { sha: string };
    base: { sha: string };
  };
  await expect(detail.getByText(`git switch --detach ${clean.head.sha}`)).toBeVisible();
  await expect(detail.getByRole("button", { name: "Copy commands" })).toBeVisible();
  await shot(page, "desk-details-1440");
  await noSeriousAxe(page);
});

test("settings pick the model; keys open help and details; a reload reuses the analysis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const bodies: Array<{ pr: number; model?: string }> = [];
  await page.route("**/api/live/analyze", (route) => {
    const body = route.request().postDataJSON() as { pr: number; model?: string };
    bodies.push(body);
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: byPr[body.pr]!,
    });
  });
  await page.goto(`/live?pr=${CLEAN}`);
  const detail = page.getByRole("article");
  const slider = detail.getByRole("slider", { name: "Resolution" });
  await expect(slider).toBeVisible();
  expect(bodies).toEqual([{ pr: CLEAN }]);

  // D shows Details; ? lists the shortcuts; Escape closes the list.
  await page.keyboard.press("d");
  await expect(detail.getByRole("button", { name: "Details" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);

  // A reload brings the finished analysis back without asking Gemini again.
  await page.reload();
  await expect(slider).toBeVisible();
  expect(bodies).toHaveLength(1);

  // Comma opens Settings; the next analysis asks for the chosen model.
  await page.keyboard.press(",");
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await settings.getByRole("radio", { name: /Gemini 3\.8 Flash/ }).click();
  await noSeriousAxe(page);
  await shot(page, "settings-1440");
  await page.keyboard.press("Escape");
  await detail.getByRole("button", { name: "Analyze with Gemini 3.8 Flash" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual({ pr: CLEAN, model: "gemini-3.8-flash" });
});

test("an analysis that fails says why and offers to run it again", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.route("**/api/live/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        [
          { t: 0, step: "prepare", state: "running" },
          { t: 4200, step: "prepare", state: "passed", detail: "1 conflicted file" },
          { t: 4210, step: "analyze", state: "running" },
          {
            t: 34210,
            step: "analyze",
            state: "failed",
            detail: "Gemini did not answer within 30 s",
          },
          { t: 34211, type: "analysis", ok: false, reason: "Gemini did not answer within 30 s." },
        ]
          .map((event) => JSON.stringify(event))
          .join("\n") + "\n",
    }),
  );
  await page.goto("/live");
  await page.locator(`[data-pr="${CLEAN}"]`).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Gemini did not answer within 30 s" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze again" })).toBeVisible();
  await shot(page, "analysis-failed-1440");
});
