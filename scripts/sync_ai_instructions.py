"""Generates every AI tool's instruction file from CLAUDE.md, the single source of truth.

    python scripts/sync_ai_instructions.py          # rewrite the generated files
    python scripts/sync_ai_instructions.py --check  # exit 1 if any file is out of date

Each tool reads its own file, so the same rules reach Claude Code, GitHub Copilot, Cursor
and AGENTS.md-aware agents. Relative links are rewritten for each file's location, so
they keep pointing at the right documents.
"""

import argparse
import posixpath
import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = "CLAUDE.md"
GENERATED_NOTICE = (
    "<!-- Generated from CLAUDE.md by scripts/sync_ai_instructions.py. Do not edit by hand. -->"
)
# Markdown links whose target is a relative path (not a URL, anchor or absolute path).
RELATIVE_LINK = re.compile(r"\]\((?!https?://|#|/|mailto:)([^)\s]+)\)")


@dataclass(frozen=True)
class Target:
    path: str
    front_matter: str = ""


TARGETS = (
    Target("AGENTS.md"),
    Target(".github/copilot-instructions.md"),
    # Cursor's project rules; `alwaysApply` loads them into every request.
    Target(
        ".cursor/rules/project.mdc",
        front_matter=(
            "---\ndescription: Project rules for this repository\nalwaysApply: true\n---\n\n"
        ),
    ),
)


def rewrite_links(markdown: str, target_path: str) -> str:
    """Re-anchors relative links from the repository root to the target file's folder."""
    target_dir = posixpath.dirname(target_path)

    def relink(match: re.Match[str]) -> str:
        link = match.group(1)
        path, _, fragment = link.partition("#")
        relative = posixpath.relpath(path, target_dir or ".")
        return f"]({relative}{'#' + fragment if fragment else ''})"

    return RELATIVE_LINK.sub(relink, markdown)


def render(source: str, target: Target) -> str:
    body = rewrite_links(source, target.path)
    return f"{target.front_matter}{GENERATED_NOTICE}\n\n{body}"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="only report out-of-date files")
    args = parser.parse_args(argv)

    source = (REPO_ROOT / SOURCE).read_text(encoding="utf-8")
    stale = []
    for target in TARGETS:
        expected = render(source, target)
        file = REPO_ROOT / target.path
        current = file.read_text(encoding="utf-8") if file.exists() else None
        if current == expected:
            continue
        if args.check:
            stale.append(target.path)
        else:
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(expected, encoding="utf-8", newline="\n")

    if stale:
        sys.stderr.write(
            "Out of date with CLAUDE.md: "
            + ", ".join(stale)
            + "\nRun: python scripts/sync_ai_instructions.py\n"
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
