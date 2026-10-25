import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderRoute } from "@/test/render";

describe("routes", () => {
  it("renders tenant pages under the tenant slug from the URL", async () => {
    renderRoute("/t/muster-stadtwerke");

    expect(await screen.findByText(/muster-stadtwerke/)).toBeInTheDocument();
  });

  it("shows a not-found page for unknown paths", async () => {
    renderRoute("/does-not-exist");

    expect(
      await screen.findByRole("heading", { name: "Seite nicht gefunden" }),
    ).toBeInTheDocument();
  });

  it("leads from the not-found page back to the start page with one control", async () => {
    renderRoute("/does-not-exist");

    await userEvent.click(await screen.findByRole("button", { name: "Zur Startseite" }));

    expect(await screen.findByRole("heading", { name: "Systemstatus" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Zur Startseite" })).not.toBeInTheDocument();
  });
});
