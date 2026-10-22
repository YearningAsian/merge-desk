"use client";

import { useRouter } from "next/navigation";

// Live mode's repository switch: the repositories GitHub listed at sign-in
// (with the App installed and push access). Switching opens that
// repository's desk; the server checks access again on every request.
export function RepoPicker({ repo, repos }: { repo: string; repos: string[] }) {
  const router = useRouter();
  const options = repos.some((item) => item.toLowerCase() === repo.toLowerCase())
    ? repos
    : [repo, ...repos];
  return (
    <>
      <label htmlFor="repo-picker" className="sr-only">
        Repository
      </label>
      <select
        id="repo-picker"
        value={repo}
        onChange={(event) => router.push(`/live?repo=${encodeURIComponent(event.target.value)}`)}
        className="h-8 min-w-0 flex-1 truncate rounded-[6px] border border-control-border bg-surface px-2 font-mono text-[12px] text-ink sm:max-w-[280px] sm:flex-none"
      >
        {/* Name first, so a narrow bar cuts the owner, not the repository. */}
        {options.map((item) => (
          <option key={item} value={item}>
            {item.split("/")[1]} · {item.split("/")[0]}
          </option>
        ))}
      </select>
    </>
  );
}
