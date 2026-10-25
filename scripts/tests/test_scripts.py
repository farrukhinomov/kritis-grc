"""Unit tests for the repository scripts. Standard library only, so CI needs no setup:

python -m unittest discover -s scripts/tests
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import check_python_licenses
import sync_ai_instructions
from sync_ai_instructions import Target, render, rewrite_links


class RewriteLinksTest(unittest.TestCase):
    def test_links_from_a_subfolder_climb_back_to_the_root(self) -> None:
        markdown = "See [glossary](GLOSSARY.md) and [ADRs](docs/adr/README.md)."

        result = rewrite_links(markdown, ".github/copilot-instructions.md")

        self.assertEqual(
            result, "See [glossary](../GLOSSARY.md) and [ADRs](../docs/adr/README.md)."
        )

    def test_links_from_the_root_stay_unchanged(self) -> None:
        markdown = "[conventions](docs/conventions.md)"

        self.assertEqual(rewrite_links(markdown, "AGENTS.md"), markdown)

    def test_fragments_survive_and_urls_are_left_alone(self) -> None:
        markdown = "[a](docs/x.md#rules) [b](https://example.com/y.md) [c](#local)"

        result = rewrite_links(markdown, ".cursor/rules/project.mdc")

        self.assertEqual(
            result, "[a](../../docs/x.md#rules) [b](https://example.com/y.md) [c](#local)"
        )


class RenderTest(unittest.TestCase):
    def test_marks_the_file_as_generated_after_any_front_matter(self) -> None:
        target = Target("x/y.mdc", front_matter="---\nalwaysApply: true\n---\n\n")

        result = render("# Rules", target)

        self.assertTrue(result.startswith("---\nalwaysApply: true\n---\n\n<!-- Generated"))
        self.assertTrue(result.endswith("# Rules"))

    def test_the_committed_files_are_in_sync(self) -> None:
        self.assertEqual(sync_ai_instructions.main(["--check"]), 0)


class LicensePolicyTest(unittest.TestCase):
    allowed = frozenset({"MIT", "Apache-2.0"})

    def test_a_single_allowed_license_passes(self) -> None:
        self.assertTrue(check_python_licenses.is_allowed("MIT", self.allowed))

    def test_a_dual_license_passes_when_one_option_is_allowed(self) -> None:
        self.assertTrue(check_python_licenses.is_allowed("GPL-3.0-only OR MIT", self.allowed))

    def test_copyleft_is_rejected(self) -> None:
        self.assertFalse(check_python_licenses.is_allowed("GPL-3.0-only", self.allowed))
        self.assertFalse(check_python_licenses.is_allowed("AGPL-3.0-only", self.allowed))

    def test_unknown_free_text_is_reported_not_guessed(self) -> None:
        self.assertTrue(check_python_licenses._spdx_from_text("gplv3").startswith("UNKNOWN"))


if __name__ == "__main__":
    unittest.main()
