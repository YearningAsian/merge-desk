import { Button } from "@/ui/primitives/button";

// Where the GitHub App is installed decides which repositories live mode can
// open. Signing in doesn't install it.
export const INSTALL_URL = "https://github.com/apps/merge-desk-yearningasian/installations/new";

// Signed in, but GitHub listed no repository with the App installed that
// this account can push to.
export function InstallPrompt() {
  return (
    <main
      id="main"
      tabIndex={-1}
      aria-labelledby="install-title"
      className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 pt-16 pb-16 outline-none md:px-10 md:pt-24"
    >
      <div className="max-w-[520px]">
        <h1 id="install-title" className="text-[26px] leading-tight font-semibold tracking-tight">
          Install Merge Desk on a repository
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          Live mode opens repositories where the Merge Desk GitHub App is installed and you can
          push. Install it, choose the repositories, then sign in again to see them here.
        </p>
        <DataNotice />
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button asChild variant="primary" size="lg">
            <a href={INSTALL_URL}>Install on GitHub</a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="/api/auth/github">I installed it, sign in again</a>
          </Button>
        </div>
      </div>
    </main>
  );
}

// What live mode sends and writes, said before anyone installs or signs in.
export function DataNotice() {
  return (
    <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-muted">
      <li>
        The conflicted files are sent to Google&apos;s Gemini API on its free tier, where Google may
        use what it receives to improve its products, or to the model provider whose key you save in
        Settings. Use repositories you may share that way.
      </li>
      <li>
        Merge Desk writes only on your say: a merge commit on a pull request&apos;s own branch when
        you land, one comment on the pull request recording the decision, and a lock ref under{" "}
        <span className="font-mono">refs/merge-desk/</span> while it updates that comment.
      </li>
      <li>Each account has a small number of live runs a day.</li>
    </ul>
  );
}
