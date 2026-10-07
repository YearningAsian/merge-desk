import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { SESSION_COOKIE, sealSession } from "@/server/session";
import { E2E_SESSION_SECRET } from "../../playwright.config";
import type { PullList } from "@/core/pulls";

// The desk on desktop and phone, with live API answers replayed from real
// recorded data. Screenshots go to test-results/e2e/screens for review.

const FIXTURES = join(process.cwd(), "tests", "e2e", "fixtures");
const prs = JSON.parse(readFileSync(join(FIXTURES, "prs.json"), "utf8")) as PullList;
const stream = (scenario: string) =>
  readFileSync(join(FIXTURES, `analyze-${scenario}.ndjson`), "utf8");
// The recorded analyses carry no signature; the replayed one gets a stand-in
// token so the desk lets it run (the run route is replayed too).
const withToken = (ndjson: string) =>
  ndjson
    .trim()
    .split("\n")
    .map((line) => {
      const event = JSON.parse(line) as { type?: string; ok?: boolean };
      return JSON.stringify(
        (event.type === "analysis" && event.ok) || event.type === "result"
          ? { ...event, token: "e2e" }
          : event,
      );
    })
    .join("\n") + "\n";
const scenarioOf = (pull: { head: { ref: string } }) => pull.head.ref.split("/")[1]!;
const byPr: Record<number, string> = Object.fromEntries(
  prs.pulls.map((pull) => [pull.number, withToken(stream(scenarioOf(pull)))]),
);
const runs: Record<number, string> = Object.fromEntries(
  prs.pulls.map((pull) => [
    pull.number,
    withToken(readFileSync(join(FIXTURES, `run-${scenarioOf(pull)}.ndjson`), "utf8")),
  ]),
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
  await page.route("**/api/live/record**", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { entries: [], note: null } })
      : route.fulfill({ json: { entries: [], note: null } }),
  );
  const requests: RunBody[] = [];
  await page.route("**/api/live/run", (route) => {
    const body = route.request().postDataJSON() as RunBody;
    requests.push(body);
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: runs[body.pr]!,
    });
  });
  return requests;
}

type RunBody = { pr: number; token: string; option: string; steer?: string };

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

// The bar must sit at the bottom of the screen, whatever the sheet's scroll.
async function inThumbReach(page: Page, bar: ReturnType<Page["getByRole"]>) {
  const box = (await bar.boundingBox())!;
  const height = page.viewportSize()!.height;
  expect(box.y + box.height).toBeGreaterThan(height - 2);
  expect(box.y).toBeGreaterThan(height * 0.7);
}

test("phone: the primary action is pinned at the bottom of the sheet, run to land", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.route("**/api/live/land", (route) =>
    route.fulfill({
      json: {
        outcome: "LANDED",
        commit: "e".repeat(40),
        branch: "demo/clean/rename",
        mergeable: "mergeable",
        record: { ok: true },
      },
    }),
  );

  // Held: Run sits in the bar before the run, "Try ..." after the hold.
  await page.goto(`/live?pr=${HELD}`);
  const sheet = page.getByRole("dialog");
  const bar = sheet.getByRole("group", { name: "Actions" });
  const run = bar.getByRole("button", { name: "Run checks" });
  await expect(run).toBeVisible();
  await inThumbReach(page, bar);
  expect((await run.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await run.click();
  await expect(sheet.getByRole("group", { name: "Result: HELD" })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^Try / })).toBeVisible();
  await inThumbReach(page, bar);
  await shot(page, "sheet-held-bar-390");

  // Clean: VERIFIED puts Land, with its "does not merge" line, in the bar.
  await page.goto(`/live?pr=${CLEAN}`);
  await bar.getByRole("button", { name: "Run checks" }).click();
  await expect(sheet.getByRole("group", { name: "Result: VERIFIED" })).toBeVisible();
  const land = bar.getByRole("button", { name: "Land: push merge commit to demo/clean/rename" });
  await expect(land).toBeVisible();
  await expect(bar.getByText("Does not merge into demo/base.", { exact: false })).toBeVisible();
  await inThumbReach(page, bar);
  await noHorizontalOverflow(page);
  await shot(page, "sheet-verified-bar-390");
  await noSeriousAxe(page);
  await land.click();
  await expect(sheet.getByRole("group", { name: "Land: LANDED" })).toBeVisible();
  // Nothing left to do: the bar gives its space back.
  await expect(bar).toBeHidden();
  await shot(page, "sheet-landed-390");
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

test("settings: Claude on your own key, sealed by the server and never shown again", async ({
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
  const answers: string[] = [];
  page.on("response", async (response) => {
    if (new URL(response.url()).pathname === "/api/live/keys") answers.push(await response.text());
  });
  await page.goto(`/live?pr=${CLEAN}`);
  await expect(page.getByRole("article").getByRole("slider", { name: "Resolution" })).toBeVisible();

  await page.keyboard.press(",");
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("radio", { name: /Claude on your Anthropic key/ }).click();
  const field = settings.getByLabel("Anthropic API key");
  await expect(field).toHaveAttribute("type", "password");
  const key = "sk-ant-e2e-" + "x".repeat(40);
  await field.fill(key);
  await settings.getByRole("button", { name: "Save key" }).click();
  await expect(settings.getByText("Saved and sealed for this sign-in.")).toBeVisible();
  await expect(settings.getByLabel("Anthropic API key")).toHaveCount(0);
  expect(answers.join("")).not.toContain(key);
  const sealed = (await page.context().cookies()).find((c) => c.name === "merge_desk_keys")!;
  expect(sealed.httpOnly).toBe(true);
  expect(sealed.sameSite).toBe("Strict");
  expect(sealed.value).not.toContain(key);
  expect(await page.evaluate(() => document.cookie)).not.toContain("merge_desk_keys");
  await noSeriousAxe(page);
  await shot(page, "settings-own-key-1440");

  await page.keyboard.press("Escape");
  await page
    .getByRole("article")
    .getByRole("button", { name: "Analyze with Claude Opus 5.5" })
    .click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual({ pr: CLEAN, model: "anthropic:claude-opus-5-5" });

  await page.keyboard.press(",");
  await settings.getByRole("button", { name: "Remove key" }).click();
  await expect(settings.getByLabel("Anthropic API key")).toBeVisible();
  expect((await page.context().cookies()).some((c) => c.name === "merge_desk_keys")).toBe(false);
});

test("held: steps tick to HELD with the failed check, then steer and retry or discard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const requests = await signIn(page);
  await page.goto(`/live?pr=${HELD}`);
  const detail = page.getByRole("article");
  await expect(detail.getByRole("button", { name: "Run checks" })).toBeVisible();

  // Cmd/Ctrl+Enter runs the option the slider is on (combine, no drop).
  await page.keyboard.press("Control+Enter");
  const result = detail.getByRole("group", { name: "Result: HELD" });
  await expect(result).toBeVisible();
  expect(requests).toEqual([{ pr: HELD, token: "e2e", option: "combine" }]);
  await expect(result.getByText("Held at tests")).toBeVisible();
  await expect(detail.getByRole("list", { name: "Run steps" })).toContainText("exit 1");
  await expect(page.getByRole("status").filter({ hasText: "is HELD" })).toHaveCount(1);
  await expect(page).toHaveTitle(`HELD #${HELD} | Merge Desk`);
  await expect(page.locator(`[data-pr="${HELD}"]`)).toContainText("HELD");
  await expect(result.getByRole("button", { name: /^Try / })).toBeVisible();
  await noPageScroll(page);
  await shot(page, "run-held-1440");
  await noSeriousAxe(page);

  // Steer and retry sends one line with the same option.
  await result.getByRole("textbox").fill("keep the old positional call working too");
  await result.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual({
    pr: HELD,
    token: "e2e",
    option: "combine",
    steer: "keep the old positional call working too",
  });
  await expect(detail.getByText('"keep the old positional call working too"')).toBeVisible();

  // Discard returns to the run button; nothing else is asked of the server.
  await detail
    .getByRole("group", { name: "Result: HELD" })
    .getByRole("button", { name: "Discard this attempt" })
    .click();
  await expect(detail.getByRole("button", { name: "Run checks" })).toBeVisible();
  expect(requests).toHaveLength(2);
});

test("drop: the confirmation names the lost work, an early release cancels, Ctrl+Enter confirms", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const requests = await signIn(page);
  await page.goto(`/live?pr=${DROP.number}`);
  const detail = page.getByRole("article");
  // The recorded analysis recommends keeping ours, which drops theirs.
  await expect(detail.getByText(/This drops theirs: 1 commit by YearningAsian/)).toBeVisible();
  await expect(detail.getByText(/it will undo this change on/)).toBeVisible();
  const hold = detail.getByRole("button", { name: "Hold to drop theirs and run" });

  // Let go before 800 ms: nothing runs.
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(700);
  expect(requests).toHaveLength(0);
  await shot(page, "drop-confirm-1440");

  // The deliberate keyboard alternative confirms at once.
  await page.locator("body").press("Control+Enter");
  const result = detail.getByRole("group", { name: "Result: VERIFIED" });
  await expect(result).toBeVisible();
  expect(requests).toEqual([{ pr: DROP.number, token: "e2e", option: "keep_ours" }]);
  await expect(result.getByText(/dropped as chosen/)).toBeVisible();
  await noSeriousAxe(page);
});

test("clean: one click runs the recommended option to VERIFIED, with the merge and its patch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const requests = await signIn(page);
  await page.goto(`/live?pr=${CLEAN}`);
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "Run checks" }).click();
  const result = detail.getByRole("group", { name: "Result: VERIFIED" });
  await expect(result).toBeVisible();
  expect(requests).toEqual([{ pr: CLEAN, token: "e2e", option: "combine" }]);
  await expect(page).toHaveTitle(`VERIFIED #${CLEAN} | Merge Desk`);
  await result.getByRole("button", { name: /Show the merge/ }).click();
  await expect(result.getByLabel("The merge, compared with the pull request's head")).toContainText(
    "getUser",
  );
  const download = page.waitForEvent("download");
  await result.getByRole("button", { name: "Download patch" }).click();
  expect((await download).suggestedFilename()).toBe(`merge-desk-pr-${CLEAN}-combine.patch`);
  await shot(page, "run-verified-1440");
  await noSeriousAxe(page);
});

test("land: one click on a verified run, LANDED only when GitHub confirmed, UNKNOWN otherwise", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const landed: unknown[] = [];
  let answer: { status: number; json: Record<string, unknown> } = {
    status: 502,
    json: {
      outcome: "UNKNOWN",
      reason:
        "GitHub didn't confirm the branch update. Check the pull request before trying again.",
    },
  };
  await page.route("**/api/live/land", (route) => {
    landed.push(route.request().postDataJSON());
    return route.fulfill(answer);
  });
  await page.goto(`/live?pr=${CLEAN}`);
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "Run checks" }).click();
  const result = detail.getByRole("group", { name: "Result: VERIFIED" });
  const landButton = result.getByRole("button", {
    name: "Land: push merge commit to demo/clean/rename",
  });
  await expect(landButton).toBeVisible();
  await expect(result.getByText("Does not merge into demo/base.", { exact: false })).toBeVisible();

  // An answer GitHub didn't confirm is UNKNOWN, never LANDED.
  await landButton.click();
  await expect(result.getByRole("group", { name: "Land: UNKNOWN" })).toBeVisible();
  await expect(result.getByRole("group", { name: "Land: LANDED" })).toHaveCount(0);
  expect(landed).toEqual([{ pr: CLEAN, token: expect.any(String) }]);

  // A separate page session starts an independent confirmed-Land fixture.
  // The UNKNOWN attempt is never discarded or retried.
  answer = {
    status: 200,
    json: {
      outcome: "LANDED",
      commit: "e".repeat(40),
      branch: "demo/clean/rename",
      mergeable: "mergeable",
      record: { ok: true },
    },
  };
  await page.reload();
  await detail.getByRole("button", { name: "Run checks" }).click();
  await detail
    .getByRole("button", { name: "Land: push merge commit to demo/clean/rename" })
    .click();
  const done = detail.getByRole("group", { name: "Land: LANDED" });
  await expect(done).toBeVisible();
  await expect(done.getByRole("link", { name: /eeeeeee on demo\/clean\/rename/ })).toHaveAttribute(
    "href",
    `https://github.com/YearningAsian/merge-desk/commit/${"e".repeat(40)}`,
  );
  await expect(done.getByText("Historical Land result", { exact: true })).toBeVisible();
  await expect(done.getByText("Recorded on the pull request.")).toBeVisible();
  await expect(detail.getByText("Nothing has been pushed.")).toHaveCount(0);
  await shot(page, "landed-1440");
  await noSeriousAxe(page);
});

for (const phase of ["in-flight", "UNKNOWN"]) {
  test(`an ${phase} Land cannot be discarded or described as nothing pushed`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    const records: Array<{ action: string }> = [];
    await page.route("**/api/live/record**", (route) => {
      if (route.request().method() === "POST") records.push(route.request().postDataJSON());
      return route.fulfill({ json: { entries: [], note: null } });
    });
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    if (phase === "UNKNOWN") finish();
    let landCalls = 0;
    await page.route("**/api/live/land", async (route) => {
      landCalls += 1;
      await pending;
      return route.fulfill({
        status: 502,
        json: {
          outcome: "UNKNOWN",
          reason:
            "GitHub did not confirm whether the branch moved. Check the pull request before trying again.",
        },
      });
    });
    await page.goto(`/live?pr=${CLEAN}`);
    const detail = page.getByRole("article");
    await detail.getByRole("button", { name: "Run checks" }).click();
    const discard = detail.getByRole("button", { name: "Discard this run" });
    await expect(discard).toBeEnabled();
    await detail
      .getByRole("button", { name: "Land: push merge commit to demo/clean/rename" })
      .click();
    await expect.poll(() => landCalls).toBe(1);
    await expect(discard).toBeDisabled();
    await discard.dispatchEvent("click");
    expect(records.filter((entry) => entry.action === "discarded")).toHaveLength(0);
    await expect(detail.getByText("Nothing has been pushed.", { exact: true })).toHaveCount(0);
    finish();
    const unknown = detail.getByRole("group", { name: "Land: UNKNOWN" });
    await expect(unknown).toBeVisible();
    await expect(discard).toBeDisabled();
    await discard.dispatchEvent("click");
    await expect(unknown).toBeVisible();
    expect(records.filter((entry) => entry.action === "discarded")).toHaveLength(0);
    expect(landCalls).toBe(1);
    await expect(detail.getByRole("button", { name: /Try Land again/ })).toHaveCount(0);
  });
}

test("a definite REFUSED Land supports one new deliberate click without re-running the pipeline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const runs = await signIn(page);
  const attempts: unknown[] = [];
  await page.route("**/api/live/land", (route) => {
    attempts.push(route.request().postDataJSON());
    return attempts.length === 1
      ? route.fulfill({
          status: 503,
          json: {
            outcome: "REFUSED",
            reason: "GitHub did not answer before any branch update. Nothing was pushed.",
          },
        })
      : route.fulfill({
          json: {
            outcome: "LANDED",
            commit: "e".repeat(40),
            branch: "demo/clean/rename",
            mergeable: "checking",
            record: { ok: true },
          },
        });
  });
  await page.goto(`/live?pr=${CLEAN}`);
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "Run checks" }).click();
  await detail
    .getByRole("button", { name: "Land: push merge commit to demo/clean/rename" })
    .click();
  await expect(detail.getByRole("group", { name: "Land: REFUSED" })).toBeVisible();
  expect(attempts).toHaveLength(1);
  const retry = detail.getByRole("button", {
    name: "Try Land again: push merge commit to demo/clean/rename",
  });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(detail.getByRole("group", { name: "Land: LANDED" })).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(runs).toHaveLength(1);
});

test("a verified run can still be discarded before any Land attempt", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const records: Array<{ pr: number; action: string }> = [];
  let landCalls = 0;
  await page.route("**/api/live/land", (route) => {
    landCalls += 1;
    return route.fulfill({
      status: 409,
      json: { outcome: "REFUSED", reason: "Unexpected test Land." },
    });
  });
  await page.route("**/api/live/record**", (route) => {
    if (route.request().method() === "POST") records.push(route.request().postDataJSON());
    return route.fulfill({ json: { entries: [], note: null } });
  });
  await page.goto(`/live?pr=${CLEAN}`);
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "Run checks" }).click();
  const discard = detail.getByRole("button", { name: "Discard this run" });
  await expect(discard).toBeEnabled();
  await discard.click();
  await expect
    .poll(() => records.some((entry) => entry.pr === CLEAN && entry.action === "discarded"))
    .toBe(true);
  await expect(detail.getByRole("button", { name: "Run checks" })).toBeVisible();
  expect(landCalls).toBe(0);
});

test("an ambiguous Land blocks other options on that PR while other PRs remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const runs = await signIn(page);
  const records: Array<{ pr: number; action: string }> = [];
  await page.route("**/api/live/record**", (route) => {
    if (route.request().method() === "POST") records.push(route.request().postDataJSON());
    return route.fulfill({ json: { entries: [], note: null } });
  });
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let landCalls = 0;
  await page.route("**/api/live/land", async (route) => {
    landCalls += 1;
    await pending;
    return route.fulfill({
      status: 502,
      json: { outcome: "UNKNOWN", reason: "The branch update was not confirmed. Check GitHub." },
    });
  });
  await page.goto(`/live?pr=${CLEAN}`);
  const detail = page.getByRole("article");
  const slider = detail.getByRole("slider", { name: "Resolution" });
  // An existing checked alternative must not provide a route around UNKNOWN.
  await expect(slider).toBeVisible();
  await page.keyboard.press("1");
  await page.keyboard.press("Control+Enter");
  await expect(detail.getByRole("group", { name: "Result: VERIFIED" })).toBeVisible();
  await page.keyboard.press("2");
  await detail.getByRole("button", { name: "Run checks" }).click();
  await detail
    .getByRole("button", { name: "Land: push merge commit to demo/clean/rename" })
    .click();
  await expect.poll(() => landCalls).toBe(1);
  await page.keyboard.press("1");
  await expect(detail.getByRole("button", { name: "Discard this run" })).toBeDisabled();
  await expect(detail.getByRole("button", { name: /Land: push merge commit/ })).toHaveCount(0);
  await expect(detail.getByText("Nothing has been pushed.", { exact: true })).toHaveCount(0);
  finish();
  await expect(detail.getByRole("group", { name: "Land: UNKNOWN" })).toBeVisible();
  await page.keyboard.press("1");
  await expect(slider).toHaveAttribute("aria-valuetext", "Keep ours, drop theirs");
  await expect(detail.getByRole("group", { name: "Land: UNKNOWN" })).toBeVisible();
  const discard = detail.getByRole("button", { name: "Discard this run" });
  await expect(discard).toBeDisabled();
  await discard.dispatchEvent("click");
  await expect(detail.getByRole("button", { name: /Land: push merge commit/ })).toHaveCount(0);
  await expect(detail.getByText("Nothing has been pushed.", { exact: true })).toHaveCount(0);
  await page.keyboard.press("3");
  await page.keyboard.press("Control+Enter");
  expect(runs).toHaveLength(2);
  expect(records.filter((entry) => entry.action === "discarded")).toHaveLength(0);
  expect(landCalls).toBe(1);
  // The interlock belongs to #1, so #2 can still run and discard a hold.
  await page.locator(`[data-pr="${HELD}"]`).click();
  await detail.getByRole("button", { name: "Run checks" }).click();
  await expect(detail.getByRole("group", { name: "Result: HELD" })).toBeVisible();
  await detail.getByRole("button", { name: "Discard this attempt" }).click();
  await expect
    .poll(() => records.some((entry) => entry.pr === HELD && entry.action === "discarded"))
    .toBe(true);
});

test("no file conflicts is separate from blocked merge readiness, with current checks and a GitHub action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const clean = prs.pulls.find((pull) => pull.number === CLEAN)!;
  const head = "a".repeat(40);
  const base = "b".repeat(40);
  await page.route("**/api/live/prs", (route) =>
    route.fulfill({
      json: {
        repo: prs.repo,
        pulls: [
          {
            ...clean,
            number: 4,
            title: "Land: guarded merge commit and decision record (slice 5)",
            url: "https://github.com/YearningAsian/merge-desk/pull/4",
            head: { ...clean.head, ref: "feat/land", sha: head },
            base: { ref: "main", sha: base },
            mergeable: "mergeable",
            readiness: {
              state: "blocked",
              githubState: "blocked",
              checkedHead: head,
              reasons: [
                "GitHub reports BLOCKED. Required reviews, checks or branch rules may apply; the exact rule and your merge permission were not verified here.",
              ],
              checks: {
                state: "passing",
                observedAt: "2026-10-05T21:00:00Z",
                items: [
                  {
                    name: "CI / web",
                    state: "passing",
                    url: "https://github.com/YearningAsian/merge-desk/actions/runs/1",
                  },
                ],
              },
            },
          },
        ],
      },
    }),
  );
  await page.goto("/live?pr=4");
  const detail = page.getByRole("article");
  await expect(detail.getByText("File conflicts: None", { exact: true })).toBeVisible();
  await expect(detail.getByText("Merge readiness: BLOCKED", { exact: true })).toBeVisible();
  await expect(detail.getByRole("link", { name: "CI / web" })).toBeVisible();
  await expect(detail.getByRole("link", { name: `Head ${head.slice(0, 7)}` })).toHaveAttribute(
    "href",
    `https://github.com/${prs.repo}/commit/${head}`,
  );
  await expect(detail.getByRole("link", { name: `Base ${base.slice(0, 7)}` })).toHaveAttribute(
    "href",
    `https://github.com/${prs.repo}/commit/${base}`,
  );
  await expect(detail.getByRole("link", { name: "Review and merge on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/YearningAsian/merge-desk/pull/4",
  );
  await expect(
    detail.getByText("Nothing needs resolving. This pull request can merge as it is."),
  ).toHaveCount(0);
  await expect(page.getByText("Every open pull request can merge.", { exact: false })).toHaveCount(
    0,
  );
  await noHorizontalOverflow(page);
  await noSeriousAxe(page);
});

test("Land history survives a changed head or base and never supplies the current conflict notice", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  let current = structuredClone(prs);
  const commit = "e".repeat(40);
  await page.route("**/api/live/prs", (route) => route.fulfill({ json: current }));
  await page.route("**/api/live/land", (route) => {
    current = {
      ...current,
      pulls: current.pulls.map((pull) =>
        pull.number === CLEAN
          ? { ...pull, head: { ...pull.head, sha: commit }, mergeable: "checking" }
          : pull,
      ),
    };
    return route.fulfill({
      json: {
        outcome: "LANDED",
        commit,
        branch: "demo/clean/rename",
        mergeable: "conflicting",
        record: { ok: true },
      },
    });
  });
  await page.goto(`/live?pr=${CLEAN}`);
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "Run checks" }).click();
  await detail
    .getByRole("button", { name: "Land: push merge commit to demo/clean/rename" })
    .click();
  await expect(detail.getByText("Historical Land result", { exact: true })).toBeVisible();
  await expect(detail.getByText("File conflicts: Checking", { exact: true })).toBeVisible();
  await expect(detail.getByText("the base probably moved", { exact: false })).toHaveCount(0);
  current = {
    ...current,
    pulls: current.pulls.map((pull) =>
      pull.number === CLEAN
        ? {
            ...pull,
            head: { ...pull.head, sha: "f".repeat(40) },
            base: { ...pull.base, sha: "c".repeat(40) },
            mergeable: "mergeable",
          }
        : pull,
    ),
  };
  await page.getByRole("button", { name: "Refresh pull requests" }).click();
  await expect(detail.getByRole("group", { name: "Land: LANDED" })).toBeVisible();
  await expect(
    detail.getByText("The current head differs from the Land commit and the checked head.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    detail.getByText("The base differs from the checked base.", { exact: true }),
  ).toBeVisible();
  await expect(detail.getByText("Merge readiness: UNKNOWN", { exact: true })).toBeVisible();
});

test("a hold is recorded on the pull request as it happens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const records: Array<{ pr: number; action: string }> = [];
  await page.route("**/api/live/record**", (route) => {
    if (route.request().method() === "POST") records.push(route.request().postDataJSON());
    return route.fulfill({ json: { entries: [], note: null } });
  });
  await page.goto(`/live?pr=${HELD}`);
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "Run checks" }).click();
  const result = detail.getByRole("group", { name: "Result: HELD" });
  await expect(result.getByText("Recorded on the pull request.")).toBeVisible();
  expect(records).toEqual([{ pr: HELD, token: expect.any(String), action: "held" }]);
  await result.getByRole("button", { name: "Discard this attempt" }).click();
  await expect.poll(() => records.length).toBe(2);
  expect(records[1]).toMatchObject({ pr: HELD, action: "discarded" });
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
