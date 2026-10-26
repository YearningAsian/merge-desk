import { beforeEach, describe, expect, it, vi } from "vitest";

const mint = vi.fn();
vi.mock("@/server/github/app", async (original) => ({
  ...(await original<typeof import("@/server/github/app")>()),
  installationOctokit: (...args: unknown[]) => mint(...args),
}));

const { openRepo } = await import("@/server/github/access");

const someone = { login: "someone", id: 7 };
const permissionIs = (permission: string, id = 7) => ({
  repos: {
    getCollaboratorPermissionLevel: vi.fn(async () => ({ data: { permission, user: { id } } })),
  },
});
const failsWith = (status: number) => Object.assign(new Error("GitHub"), { status });

beforeEach(() => mint.mockReset());

describe("openRepo: write permission on an installed repository, asked every time", () => {
  it("opens for admin and write, with metadata added to the token's permissions", async () => {
    for (const permission of ["admin", "write"]) {
      const octokit = permissionIs(permission);
      mint.mockResolvedValueOnce(octokit);
      const access = await openRepo(someone, "someone/repo", { contents: "read" }, {});
      expect(access).toEqual({ ok: true, octokit });
      expect(octokit.repos.getCollaboratorPermissionLevel).toHaveBeenCalledWith({
        owner: "someone",
        repo: "repo",
        username: "someone",
      });
    }
    expect(mint).toHaveBeenCalledWith("someone/repo", { contents: "read", metadata: "read" }, {});
  });

  it("refuses read, triage and none", async () => {
    for (const permission of ["read", "triage", "none"]) {
      mint.mockResolvedValueOnce(permissionIs(permission));
      const access = await openRepo(someone, "owner/repo", {}, {});
      expect(access).toMatchObject({ ok: false, status: 403 });
    }
  });

  it("refuses when the login now names another GitHub account than the one that signed in", async () => {
    mint.mockResolvedValueOnce(permissionIs("admin", 8));
    expect(await openRepo(someone, "someone/repo", {}, {})).toMatchObject({
      ok: false,
      status: 403,
      error: expect.stringMatching(/sign in again/i),
    });
    mint.mockResolvedValueOnce({
      repos: {
        getCollaboratorPermissionLevel: vi.fn(async () => ({ data: { permission: "admin" } })),
      },
    });
    expect(await openRepo(someone, "someone/repo", {}, {})).toMatchObject({ ok: false });
  });

  it("refuses a malformed or narrowed-out repository before asking GitHub", async () => {
    expect(await openRepo(someone, "owner/..", {}, {})).toMatchObject({ ok: false, status: 400 });
    expect(
      await openRepo(someone, "owner/repo", {}, { ALLOWED_REPOS: "other/repo" }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(mint).not.toHaveBeenCalled();
  });

  it("says to install the App when GitHub has no installation, and fails closed otherwise", async () => {
    mint.mockRejectedValueOnce(failsWith(404));
    expect(await openRepo(someone, "owner/repo", {}, {})).toMatchObject({
      ok: false,
      status: 403,
      error: expect.stringContaining("isn't installed"),
    });
    mint.mockRejectedValueOnce(failsWith(500));
    expect(await openRepo(someone, "owner/repo", {}, {})).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("refuses when GitHub doesn't know the login and fails closed when the check errors", async () => {
    const unknown = {
      repos: { getCollaboratorPermissionLevel: vi.fn().mockRejectedValue(failsWith(404)) },
    };
    mint.mockResolvedValueOnce(unknown);
    expect(await openRepo({ login: "ghost", id: 9 }, "owner/repo", {}, {})).toMatchObject({
      ok: false,
      status: 403,
    });
    const down = {
      repos: { getCollaboratorPermissionLevel: vi.fn().mockRejectedValue(failsWith(502)) },
    };
    mint.mockResolvedValueOnce(down);
    expect(await openRepo(someone, "owner/repo", {}, {})).toMatchObject({
      ok: false,
      status: 503,
    });
  });
});
