"use client";

import { getFiletypeFromFileName, preloadHighlighter } from "@pierre/diffs";
import { MultiFileDiff } from "@pierre/diffs/react";
import { useLayoutEffect, useMemo, useRef } from "react";

// The read-only Pierre renderer, loaded only when diffs are about to be
// needed. Stable APIs only: no editor, no unresolved-conflict tooling.
// GitHub's high-contrast light syntax theme on GitHub-style washes keeps
// every token at 4.5:1 or better on its line (checked by axe in the e2e
// suite). `onRendered` fires once the diff has been drawn, so the desk can
// reveal it whole instead of showing an empty box first.

const THEME = "github-light-high-contrast" as const;

const THEME_VARS = {
  "--diffs-font-family": 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
  "--diffs-font-size": "12px",
  "--diffs-bg-addition-override": "#e6ffec",
  "--diffs-bg-deletion-override": "#ffebe9",
  "--diffs-bg-addition-emphasis-override": "#c6f3d2",
  "--diffs-bg-deletion-emphasis-override": "#ffd5d1",
} as React.CSSProperties;

// Pierre's "show hidden lines" controls carry no name; give them one, on
// every render (expanding re-renders), so screen readers can use them too.
function nameExpandControls(node: HTMLElement) {
  const root: ParentNode = node.shadowRoot ?? node;
  root.querySelectorAll<HTMLElement>("[data-expand-button]").forEach((control) => {
    if (control.hasAttribute("aria-label")) return;
    const label = control.hasAttribute("data-expand-up")
      ? "Show earlier unchanged lines"
      : control.hasAttribute("data-expand-down")
        ? "Show later unchanged lines"
        : "Show hidden unchanged lines";
    control.setAttribute("aria-label", label);
  });
}

// Loads the highlighter with the theme and these files' languages ahead of
// time, so opening a diff doesn't wait for it.
export async function warm(paths: string[]) {
  const langs = [...new Set(paths.map((path) => getFiletypeFromFileName(path)))];
  await preloadHighlighter({ themes: [THEME], langs });
}

export default function DiffPierre({
  name,
  before,
  after,
  split,
  wrap,
  onRendered,
}: {
  name: string;
  before: string;
  after: string;
  split: boolean;
  wrap: boolean;
  onRendered?: () => void;
}) {
  const rendered = useRef(onRendered);
  useLayoutEffect(() => {
    rendered.current = onRendered;
  });
  const options = useMemo(
    () => ({
      theme: THEME,
      themeType: "light" as const,
      diffStyle: split ? ("split" as const) : ("unified" as const),
      overflow: wrap ? ("wrap" as const) : ("scroll" as const),
      lineDiffType: "word" as const,
      hunkSeparators: "line-info" as const,
      disableFileHeader: true,
      onPostRender: (node: HTMLElement, _diff: unknown, phase: string) => {
        if (phase === "unmount") return;
        nameExpandControls(node);
        if (phase === "mount") rendered.current?.();
      },
    }),
    [split, wrap],
  );
  return (
    <MultiFileDiff
      oldFile={{ name, contents: before, cacheKey: `${name}:before:${before.length}` }}
      newFile={{ name, contents: after, cacheKey: `${name}:after:${after.length}` }}
      disableWorkerPool
      style={THEME_VARS}
      options={options}
    />
  );
}
