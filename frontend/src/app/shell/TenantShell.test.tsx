import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ROOMY_SCREEN_QUERY, WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

import { NAV_ITEMS, PRIMARY_NAV_ITEMS, SECONDARY_NAV_ITEMS } from "./navigation";

const mainNavigation = () => screen.getByRole("navigation", { name: "Hauptnavigation" });

async function openPage(path: string, heading: string) {
  const rendered = renderRoute(path);
  await screen.findByRole("heading", { level: 1, name: heading });
  return rendered;
}

describe("the shell on a phone", () => {
  it("puts the four main screens and More in a tab bar", async () => {
    await openPage("/t/muster-stadtwerke/dashboard", "Übersicht");

    const tabs = within(mainNavigation());
    expect(tabs.getAllByRole("link")).toHaveLength(PRIMARY_NAV_ITEMS.length);
    expect(tabs.getByRole("link", { name: "Übersicht" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("button", { name: "Mehr" })).toBeVisible();
  });

  it("reaches every other screen through the More sheet", async () => {
    await openPage("/t/muster-stadtwerke/dashboard", "Übersicht");

    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    // antd's id helper returns a fixed id under test, so the dialog's name can't be checked here.
    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getAllByRole("link")).toHaveLength(SECONDARY_NAV_ITEMS.length);

    await userEvent.click(sheet.getByRole("link", { name: "Fristen" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Fristen" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mehr" })).toHaveAttribute("data-active", "true");
  });

  it("moves the language switch into the user menu", async () => {
    await openPage("/t/muster-stadtwerke/dashboard", "Übersicht");
    expect(screen.queryByRole("radiogroup", { name: "Sprache" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Benutzermenü" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "EN" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  });
});

describe("the shell on a wide screen", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("lists every screen in the sidebar and marks the current one", async () => {
    await openPage("/t/muster-stadtwerke/risks", "Risiken");

    const sidebar = within(mainNavigation());
    expect(sidebar.getAllByRole("link")).toHaveLength(NAV_ITEMS.length);
    expect(sidebar.getByRole("link", { name: "Risiken" })).toHaveAttribute("aria-current", "page");
  });

  it("starts collapsed on smaller wide screens", async () => {
    await openPage("/t/muster-stadtwerke/dashboard", "Übersicht");

    expect(screen.getByRole("button", { name: "Navigation ausklappen" })).toBeVisible();
  });

  it("collapses the sidebar to icons while keeping every link named", async () => {
    matchMediaQueries(ROOMY_SCREEN_QUERY);
    await openPage("/t/muster-stadtwerke/dashboard", "Übersicht");
    await userEvent.click(screen.getByRole("button", { name: "Navigation einklappen" }));

    expect(screen.getByRole("button", { name: "Navigation ausklappen" })).toBeVisible();
    expect(within(mainNavigation()).getByRole("link", { name: "Compliance" })).toBeVisible();
  });

  it("moves focus to the new page's heading after navigating", async () => {
    await openPage("/t/muster-stadtwerke/dashboard", "Übersicht");

    await userEvent.click(within(mainNavigation()).getByRole("link", { name: "Compliance" }));

    const heading = await screen.findByRole("heading", { level: 1, name: "Compliance" });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
  });

  it("leaves focus alone when a Tenant link redirects to its dashboard", async () => {
    await openPage("/t/muster-stadtwerke", "Übersicht");

    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
  });

  it("carries only the screen, not object IDs, into another Tenant", async () => {
    const { router } = await openPage("/t/muster-stadtwerke/risks/r-42", "Seite nicht gefunden");

    await userEvent.click(screen.getByRole("combobox", { name: "Mandant wechseln" }));
    await userEvent.click(await screen.findByTitle("Wasserverband Musterland"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/t/wasserverband-musterland/risks");
    });
  });

  it("switches Tenants on the same screen and applies the new Tenant's Theme", async () => {
    const { router } = await openPage("/t/muster-stadtwerke/risks", "Risiken");
    expect(document.documentElement.dataset.theme).toBe("saar-green");

    await userEvent.click(screen.getByRole("combobox", { name: "Mandant wechseln" }));
    await userEvent.click(await screen.findByTitle("Wasserverband Musterland"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/t/wasserverband-musterland/risks");
    });
    expect(document.documentElement.dataset.theme).toBe("blue");
  });

  it("lets the user choose dark mode from the user menu", async () => {
    await openPage("/t/muster-stadtwerke/dashboard", "Übersicht");

    await userEvent.click(screen.getByRole("button", { name: /Alex Kramer/ }));
    expect(await screen.findByRole("menuitemradio", { name: "Hell" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Dunkel" }));

    expect(document.documentElement.dataset.colorMode).toBe("dark");
  });

  it("shows the user's role in the current Tenant", async () => {
    await openPage("/t/klinikum-beispielstadt/dashboard", "Übersicht");

    await userEvent.click(screen.getByRole("button", { name: /Alex Kramer/ }));

    // Popups never finish their entry animation in jsdom, so presence is what can be checked.
    expect(await screen.findByText("Auditor")).toBeInTheDocument();
  });
});

describe("the skip link", () => {
  it("is the first stop in the tab order and jumps to the content", async () => {
    await openPage("/t/muster-stadtwerke/dashboard", "Übersicht");

    await userEvent.tab();
    const skipLink = screen.getByRole("link", { name: "Zum Inhalt springen" });
    expect(skipLink).toHaveFocus();

    await userEvent.click(skipLink);

    expect(screen.getByRole("main")).toHaveFocus();
  });
});
