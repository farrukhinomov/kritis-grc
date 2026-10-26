import { expect, type Page, test } from "@playwright/test";

import { DRAWER_PATH, go, signIn, TENANT } from "./support";

/**
 * The most animations that move something at the same time, CSS and script alike, sampled
 * every frame for `milliseconds`. Fades and color changes stay under reduced motion: they
 * don't move anything, which is what the setting is about.
 */
const mostMoving = (page: Page, milliseconds: number) =>
  page.evaluate(async (span) => {
    const MOVING =
      /^(transform|translate|scale|rotate|top|right|bottom|left|inset|width|height|margin)/;
    const count = () =>
      document.getAnimations().filter((animation) => {
        const effect = animation.effect as KeyframeEffect | null;
        const duration = Number(effect?.getComputedTiming().duration ?? 0);
        const properties =
          animation instanceof CSSTransition
            ? [animation.transitionProperty]
            : (effect?.getKeyframes() ?? []).flatMap((frame) => Object.keys(frame));
        return (
          animation.playState === "running" &&
          duration > 20 &&
          properties.some((property) => MOVING.test(property))
        );
      }).length;
    let most = count();
    const until = performance.now() + span;
    while (performance.now() < until) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      most = Math.max(most, count());
    }
    return most;
  }, milliseconds);

/** Opens the drawer and returns the most animations moving while it comes in. */
async function openDrawer(page: Page) {
  await signIn(page);
  await go(page, `${TENANT}/compliance`);
  await expect(page.getByRole("heading", { level: 1, name: "Compliance" })).toBeVisible();
  await go(page, DRAWER_PATH);
  const most = await mostMoving(page, 600);
  await expect(page.getByRole("dialog")).toBeVisible();
  return most;
}

test("the drawer slides in by default", async ({ page }) => {
  expect(await openDrawer(page)).toBeGreaterThan(0);
});

test("nothing moves when the user asks for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  expect(await openDrawer(page)).toBe(0);
  await go(page, `${TENANT}/dashboard`);
  await expect(page.getByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
  expect(await mostMoving(page, 600)).toBe(0);
});
