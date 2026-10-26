import { expect, type Page, test } from "@playwright/test";

import { type ColorMode, go, MAIN_SCREENS, settled, signIn, TENANT } from "./support";

/** The Theme and color mode pairs the prototype is judged in. */
const LOOKS: { name: string; mode: ColorMode; highContrast: boolean }[] = [
  { name: "saar-green-light", mode: "light", highContrast: false },
  { name: "saar-green-dark", mode: "dark", highContrast: false },
  { name: "high-contrast-light", mode: "light", highContrast: true },
];

/** The Theme belongs to the Tenant, so it is chosen where a GRC Manager would choose it. */
async function chooseHighContrast(page: Page) {
  await go(page, `${TENANT}/settings`);
  await page.locator("label", { hasText: "Hoher Kontrast" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "high-contrast");
}

test.use({ reducedMotion: "reduce" });

for (const look of LOOKS) {
  for (const screen of MAIN_SCREENS) {
    test(`${screen.name} in ${look.name}`, async ({ page }) => {
      await signIn(page, { mode: look.mode });
      if (look.highContrast) {
        await chooseHighContrast(page);
      }
      await go(page, screen.path);
      await settled(page, screen.heading, screen.content);

      await expect(page).toHaveScreenshot(`${screen.name}-${look.name}.png`);
    });
  }
}
