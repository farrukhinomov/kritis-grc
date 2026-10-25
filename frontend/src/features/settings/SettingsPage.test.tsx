import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setMockSession } from "@/mocks/accounts";
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
    expect(await screen.findByRole("status")).toHaveTextContent(/gespeichert/);
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
