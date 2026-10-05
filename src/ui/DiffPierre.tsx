"use client";

import { MultiFileDiff } from "@pierre/diffs/react";

// The read-only Pierre renderer, loaded only when a diff is opened.
// Stable APIs only: no editor, no unresolved-conflict tooling. GitHub's
// high-contrast light syntax theme on GitHub-style washes keeps every token
// at 4.5:1 or better on its line (checked by axe in the e2e suite).

const THEME_VARS = {
  "--diffs-font-family": 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
  "--diffs-font-size": "12px",
  "--diffs-bg-addition-override": "#e6ffec",
  "--diffs-bg-deletion-override": "#ffebe9",
  "--diffs-bg-addition-emphasis-override": "#c6f3d2",
  "--diffs-bg-deletion-emphasis-override": "#ffd5d1",
} as React.CSSProperties;

export default function DiffPierre({
  name,
  before,
  after,
  split,
}: {
  name: string;
  before: string;
  after: string;
  split: boolean;
}) {
  return (
    <MultiFileDiff
      oldFile={{ name, contents: before, cacheKey: `${name}:before:${before.length}` }}
      newFile={{ name, contents: after, cacheKey: `${name}:after:${after.length}` }}
      disableWorkerPool
      style={THEME_VARS}
      options={{
        theme: "github-light-high-contrast",
        themeType: "light",
        diffStyle: split ? "split" : "unified",
        overflow: "wrap",
        lineDiffType: "word",
        hunkSeparators: "line-info",
        disableFileHeader: true,
      }}
    />
  );
}
