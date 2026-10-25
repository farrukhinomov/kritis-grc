import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";

import { problem } from "@/mocks/http";
import { server } from "@/mocks/server";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const DASHBOARD = "/t/muster-stadtwerke/dashboard";
const ACCESS = /§ 13 Abs\. 3 Nr\. 2 Objektschutz/;

async function openDashboard() {
  const rendered = renderRoute(DASHBOARD);
  await screen.findByRole("heading", { level: 1, name: "Übersicht" });
  return rendered;
}

const palette = () => screen.findByRole("combobox", { name: "Suchen" });
const options = () => screen.getAllByRole("option");
const location = (router: { state: { location: { pathname: string; search: string } } }) => ({
  pathname: router.state.location.pathname,
  params: new URLSearchParams(router.state.location.search),
});

describe("the command palette", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("opens with Ctrl+K and finds a Requirement by its citation", async () => {
    const { router } = await openDashboard();

    await userEvent.keyboard("{Control>}k{/Control}");
    const input = await palette();
    expect(input).toHaveFocus();
    await userEvent.type(input, "§13 abs.3 nr.2");
    await screen.findByRole("option", { name: ACCESS });
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(location(router).pathname).toBe("/t/muster-stadtwerke/compliance");
    });
    expect(location(router).params.get("requirement")).toBe("req-k-13-3-2");
    expect(location(router).params.get("paragraph")).toBe("§ 13");
    expect(location(router).params.get("framework")).toBe("fw-kritisdachg");
  });

  it("opens with Cmd+K as well", async () => {
    await openDashboard();

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(await palette()).toBeInTheDocument();
  });

  it("moves through the results with the arrow keys", async () => {
    const { router } = await openDashboard();
    await userEvent.keyboard("{Control>}k{/Control}");
    const input = await palette();
    await userEvent.type(input, "pumpwerk");
    await screen.findByRole("option", { name: /Längerer Stromausfall/ });

    expect(options()[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(options()[1]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options()[1]!.id);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(options().at(-1)).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{Home}{Enter}");

    await waitFor(() => {
      expect(location(router).params.get("risk")).toBe("rk-n-power");
    });
    expect(location(router).pathname).toBe("/t/muster-stadtwerke/risks");
  });

  it("finds pages by their name in the interface language", async () => {
    const { router } = await openDashboard();
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.type(await palette(), "Betroff");
    await userEvent.click(await screen.findByRole("option", { name: /Betroffenheit/ }));

    await waitFor(() => {
      expect(location(router).pathname).toBe("/t/muster-stadtwerke/applicability");
    });
  });

  it("groups the results and says how many it found", async () => {
    await openDashboard();
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.type(await palette(), "pumpwerk");

    expect(await screen.findByRole("group", { name: /Risiken/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Assets/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/\d+ Treffer/);
    });
  });

  it("says when nothing matches", async () => {
    await openDashboard();
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.type(await palette(), "xyzzy");

    expect(await screen.findByText("Keine Treffer für „xyzzy“.")).toBeInTheDocument();
  });

  it("says when the search is unavailable, and still finds pages", async () => {
    server.use(
      http.get("/api/v1/tenants/:tenant/search", () =>
        problem(503, "service_unavailable", "Down."),
      ),
    );
    await openDashboard();
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.type(await palette(), "risiken");

    expect(await screen.findByText(/Die Suche ist gerade nicht verfügbar/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Risiken/ })).toBeInTheDocument();
  });

  it("is also opened from the header", async () => {
    await openDashboard();

    await userEvent.click(screen.getByRole("button", { name: /Suchen/ }));

    expect(await palette()).toHaveFocus();
  });

  it("closes with Escape", async () => {
    await openDashboard();
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = (await palette()).closest(".ant-modal-wrap");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(dialog?.querySelector(".ant-modal")).toHaveClass("ant-zoom-leave");
    });
  });
});

describe("the command palette on a phone", () => {
  it("opens from the header's search button", async () => {
    await openDashboard();

    await userEvent.click(screen.getByRole("button", { name: "Suchen" }));

    expect(await palette()).toBeInTheDocument();
  });
});
