// Fails when a shipped npm dependency has a license outside the policy.
//
// Run from frontend/:
//   pnpm licenses list --prod --json | node ../scripts/check-node-licenses.mjs
// Only production dependencies are checked: build and test tools never reach the browser.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const policyFile = join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "license-policy.json");
const policy = JSON.parse(readFileSync(policyFile, "utf8"));
const allowed = new Set([...policy.allowed, ...Object.keys(policy.conditional)]);
const exempt = new Set(Object.keys(policy.packages));

// "(MIT OR Apache-2.0)" lets us choose either option; "A AND B" requires both.
function isAllowed(expression) {
  const license = expression.replace(/^\((.*)\)$/, "$1").trim();
  if (license.includes(" OR ")) {
    return license.split(" OR ").some((option) => isAllowed(option));
  }
  if (license.includes(" AND ")) {
    return license.split(" AND ").every((part) => isAllowed(part));
  }
  return allowed.has(license);
}

const byLicense = JSON.parse(readFileSync(0, "utf8"));

const violations = Object.entries(byLicense)
  .filter(([license]) => !isAllowed(license))
  .flatMap(([license, packages]) =>
    packages.filter((pkg) => !exempt.has(pkg.name)).map((pkg) => `${pkg.name}: ${license}`),
  );

if (violations.length > 0) {
  process.stderr.write(`Licenses outside the policy:\n  ${violations.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write("All production dependency licenses are within the policy.\n");
