import { expect, type Page } from "@playwright/test";

export const TENANT = "/t/muster-stadtwerke";

/** Every run sees the same day, so deadlines in days and "3 hours ago" never drift. */
export const NOW = new Date("2026-10-26T09:30:00+01:00");

/** An Implementation open in its drawer, on the cockpit. */
export const DRAWER_PATH = `${TENANT}/compliance?scope=sc-nord&paragraph=%C2%A7%2013&requirement=req-k-13-3-5&panel=status`;

/** The five main screens of the prototype, by name and path. */
export const MAIN_SCREENS = [
  {
    name: "dashboard",
    path: `${TENANT}/dashboard`,
    heading: "Übersicht",
    content: "Wasserwerk Nord",
  },
  { name: "compliance", path: `${TENANT}/compliance`, heading: "Compliance", content: "§ 13" },
  {
    name: "implementation",
    path: DRAWER_PATH,
    heading: "Compliance",
    content: "Nicht anwendbar",
  },
  { name: "risks", path: `${TENANT}/risks`, heading: "Risiken", content: "Restrisiko" },
  {
    name: "suggestions",
    path: `${TENANT}/suggestions`,
    heading: "Mapping-Vorschläge",
    content: "Annehmen",
  },
] as const;

export type ColorMode = "light" | "dark";

/** Signs in through the demo role picker, on the fixed day and in the given color mode. */
export async function signIn(
  page: Page,
  {
    role = "GRC-Manager",
    mode = "light",
  }: { role?: "GRC-Manager" | "Auditor"; mode?: ColorMode } = {},
) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((preference) => {
    localStorage.setItem("grc.colorMode", preference);
  }, mode);
  await page.goto("/login");
  await page.getByRole("button", { name: `Als ${role} ansehen` }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
}

/**
 * Moves within the app without reloading it. The mock API keeps its data in the page, so a
 * reload would undo what a test changed, such as the Theme. Every move arrives as a link
 * from outside would: the app's own back-navigation within a drill-down isn't exercised.
 */
export async function go(page: Page, path: string) {
  await page.evaluate((target) => {
    window.history.pushState(null, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

/**
 * Waits until a screen has its data, its font and its open drawer, so a screenshot or a
 * scan sees the final state. `content` is something only the loaded screen shows; without
 * it, "no skeleton" could hold before any skeleton was rendered.
 */
export async function settled(page: Page, heading: string, content: string) {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByText(content).first()).toBeVisible();
  await expect(page.locator(".ant-skeleton")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}
