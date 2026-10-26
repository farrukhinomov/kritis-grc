import { expect, test } from "@playwright/test";

import { go, NOW, TENANT } from "./support";

/** The user menu: it shows the name on a desktop and only an icon on a phone. */
const USER_MENU = /Alex Kramer|Benutzermenü/;

/**
 * What a recruiter does: type the address, and look. No sign-in, no choice to make, and the
 * product's own light look whatever the computer prefers.
 */
test.describe("the public address of the prototype", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
  });

  test("opens the dashboard of the demo organization without a click", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(new RegExp(`${TENANT}/dashboard$`));
    await expect(page.getByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
    await expect(page.getByText("Wasserwerk Nord").first()).toBeVisible();
    // The prototype says so in its header, in full on a desktop and short on a phone.
    await expect(page.getByText(/^(Prototyp – Demodaten|Demo)$/)).toBeVisible();
  });

  // Holds as long as the login page doesn't send signed-in users onward itself; if it ever
  // does, this is the check that has to be thought through again.
  test("goes back out of the app, not into a redirect loop", async ({ page }) => {
    await page.goto("/login");
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`${TENANT}/dashboard$`));

    await page.goBack();

    await expect(page).toHaveURL(/\/login$/);
  });

  test("keeps an Auditor signed in as an Auditor", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Als Auditor ansehen" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();

    await page.goto("/");

    await expect(page).toHaveURL(new RegExp(`${TENANT}/dashboard$`));
    // Still the Auditor, who approves nothing, not the GRC Manager the entry would sign in.
    await go(page, `${TENANT}/approvals`);
    await expect(page.getByText("Als Auditor geben Sie nichts frei.")).toBeVisible();
  });

  test("still has the system status, at its own address", async ({ page }) => {
    await page.goto("/status");

    await expect(page.getByRole("heading", { level: 1, name: "Systemstatus" })).toBeVisible();
  });
});

test.describe("on a computer that prefers dark", () => {
  // No motion: this is about colors, and a menu still sliding open can be clicked a frame
  // late on a busy machine, one item off.
  test.use({ colorScheme: "dark", reducedMotion: "reduce" });

  test("starts light anyway, until the visitor chooses dark", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();

    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");

    await page.getByRole("button", { name: USER_MENU }).click();
    await page.getByRole("menuitemradio", { name: "Wie System" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
  });
});
