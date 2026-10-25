import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { http } from "msw";

import { problem } from "@/mocks/http";
import { SEED } from "@/mocks/seed";
import { server } from "@/mocks/server";
import { setSimulation } from "@/mocks/simulation";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const EXPLORER = "/t/muster-stadtwerke/risks";

async function openExplorer(search = "") {
  const rendered = renderRoute(`${EXPLORER}${search}`);
  await screen.findByRole("heading", { level: 1, name: "Risiken" });
  return rendered;
}

const matrix = () => screen.findByRole("table", { name: /Risikomatrix/ });
const cellButton = async (likelihood: number, impact: number) =>
  within(await matrix()).findByRole("button", {
    name: new RegExp(
      `Eintrittswahrscheinlichkeit ${String(likelihood)}, Auswirkung ${String(impact)}`,
    ),
  });
const table = () => screen.findByRole("region", { name: "Risiken" });

/** antd's Segmented keeps its native radios under the labels, out of pointer reach. */
const choose = (name: string) =>
  userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole("radio", { name }));

/** antd's Select keeps a hidden option list for screen readers; only the visible one reacts. */
async function chooseOption(select: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: select }));
  const item = await waitFor(() => {
    const element = document.querySelector(`.ant-select-item-option[title="${option}"]`);
    expect(element).not.toBeNull();
    return element!;
  });
  await userEvent.click(item);
}

const params = (router: { state: { location: { search: string } } }) =>
  new URLSearchParams(router.state.location.search);

describe("the risk explorer on a wide screen", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("shows the residual matrix and every risk by default", async () => {
    await openExplorer();

    expect(screen.getByRole("radio", { name: "Restrisiko" })).toBeChecked();
    expect(await cellButton(3, 3)).toHaveAccessibleName(/: 1 Risiko, /);
    const rows = within(await table()).getAllByRole("row");
    expect(rows).toHaveLength(SEED.risks.length + 1);
    const power = rows.find((row) => row.textContent.includes("Längerer Stromausfall"));
    expect(power).toHaveTextContent("Wasserwerk Nord · Stromausfall");
  });

  it("switches the matrix between the three ratings and keeps it in the URL", async () => {
    const { router } = await openExplorer();
    await matrix();

    await choose("Ausgangsbewertung");

    expect(await cellButton(3, 4)).toHaveAccessibleName(/: 1 Risiko, Kategorie Kritisch$/);
    expect(params(router).get("rating")).toBe("inherent");
  });

  it("filters by the category of the chosen rating", async () => {
    const { router } = await openExplorer();
    await table();

    await chooseOption("Kategorie", "Mittel");

    await waitFor(() => {
      expect(
        within(screen.getByRole("region", { name: "Risiken" })).getAllByRole("row"),
      ).toHaveLength(2);
    });
    expect(screen.getByText("Hochwasser verunreinigt Brunnenfeld Nord")).toBeInTheDocument();
    expect(params(router).get("category")).toBe("medium");
  });

  it("drops the pending filter when the rating can't be pending", async () => {
    const { router } = await openExplorer("?category=pending");
    await matrix();

    await choose("Zielbewertung");

    await waitFor(() => {
      expect(params(router).get("category")).toBeNull();
    });
    expect(
      screen.getByRole("combobox", { name: "Kategorie" }).closest(".ant-select"),
    ).toHaveTextContent("Alle Kategorien");
  });

  it("brings a link with a page past the end back to the last page", async () => {
    const { router } = await openExplorer("?page=4");

    expect(await screen.findByText("Längerer Stromausfall legt Pumpwerk Nord still")).toBeVisible();
    expect(params(router).get("page")).toBeNull();
  });

  it("narrows the table to the risks of a cell", async () => {
    const { router } = await openExplorer("?rating=inherent");

    await userEvent.click(await cellButton(3, 4));

    await waitFor(() => {
      expect(
        within(screen.getByRole("region", { name: "Risiken" })).getAllByRole("row"),
      ).toHaveLength(2);
    });
    expect(screen.getByText("Längerer Stromausfall legt Pumpwerk Nord still")).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get("cell")).toBe("3-4");
    expect(await cellButton(3, 4)).toHaveAttribute("aria-pressed", "true");
  });

  it("filters by Scope", async () => {
    await openExplorer("?scope=sc-sued");

    const rows = within(await table()).getAllByRole("row");
    expect(rows).toHaveLength(SEED.risks.filter((risk) => risk.scope_id === "sc-sued").length + 1);
  });

  it("shows risks without a Residual Rating as pending, not as low", async () => {
    setSimulation({ riskEngineDown: true });
    await openExplorer();

    expect(await screen.findByText(/7 Risiken warten noch auf die Berechnung/)).toBeInTheDocument();
    expect(within(await table()).getAllByText("Berechnung ausstehend")).toHaveLength(
      SEED.risks.length,
    );
  });

  it("opens a risk's detail from the table", async () => {
    const { router } = await openExplorer();

    await userEvent.click(
      within(await table()).getByRole("button", {
        name: "Längerer Stromausfall legt Pumpwerk Nord still",
      }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get("risk")).toBe("rk-n-power");
  });
});

describe("the risk explorer on a phone", () => {
  it("opens a cell's risks in a sheet", async () => {
    await openExplorer("?rating=inherent");

    await userEvent.click(await cellButton(3, 4));

    const sheet = within(await screen.findByRole("dialog"));
    expect(
      await sheet.findByText("Längerer Stromausfall legt Pumpwerk Nord still"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auf volle Höhe vergrößern" })).toBeInTheDocument();
  });

  it("closes the sheet with the back gesture and returns focus to its cell", async () => {
    const { router } = await openExplorer("?rating=inherent");
    await userEvent.click(await cellButton(3, 4));
    const sheet = within(await screen.findByRole("dialog"));
    // A browser moves focus into the sheet; jsdom doesn't, so the test does.
    (
      await sheet.findByRole("button", { name: "Längerer Stromausfall legt Pumpwerk Nord still" })
    ).focus();

    await router.navigate(-1);

    await waitFor(() => {
      expect(params(router).get("cell")).toBeNull();
    });
    expect(router.state.location.pathname).toBe(EXPLORER);
    await waitFor(async () => {
      expect(await cellButton(3, 4)).toHaveFocus();
    });
  });

  it("says when a cell's risks can't be loaded", async () => {
    server.use(
      http.get("/api/v1/tenants/:tenant/risks", ({ request }) =>
        new URL(request.url).searchParams.has("likelihood")
          ? problem(503, "service_unavailable", "Down.")
          : undefined,
      ),
    );
    await openExplorer("?rating=inherent");

    await userEvent.click(await cellButton(3, 4));

    const sheet = within(await screen.findByRole("dialog"));
    expect(await sheet.findByText("Dieser Bereich konnte nicht geladen werden.")).toBeVisible();
  });
});
