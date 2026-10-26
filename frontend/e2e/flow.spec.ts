import { expect, test } from "@playwright/test";

import { DRAWER_PATH, go, signIn, TENANT } from "./support";

/** The v1 flow of a GRC Manager, end to end on the mock API, as one story. */
test("a GRC Manager works through the v1 flow", async ({ page, isMobile }) => {
  await signIn(page);

  await test.step("the dashboard sums up compliance, risks and deadlines", async () => {
    await expect(
      page.getByRole("heading", { name: "Compliance je Framework und Anlage" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Restrisiko-Matrix" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fristen" })).toBeVisible();
  });

  await test.step("an Implementation is set to implemented and saved", async () => {
    await go(page, DRAWER_PATH);
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByText("Umgesetzt", { exact: true }).click();
    await expect(drawer.getByText("Gespeichert.")).toBeVisible();
    await drawer.getByRole("button", { name: "Schließen" }).click();
    await expect(drawer).toBeHidden();
  });

  await test.step("a submitted Risk Assessment is approved after confirmation", async () => {
    await go(page, `${TENANT}/approvals`);
    const assessment = page.getByRole("article", { name: /^Risikobewertung Wasserwerk Nord 2026/ });
    if (isMobile) {
      // Phones offer the card's actions in its menu, besides the swipe.
      await assessment.getByRole("button", { name: "Aktionen" }).click();
      await page.getByRole("menuitem", { name: "Freigeben" }).click();
    } else {
      await assessment.getByRole("button", { name: "Freigeben" }).click();
    }
    await page.getByRole("dialog").getByRole("button", { name: "Freigeben" }).click();
    await expect(assessment).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: /freigegeben/ })).toBeVisible();
  });

  await test.step("the deadlines now include the renewal of that assessment", async () => {
    await go(page, `${TENANT}/deadlines`);
    await expect(
      page
        .getByRole("list", { name: "Alle Fristen nach Datum" })
        .getByText("Wasserwerk Nord · Berechnet aus der freigegebenen Risikobewertung"),
    ).toBeVisible();
  });

  await test.step("the Activity Log records both changes", async () => {
    await go(page, `${TENANT}/activity`);
    const log = page.getByRole("list", { name: "Aktivitätsprotokoll" });
    await expect(log.getByText(/Risikobewertung Wasserwerk Nord 2026/).first()).toBeVisible();
    // The entry of this change, not one of the seed's earlier status changes.
    await expect(
      log
        .getByRole("listitem")
        .filter({ hasText: "§ 13 Abs. 3 Nr. 5 · Wasserwerk Nord" })
        .filter({ hasText: "Offen → Umgesetzt" }),
    ).not.toHaveCount(0);
  });

  await test.step("the command palette finds a Requirement by its citation", async () => {
    if (isMobile) {
      await page.getByRole("button", { name: /^Suchen/ }).click();
    } else {
      await page.keyboard.press("Control+k");
    }
    await page.getByRole("combobox", { name: "Suchen" }).fill("§ 13 Abs. 4");
    // Enter opens a hit only once it answers what was typed.
    await expect(
      page
        .getByRole("option", { name: /§ 13 Abs\. 4/ })
        .and(page.locator('[aria-disabled="false"]')),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    // The palette closes, and the cockpit shows the Requirement it found.
    await expect(page.getByRole("combobox", { name: "Suchen" })).toBeHidden();
    await expect(page).toHaveURL(/requirement=req-k-13-4/);
    await expect(page.getByRole("main").getByText("Resilienzplan").first()).toBeVisible();
  });
});

test("an Auditor reads everything and changes nothing", async ({ page }) => {
  await signIn(page, { role: "Auditor" });

  await go(page, DRAWER_PATH);
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  const statuses = drawer.getByRole("radio");
  await expect(statuses.first()).toBeVisible();
  for (const status of await statuses.all()) {
    await expect(status).toBeDisabled();
  }

  await go(page, `${TENANT}/approvals`);
  // The page's own answer first, so an empty count can't come from a page still loading.
  await expect(page.getByText("Als Auditor geben Sie nichts frei.")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Freigeben" })).toHaveCount(0);
});
