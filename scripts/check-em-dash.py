#!/usr/bin/env python3
"""Fail if judge-facing copy contains an em dash (U+2014 or &mdash;).

    python scripts/check-em-dash.py            # default judge-facing paths
    python scripts/check-em-dash.py docs/x.md  # explicit paths
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = ["README.md", "docs/pitch.md", "docs/submission-draft.md", "docs/stills/GALLERY.md", "src/app", "src/ui"]
SUFFIXES = {".md", ".mdx", ".tsx", ".ts", ".jsx", ".js", ".css", ".html", ".json"}
NEEDLES = ("—", "&mdash;")


def files(targets: list[str]) -> list[Path]:
    out: list[Path] = []
    for t in targets:
        p = (ROOT / t) if not Path(t).is_absolute() else Path(t)
        if p.is_file():
            out.append(p)
        elif p.is_dir():
            out.extend(f for f in sorted(p.rglob("*")) if f.is_file() and f.suffix.lower() in SUFFIXES)
    return out


def main(argv: list[str]) -> int:
    bad: list[str] = []
    for path in files(argv or DEFAULT_TARGETS):
        text = path.read_text(encoding="utf-8", errors="replace")
        for n, line in enumerate(text.splitlines(), 1):
            if any(s in line for s in NEEDLES):
                bad.append(f"  {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}:{n}")
    if bad:
        print("Em dash found (use a comma, colon, or period):")
        print("\n".join(bad))
        return 1
    print("ok: no em dashes in judge-facing paths")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
