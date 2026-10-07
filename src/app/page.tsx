import Link from "next/link";
import { ArrowRight } from "lucide-react";

const secondary =
  "inline-flex h-11 items-center rounded-desk border border-control-border bg-surface px-4 text-[14px] font-medium text-ink hover:border-ink hover:bg-bg";

export default function Home() {
  return (
    <main
      id="main"
      tabIndex={-1}
      aria-labelledby="home-title"
      className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16 outline-none"
    >
      <p className="font-mono text-xs font-semibold tracking-widest text-muted uppercase">
        Merge Desk
      </p>
      <h1 id="home-title" className="text-4xl font-bold tracking-tight text-balance">
        AI merges that wait for proof.
      </h1>
      <p className="max-w-prose text-base text-muted">
        Gemini proposes a resolution for a pull request&apos;s merge conflict. Nothing lands until
        the result parses, keeps what each side chose to keep, and passes the repository&apos;s real
        tests.
      </p>
      <dl className="grid gap-2 font-mono text-[13px] sm:grid-cols-[auto_1fr] sm:gap-x-6">
        <dt className="text-ours-text">ours</dt>
        <dd>the pull request&apos;s own branch</dd>
        <dt className="text-theirs-text">theirs</dt>
        <dd>what was merged into its base first</dd>
      </dl>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/demo"
          className="inline-flex h-11 items-center gap-2 rounded-desk bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink/90"
        >
          Try the demo <ArrowRight aria-hidden className="size-4" />
        </Link>
        <Link href="/judge" className={secondary}>
          Judge&apos;s guide
        </Link>
        <Link href="/live" className={secondary}>
          Sign in
        </Link>
      </div>
      <p className="text-[13px] text-muted">
        The demo replays real recorded runs, needs no account and writes nothing. Live mode is open
        to the owner&apos;s GitHub account only.{" "}
        <a
          className="underline underline-offset-2 hover:text-ink"
          href="https://github.com/YearningAsian/merge-desk"
        >
          Source on GitHub
        </a>
      </p>
    </main>
  );
}
