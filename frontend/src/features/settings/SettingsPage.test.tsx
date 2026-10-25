import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { http } from "msw";

import { setMockSession } from "@/mocks/accounts";
import { problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const PAGE = "/t/muster-stadtwerke/settings";

async function openSettings() {
  const rendered = renderRoute(PAGE);
  await screen.findByRole("heading", { level: 1, name: "Einstellungen" });
  return rendered;
}

/** antd's radio buttons keep their native inputs under the labels, out of pointer reach. */
const pick = (name: string | RegExp) =>
  userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole("radio", { name }));

beforeEach(() => {
  matchMediaQueries(WIDE_SCREEN_QUERY);
});

describe("the Tenant settings", () => {
  it("change the Tenant's Theme for everyone, and the app takes it on", async () => {
    await openSettings();
    expect(await screen.findByRole("radio", { name: /^Saar Green/ })).toBeChecked();

    await pick(/^Blau/);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("blue");
    });
    expect(screen.getByRole("radio", { name: /^Blau/ })).toBeChecked();
    const theme = within(screen.getByRole("region", { name: "Theme des Mandanten" }));
    expect(await theme.findByRole("status")).toHaveTextContent(/„Blau“ gespeichert/);
  });

  it("keep the saved Theme even if the session can't be reloaded afterwards", async () => {
    await openSettings();
    await screen.findByRole("radio", { name: /^Saar Green/ });
    server.use(http.get("/api/v1/me", () => problem(503, "service_unavailable", "Down.")));

    await pick(/^Blau/);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("blue");
    });
    expect(screen.getByRole("radio", { name: /^Blau/ })).toBeChecked();
  });

  it("return to the saved Theme when the change fails", async () => {
    server.use(
      http.patch("/api/v1/tenants/:tenant", () => problem(503, "service_unavailable", "Down.")),
    );
    await openSettings();
    await screen.findByRole("radio", { name: /^Saar Green/ });

    await pick(/^Blau/);

    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht gespeichert/);
    expect(screen.getByRole("radio", { name: /^Saar Green/ })).toBeChecked();
    const theme = within(screen.getByRole("region", { name: "Theme des Mandanten" }));
    expect(theme.getByRole("status")).toHaveTextContent("");
  });

  it("let each user choose light, dark or the system's mode", async () => {
    await openSettings();

    await pick("Dunkel");

    expect(document.documentElement.dataset.colorMode).toBe("dark");
  });

  it("show an Auditor the Theme without letting them change it", async () => {
    setMockSession("auditor");
    await openSettings();

    expect(await screen.findByRole("radio", { name: /^Saar Green/ })).toBeDisabled();
    expect(screen.getByText(/Nur GRC-Manager können das Theme ändern/)).toBeInTheDocument();
  });
});
