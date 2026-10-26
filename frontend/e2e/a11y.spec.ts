import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { MAIN_SCREENS, settled, signIn } from "./support";

/** WCAG 2.2 A and AA, as far as a machine can check them. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Scanned at rest: content still fading or sliding in has its contrast left unchecked.
test.use({ reducedMotion: "reduce" });

for (const screen of MAIN_SCREENS) {
  test(`${screen.name} has no detectable accessibility violations`, async ({ page }) => {
    await signIn(page);
    await page.goto(screen.path);
    await settled(page, screen.heading, screen.content);

    const { passes, violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    // Rules that passed show the page was really checked, not an empty one.
    expect(passes.length).toBeGreaterThan(10);
    expect(
      violations.map((violation) => ({
        rule: violation.id,
        nodes: violation.nodes.map((node) => node.target.join(" ")),
      })),
    ).toEqual([]);
  });
}
