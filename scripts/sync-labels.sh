#!/usr/bin/env bash
# Creates or updates every label from .github/labels.yml on the current GitHub repository.
# Idempotent: re-running only updates colors and descriptions. Requires an authenticated gh CLI.
set -euo pipefail

labels_file="$(dirname "$0")/../.github/labels.yml"

grep -E '^- \{' "$labels_file" | while IFS= read -r line; do
  name=$(sed -E 's/.*name: "([^"]+)".*/\1/' <<<"$line")
  color=$(sed -E 's/.*color: "([^"]+)".*/\1/' <<<"$line")
  description=$(sed -E 's/.*description: "([^"]+)".*/\1/' <<<"$line")
  gh label create "$name" --color "$color" --description "$description" --force
done
