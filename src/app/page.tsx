export default function Home() {
  return (
    <main
      id="main"
      tabIndex={-1}
      aria-labelledby="home-title"
      className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16"
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
      <p className="text-[13px] text-muted">
        In development.{" "}
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
