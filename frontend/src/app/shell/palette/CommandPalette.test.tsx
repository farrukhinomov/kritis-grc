import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http } from "msw";

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

  it("opens with Cmd+K on Apple keyboards, where Ctrl+K stays the system's", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh)");
    await openDashboard();

    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("combobox", { name: "Suchen" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(await palette()).toBeInTheDocument();
  });

  it("doesn't open over another dialog, whose work it would throw away", async () => {
    await openDashboard();
    const other = document.createElement("div");
    other.setAttribute("aria-modal", "true");
    document.body.append(other);

    await userEvent.keyboard("{Control>}k{/Control}");

    expect(screen.queryByRole("combobox", { name: "Suchen" })).not.toBeInTheDocument();
    other.remove();
  });

  it("is a named dialog", async () => {
    await openDashboard();

    await userEvent.keyboard("{Control>}k{/Control}");

    // antd gives every id the same value under test, so the name is checked by its link.
    const dialog = await screen.findByRole("dialog");
    const label = dialog.getAttribute("aria-labelledby");
    expect(label).not.toBeNull();
    expect(dialog.querySelector(`[id="${label!}"]`)).toHaveTextContent("Suche");
  });

  it("opens a Requirement in a Scope that applies it", async () => {
    const { router } = await openDashboard();
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.type(await palette(), "§13 abs.3 nr.2");
    await screen.findByRole("option", { name: ACCESS });
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(location(router).params.get("scope")).toBe("sc-nord");
    });
  });

  it("never opens a result of an earlier query", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/v1/tenants/:tenant/search", async ({ request }) => {
        if (new URL(request.url).searchParams.get("q") !== "pumpwerk") {
          await held;
        }
        return undefined;
      }),
    );
    const { router } = await openDashboard();
    await userEvent.keyboard("{Control>}k{/Control}");
    const input = await palette();
    await userEvent.type(input, "pumpwerk");
    await screen.findByRole("option", { name: /Längerer Stromausfall/ });

    await userEvent.type(input, " süd{Enter}");
    await delay(300);

    expect(location(router).pathname).toBe("/t/muster-stadtwerke/dashboard");
    release();
  });

  it("ignores Enter while an input method is composing a word", async () => {
    const { router } = await openDashboard();
    await userEvent.keyboard("{Control>}k{/Control}");
    const input = await palette();
    await userEvent.type(input, "Risik");
    await screen.findByRole("option", { name: /^Risiken/ });

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    // A navigation would load the page's code first; give it the time to.
    await delay(300);

    expect(location(router).pathname).toBe("/t/muster-stadtwerke/dashboard");
  });

  it("keeps the active option in view", async () => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    await openDashboard();
    await userEvent.keyboard("{Control>}k{/Control}");
    await palette();

    await userEvent.keyboard("{ArrowUp}");

    expect(scrolled).toHaveBeenCalledWith({ block: "nearest" });
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

    await userEvent.keyboard("{ArrowDown}{Enter}");

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
