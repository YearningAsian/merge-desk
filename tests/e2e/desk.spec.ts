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
      ? route.fulfill({ json: { entries: [] } })
      : route.fulfill({ json: { entries: [] } }),
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

  // Run again, then a confirmed Land.
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
  await detail.getByRole("button", { name: "Discard this run" }).click();
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
  await expect(done.getByText("GitHub says the pull request can merge now.")).toBeVisible();
  await expect(done.getByText("Recorded on the pull request.")).toBeVisible();
  await expect(detail.getByText("Nothing has been pushed.")).toHaveCount(0);
  await shot(page, "landed-1440");
  await noSeriousAxe(page);
});

test("a hold is recorded on the pull request as it happens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const records: Array<{ pr: number; action: string }> = [];
  await page.route("**/api/live/record**", (route) => {
    if (route.request().method() === "POST") records.push(route.request().postDataJSON());
    return route.fulfill({ json: { entries: [] } });
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
