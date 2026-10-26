import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { tenantData } from "@/mocks/db";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { layOutForGraphs } from "@/test/reactFlow";
import { renderRoute } from "@/test/render";

const PAGE = "/t/muster-stadtwerke/dependencies";

async function openDependencies(search = "") {
  const rendered = renderRoute(`${PAGE}${search}`);
  await screen.findByRole("heading", { level: 1, name: "Abhängigkeiten" });
  return rendered;
}

const graph = () => screen.findByRole("region", { name: /^Abhängigkeitsgraph/ });
const tree = () => screen.findByRole("list", { name: /^Abhängigkeiten von/ });

let restore: () => void;
beforeEach(() => {
  restore = layOutForGraphs();
});
afterEach(() => {
  restore();
});

describe("the dependency graph", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("shows the facility, its Assets and their suppliers as nodes", async () => {
    await openDependencies();

    const region = within(await graph());
    expect(await region.findByText("Wasserwerk Nord")).toBeInTheDocument();
    for (const name of ["Aufbereitungsanlage Nord", "Pumpwerk Nord", "Chemikalienlieferant"]) {
      expect(region.getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    // Süd's own Assets are not Nord's dependencies.
    expect(region.queryByRole("button", { name: /Süd/ })).not.toBeInTheDocument();
  });

  it("opens an Asset's details from its node, and the URL keeps it", async () => {
    const { router } = await openDependencies();

    await userEvent.click(
      await within(await graph()).findByRole("button", { name: /^Pumpwerk Nord/ }),
    );

    const details = within(await screen.findByRole("dialog"));
    expect(await details.findByText("Pumpwerk Nord")).toBeInTheDocument();
    expect(details.getByText("Hängt ab von")).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get("asset")).toBe("as-n-pumps");
  });

  it("overlays the facility's Risks on its Assets on request", async () => {
    await openDependencies();
    const wells = await within(await graph()).findByRole("button", {
      name: /^Brunnenfeld Nord/,
    });
    expect(wells).not.toHaveTextContent("Risiken");

    await userEvent.click(screen.getByRole("switch", { name: "Risiken einblenden" }));

    await waitFor(() => {
      expect(wells).toHaveTextContent("2 Risiken");
    });
    // The name says what the node shows, in the same order.
    expect(wells).toHaveAccessibleName(
      "Brunnenfeld Nord, Technische Anlage, Restrisiko: Hoch · 2 Risiken",
    );
  });

  it("returns focus to the node that opened the details", async () => {
    await openDependencies();
    const pumps = await within(await graph()).findByRole("button", { name: /^Pumpwerk Nord/ });
    await userEvent.click(pumps);
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(pumps).toHaveFocus();
    });
  });

  it("closes the details with the back gesture", async () => {
    const { router } = await openDependencies();
    await userEvent.click(
      await within(await graph()).findByRole("button", { name: /^Pumpwerk Nord/ }),
    );
    await screen.findByRole("dialog");

    await router.navigate(-1);

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has("asset")).toBe(false);
    });
  });

  it("closes a linked Asset into the page, not back out of it", async () => {
    const { router } = await openDependencies("?asset=as-n-pumps");
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has("asset")).toBe(false);
    });
    expect(router.state.location.pathname).toBe(PAGE);
  });

  it("says so when the Asset in the URL isn't part of the graph", async () => {
    await openDependencies("?asset=as-s-pumps");

    expect(
      await within(await screen.findByRole("dialog")).findByText(
        "Dieses Asset gibt es in diesem Geltungsbereich nicht.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the graph library's English helper texts away from screen readers", async () => {
    await openDependencies();
    await within(await graph()).findByRole("button", { name: /^Pumpwerk Nord/ });

    expect(screen.queryByText(/Press enter or space/)).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^Edge from/ })).not.toBeInTheDocument();
    expect(document.querySelector("[aria-roledescription]")).toBeNull();
  });

  it("switches to another Critical Facility, kept in the URL", async () => {
    const { router } = await openDependencies();
    await within(await graph()).findByRole("button", { name: /^Pumpwerk Nord/ });

    await userEvent.click(
      screen.getByText("Wasserwerk Süd", { selector: ".ant-segmented-item-label" }),
    );

    expect(
      await within(await graph()).findByRole("button", { name: /^Pumpwerk Süd/ }),
    ).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get("scope")).toBe("sc-sued");
  });

  it("offers the same content as a list", async () => {
    await openDependencies();

    await userEvent.click(
      await screen.findByText("Liste", { selector: ".ant-segmented-item-label" }),
    );

    expect(await tree()).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Abhängigkeitsgraph/ })).not.toBeInTheDocument();
  });
});

describe("the dependencies on phones", () => {
  it("are a tree from the facility down to its suppliers", async () => {
    await openDependencies();

    const list = within(await tree());
    const plant = list
      .getAllByRole("listitem")
      .find((item) => item.firstElementChild?.textContent.startsWith("Aufbereitungsanlage Nord"))!;
    // The chlorine supplier sits below the treatment plant that relies on it.
    expect(
      within(plant.querySelector<HTMLElement>(":scope > ul")!).getByRole("button", {
        name: /^Chemikalienlieferant/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Abhängigkeitsgraph/ })).not.toBeInTheDocument();
    // Shared power is shown in full once; elsewhere the tree only refers to it.
    const power = list.getAllByRole("button", { name: /^Netzanschluss und Notstrom Nord/ });
    expect(power.length).toBeGreaterThan(1);
    expect(
      power.filter((entry) => !entry.getAttribute("aria-label")!.includes("oben aufgeführt")),
    ).toHaveLength(1);
  });

  it("open an Asset's details from the tree", async () => {
    await openDependencies();

    await userEvent.click(
      within(await tree()).getAllByRole("button", { name: /^Pumpwerk Nord/ })[0]!,
    );

    expect(
      await within(await screen.findByRole("dialog")).findByText("Pumpwerk Nord"),
    ).toBeInTheDocument();
  });
});

describe("a Critical Facility without Assets", () => {
  it("says where Assets come from", async () => {
    const data = tenantData("muster-stadtwerke")!;
    data.assets = data.assets.filter((asset) => asset.scope_id !== "sc-nord");
    await openDependencies();

    expect(
      await screen.findByText(/Für diese Anlage sind noch keine Assets erfasst/),
    ).toBeInTheDocument();
  });
});

describe("a Tenant without a Critical Facility", () => {
  it("is told how to create one", async () => {
    renderRoute("/t/wasserverband-musterland/dependencies");

    expect(await screen.findByText(/Noch keine kritische Anlage erfasst/)).toBeInTheDocument();
  });
});
