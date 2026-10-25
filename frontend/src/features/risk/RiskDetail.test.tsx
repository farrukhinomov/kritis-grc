import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setMockSession } from "@/mocks/accounts";
import { setSimulation } from "@/mocks/simulation";
import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const POWER = "/t/muster-stadtwerke/risks?risk=rk-n-power";

async function openRisk(path = POWER) {
  const rendered = renderRoute(path);
  const detail = within(await screen.findByRole("dialog"));
  await detail.findByText("Bewertungen");
  return { ...rendered, detail };
}

/** Where a rating's marker sits: its cell's position in the grid, row by row from the top. */
function markerCell(kind: "inherent" | "residual" | "target"): number {
  const marker = document.querySelector(`.grc-rating-grid .grc-rating-marker-${kind}`);
  const cells = [...document.querySelectorAll(".grc-rating-grid .grc-rating-cell")];
  return cells.findIndex((cell) => marker !== null && cell.contains(marker));
}

beforeEach(() => {
  matchMediaQueries(WIDE_SCREEN_QUERY);
});

describe("a risk's detail", () => {
  it("names its Hazard, Assets and owner", async () => {
    const { detail } = await openRisk();

    expect(detail.getByText(/Stromausfall/, { selector: "dd" })).toBeInTheDocument();
    expect(detail.getByText("Deniz Yılmaz")).toBeInTheDocument();
    expect(
      detail.getAllByRole("listitem").some((item) => item.textContent.includes("Kritikalität")),
    ).toBe(true);
  });

  it("shows each Treatment with its Implementation and its effect", async () => {
    const { detail } = await openRisk();

    const treatments = within(detail.getByRole("region", { name: "Maßnahmen" }));
    expect(await treatments.findByText(/§ 13 Abs. 3 Nr. 4/)).toBeInTheDocument();
    expect(
      treatments.getByText(/senkt die Eintrittswahrscheinlichkeit um 1 Stufe/),
    ).toBeInTheDocument();
    expect(
      treatments.getByText(/senkt die Auswirkung derzeit um 1 von 2 Stufen; voll umgesetzt um 2/),
    ).toBeInTheDocument();
    expect(detail.getByText(/Berechnet nach Methode/)).toBeInTheDocument();
  });

  it("lets the residual marker move to its new cell once a Treatment takes effect", async () => {
    const { detail } = await openRisk();
    const before = markerCell("residual");
    const treatments = within(detail.getByRole("region", { name: "Maßnahmen" }));

    await userEvent.click(
      await treatments.findByRole("button", { name: "Als umgesetzt markieren" }),
    );

    await waitFor(() => {
      expect(markerCell("residual")).not.toBe(before);
    });
    expect(markerCell("inherent")).not.toBe(-1);
    expect(treatments.getByText(/senkt die Auswirkung um 2 Stufen/)).toBeInTheDocument();
    expect(
      treatments.queryByRole("button", { name: "Als umgesetzt markieren" }),
    ).not.toBeInTheDocument();
  });

  it("updates the explorer's matrix after the change", async () => {
    const { detail } = await openRisk("/t/muster-stadtwerke/risks?risk=rk-n-power");
    const cellOf = (likelihood: number, impact: number) =>
      screen.getByRole("button", {
        name: new RegExp(
          `Eintrittswahrscheinlichkeit ${String(likelihood)}, Auswirkung ${String(impact)}`,
        ),
      });
    await waitFor(() => {
      expect(cellOf(2, 3)).toBeInTheDocument();
    });
    const before = cellOf(2, 3).textContent;

    const treatments = within(detail.getByRole("region", { name: "Maßnahmen" }));
    await userEvent.click(
      await treatments.findByRole("button", { name: "Als umgesetzt markieren" }),
    );

    await waitFor(() => {
      expect(cellOf(2, 3).textContent).not.toBe(before);
    });
  });

  it("says the calculation is pending when the risk engine is down", async () => {
    setSimulation({ riskEngineDown: true });
    const { detail } = await openRisk();

    expect(
      detail.getByText(/Berechnung ausstehend: Die Risiko-Engine ist gerade nicht erreichbar/),
    ).toBeInTheDocument();
    expect(markerCell("residual")).toBe(-1);
    expect(markerCell("inherent")).not.toBe(-1);
  });

  it("closes with the back gesture after it was opened from the table", async () => {
    const { router } = renderRoute("/t/muster-stadtwerke/risks");
    await userEvent.click(
      await screen.findByRole("button", { name: "Längerer Stromausfall legt Pumpwerk Nord still" }),
    );
    await screen.findByRole("dialog");

    await router.navigate(-1);

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get("risk")).toBeNull();
    });
  });
});

describe("a risk's detail for an Auditor", () => {
  it("offers no change", async () => {
    setMockSession("auditor");
    const { detail } = await openRisk();

    await detail.findByText(/§ 13 Abs. 3 Nr. 4/);
    expect(
      detail.queryByRole("button", { name: "Als umgesetzt markieren" }),
    ).not.toBeInTheDocument();
  });
});
