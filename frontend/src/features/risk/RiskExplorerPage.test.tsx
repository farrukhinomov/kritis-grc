import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SEED } from "@/mocks/seed";
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

describe("the risk explorer on a wide screen", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("shows the residual matrix and every risk by default", async () => {
    await openExplorer();

    expect(screen.getByRole("radio", { name: "Restrisiko" })).toBeChecked();
    expect(await cellButton(3, 3)).toHaveTextContent("1");
    const rows = within(await table()).getAllByRole("row");
    expect(rows).toHaveLength(SEED.risks.length + 1);
    const power = rows.find((row) => row.textContent.includes("Längerer Stromausfall"));
    expect(power).toHaveTextContent("Wasserwerk Nord · Stromausfall");
  });

  it("switches the matrix between the three ratings and keeps it in the URL", async () => {
    const { router } = await openExplorer();
    await matrix();

    await choose("Ausgangsbewertung");

    expect(await cellButton(3, 4)).toHaveTextContent("1");
    expect(new URLSearchParams(router.state.location.search).get("rating")).toBe("inherent");
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
    expect(sheet.getByText("Längerer Stromausfall legt Pumpwerk Nord still")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auf volle Höhe vergrößern" })).toBeInTheDocument();
  });
});
