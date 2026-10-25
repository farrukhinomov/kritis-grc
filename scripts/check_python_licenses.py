"""Fails when a shipped Python dependency has a license outside the policy.

Run inside a project with its environment synced, e.g. from backend/:
    uv run python ../scripts/check_python_licenses.py

Only runtime dependencies are checked (from `uv export --no-dev`): test and lint tools
never ship. Licenses come from package metadata: the SPDX `License-Expression` when
present, otherwise the trove classifiers, otherwise the free-text `License` field.
"""

import json
import re
import shutil
import subprocess
import sys
from collections.abc import Set
from importlib import metadata
from pathlib import Path

POLICY_FILE = Path(__file__).resolve().parents[1] / ".github" / "license-policy.json"

# Trove classifiers predate SPDX; map the ones our ecosystem actually uses.
CLASSIFIER_TO_SPDX = {
    "License :: OSI Approved :: MIT License": "MIT",
    "License :: OSI Approved :: BSD License": "BSD-3-Clause",
    "License :: OSI Approved :: Apache Software License": "Apache-2.0",
    "License :: OSI Approved :: ISC License (ISCL)": "ISC",
    "License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
    "License :: OSI Approved :: GNU Lesser General Public License v3 (LGPLv3)": "LGPL-3.0-only",
    "License :: OSI Approved :: Python Software Foundation License": "PSF-2.0",
    "License :: Public Domain": "Unlicense",
}
# Free-text license fields that unambiguously name an SPDX license.
TEXT_TO_SPDX = {
    "mit": "MIT",
    "mit license": "MIT",
    "bsd": "BSD-3-Clause",
    "bsd license": "BSD-3-Clause",
    "apache 2.0": "Apache-2.0",
    "apache-2.0": "Apache-2.0",
    "apache license 2.0": "Apache-2.0",
    "bsd 3-clause": "BSD-3-Clause",
}
KNOWN_SPDX = {spdx.lower(): spdx for spdx in [*CLASSIFIER_TO_SPDX.values(), *TEXT_TO_SPDX.values()]}


EXPORT_FLAGS = ("--no-dev", "--no-hashes", "--no-emit-project")


def runtime_packages() -> list[str]:
    uv = shutil.which("uv")
    if uv is None:
        raise SystemExit("uv is required to list the runtime dependencies")
    exported = subprocess.run(  # noqa: S603 - fixed arguments, resolved executable
        [uv, "export", "--format", "requirements.txt", *EXPORT_FLAGS],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    names = []
    for line in exported.splitlines():
        line = line.strip()
        if line and not line.startswith(("#", "-")):
            names.append(re.split(r"[=<>~!;\[ ]", line, maxsplit=1)[0])
    return names


def installed(packages: list[str]) -> list[str]:
    """Keeps the packages present in this environment.

    The export also lists dependencies for other platforms (e.g. tzdata on Windows only);
    they aren't installed here and don't ship in this platform's image.
    """
    present = []
    for package in packages:
        try:
            metadata.distribution(package)
        except metadata.PackageNotFoundError:
            continue
        present.append(package)
    return present


def licenses_of(package: str) -> set[str]:
    meta = metadata.metadata(package)
    if expression := meta.get("License-Expression"):
        # "A OR B" lets us pick either; "A AND B" means both apply.
        if " OR " in expression:
            return {expression}
        return {part.strip("() ") for part in expression.split(" AND ")}
    from_classifiers = {
        CLASSIFIER_TO_SPDX[c] for c in meta.get_all("Classifier") or [] if c in CLASSIFIER_TO_SPDX
    }
    if from_classifiers:
        return from_classifiers
    text = (meta.get("License") or "").strip().lower()
    # Free text such as "BSD 3-Clause or Apache-2.0" becomes "BSD-3-Clause OR Apache-2.0".
    options = [_spdx_from_text(option.strip()) for option in text.split(" or ")]
    return {" OR ".join(options)}


def _spdx_from_text(text: str) -> str:
    return TEXT_TO_SPDX.get(text) or KNOWN_SPDX.get(text) or f"UNKNOWN({text[:40]})"


def is_allowed(license_id: str, allowed: Set[str]) -> bool:
    if " OR " in license_id:
        return any(is_allowed(option.strip("() "), allowed) for option in license_id.split(" OR "))
    return license_id in allowed


def main() -> int:
    policy = json.loads(POLICY_FILE.read_text(encoding="utf-8"))
    allowed = set(policy["allowed"]) | set(policy["conditional"])
    exempt = set(policy["packages"])
    violations = []
    for package in sorted(set(installed(runtime_packages())) - exempt):
        for license_id in licenses_of(package):
            if not is_allowed(license_id, allowed):
                violations.append(f"{package}: {license_id}")
    if violations:
        sys.stderr.write("Licenses outside the policy:\n  " + "\n  ".join(violations) + "\n")
        return 1
    sys.stdout.write("All runtime dependency licenses are within the policy.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
