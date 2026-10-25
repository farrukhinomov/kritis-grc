import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderRoute } from "@/test/render";

describe("routes", () => {
  it("opens a Tenant on its dashboard", async () => {
    const { router } = renderRoute("/t/muster-stadtwerke");

    expect(await screen.findByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/t/muster-stadtwerke/dashboard");
  });

  it("names the browser tab after the page", async () => {
    renderRoute("/t/muster-stadtwerke/risks");

    await screen.findByRole("heading", { level: 1, name: "Risiken" });
    await waitFor(() => {
      expect(document.title).toBe("Risiken · GRC-Plattform");
    });
  });

  it("shows a not-found page for unknown paths", async () => {
    renderRoute("/does-not-exist");

    expect(
      await screen.findByRole("heading", { name: "Seite nicht gefunden" }),
    ).toBeInTheDocument();
  });

  it("shows unknown screens inside a Tenant as not found, within the shell", async () => {
    renderRoute("/t/muster-stadtwerke/does-not-exist");

    expect(await screen.findByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Hauptnavigation" })).toBeVisible();
  });

  it("treats a Tenant without a Membership as not found", async () => {
    renderRoute("/t/someone-else/dashboard");

    expect(await screen.findByRole("heading", { name: "Mandant nicht gefunden" })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Hauptnavigation" })).not.toBeInTheDocument();
  });

  it("leads from the not-found page back to the start page with one control", async () => {
    renderRoute("/does-not-exist");

    await userEvent.click(await screen.findByRole("button", { name: "Zur Startseite" }));

    expect(await screen.findByRole("heading", { name: "Systemstatus" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Zur Startseite" })).not.toBeInTheDocument();
  });
});
