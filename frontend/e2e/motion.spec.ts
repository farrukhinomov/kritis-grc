import { expect, type Page, test } from "@playwright/test";

import { DRAWER_PATH, go, signIn, TENANT } from "./support";

/**
 * The most animations that move something inside `scope` at the same time, sampled every
 * frame for `milliseconds`. It sees CSS transitions and animations and those the motion
 * library runs through the Web Animations API, not motion driven frame by frame from
 * script. Fades and color changes stay under reduced motion: they move nothing, which is
 * what the setting is about.
 */
const mostMoving = (page: Page, milliseconds: number, scope = "body") =>
  page.evaluate(
    async ([span, selector]) => {
      const MOVING =
        /^(transform|translate|scale|rotate|top|right|bottom|left|inset|width|height|margin)/;
      const count = () =>
        document.getAnimations().filter((animation) => {
          const effect = animation.effect as KeyframeEffect | null;
          const target = effect?.target;
          if (!(target instanceof Element) || !target.closest(selector)) {
            return false;
          }
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
    },
    [milliseconds, scope] as const,
  );

/** Opens the drawer and returns the most animations moving while it comes in. */
async function openDrawer(page: Page) {
  await signIn(page);
  await go(page, `${TENANT}/compliance`);
  await expect(page.getByRole("heading", { level: 1, name: "Compliance" })).toBeVisible();
  await go(page, DRAWER_PATH);
  // Only the drawer: the cockpit's columns move at the same time.
  const most = await mostMoving(page, 600, ".ant-drawer");
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
