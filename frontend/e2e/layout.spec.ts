import { expect, test, type Page } from "@playwright/test";

import { go, signIn, TENANT } from "./support";

const left = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().left));

/** Measured layout, not looks: these are the spacing and fit problems a screenshot hides. */
test.describe("layout", () => {
  test.skip(({ isMobile }) => isMobile, "measured on the desktop layout");

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the user menu keeps one left edge for name, headings and icons", async ({ page }) => {
    await page.getByRole("button", { name: /Alex Kramer/ }).click();
    await expect(page.locator(".grc-user-menu-identity")).toBeVisible();

    const identity = await left(page, ".grc-user-menu-identity");
    const icon = await left(page, ".grc-user-menu .ant-dropdown-menu-item svg");

    expect(icon).toBe(identity);
  });

  test("a search result is 44 px high", async ({ page }) => {
    await page.keyboard.press("Control+k");
    const option = page.locator(".grc-palette-option").first();
    await expect(option).toBeVisible();

    // The layout height: the box on screen is scaled while the palette opens.
    const height = await option.evaluate((el) => (el as HTMLElement).offsetHeight);

    expect(height).toBe(44);
  });

  for (const [tenant, theme] of [
    ["muster-stadtwerke", "saar-green"],
    ["wasserverband-musterland", "blue"],
    ["klinikum-beispielstadt", "high-contrast"],
  ] as const) {
    test(`a hovered sidebar link keeps its text color in ${theme}`, async ({ page }) => {
      await go(page, `/t/${tenant}/dashboard`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const link = page.locator(".grc-shell-nav-link:not([aria-current])").first();
      // The Theme's own sidebar text color, resolved: reading the link itself could catch
      // it halfway through the transition after the Theme changed.
      const expected = await link.evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--grc-sidebar-text)";
        el.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      });

      await link.hover();

      await expect(link).toHaveCSS("color", expected);
    });
  }

  test("choosing a paragraph changes content in place, with no scrollbar", async ({ page }) => {
    await go(page, `${TENANT}/compliance`);
    const drill = page.locator(".grc-drill");
    const handle = await drill.elementHandle();

    await page.getByRole("button", { name: /§ 12/ }).click();

    await expect(page.getByText("§ 12 Abs. 1")).toBeVisible();
    const fits = await drill.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
    expect(await handle.evaluate((el) => el.isConnected)).toBe(true);
    await expect(drill.locator(":scope > section")).toHaveCount(3);
  });

  test("while a paragraph opens, the title and the columns never move or change width", async ({
    page,
  }) => {
    await go(page, `${TENANT}/compliance`);
    const snapshot = () =>
      page.evaluate(() => [
        Math.round(document.querySelector("h1")?.getBoundingClientRect().top ?? -1),
        ...[...document.querySelectorAll(".grc-drill > section")].map((column) =>
          Math.round(column.getBoundingClientRect().width),
        ),
      ]);
    await expect(page.getByRole("button", { name: /§ 12/ })).toBeVisible();
    const resting = await snapshot();

    await page.getByRole("button", { name: /§ 12/ }).click();
    const seen = await page.evaluate(
      () =>
        new Promise<number[][]>((resolve) => {
          const frames: number[][] = [];
          const sample = () => {
            frames.push([
              Math.round(document.querySelector("h1")?.getBoundingClientRect().top ?? -1),
              ...[...document.querySelectorAll(".grc-drill > section")].map((column) =>
                Math.round(column.getBoundingClientRect().width),
              ),
            ]);
            if (frames.length < 40) requestAnimationFrame(sample);
            else resolve(frames);
          };
          sample();
        }),
    );

    for (const frame of seen) expect(frame).toEqual(resting);
    expect(await snapshot()).toEqual(resting);
  });

  test("a facility's text stays inside its card", async ({ page }) => {
    await go(page, `${TENANT}/facilities`);

    const outside = await page.locator(".grc-facility-card").evaluateAll((cards) =>
      cards.flatMap((card) => {
        const edge = card.getBoundingClientRect().right;
        return [...card.querySelectorAll("dd")]
          .filter((value) => value.getBoundingClientRect().right > edge)
          .map((value) => value.textContent);
      }),
    );

    expect(outside).toEqual([]);
  });

  test("the empty corner of a risk matrix is a narrow column", async ({ page }) => {
    for (const [path, corner] of [
      [`${TENANT}/dashboard`, ".grc-risk-matrix-corner"],
      [`${TENANT}/risks`, ".grc-explorer-corner"],
    ] as const) {
      await go(page, path);
      const width = await page
        .locator(corner)
        .first()
        .evaluate((el) => el.getBoundingClientRect().width);

      expect(width).toBeLessThanOrEqual(40);
    }
  });
});
