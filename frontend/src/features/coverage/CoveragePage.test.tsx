import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const PAGE = "/t/muster-stadtwerke/coverage";

async function openCoverage() {
  const rendered = renderRoute(PAGE);
  await screen.findByRole("heading", { level: 1, name: "Abdeckung" });
  return rendered;
}

const grid = () => screen.findByRole("table", { name: /KRITIS-DachG nach BSIG/ });

describe("the coverage heatmap", () => {
  beforeEach(() => {
    matchMediaQueries(WIDE_SCREEN_QUERY);
  });

  it("crosses the KRITIS-DachG Requirements with the BSIG ones", async () => {
    await openCoverage();

    const table = within(await grid());
    expect(table.getByRole("rowheader", { name: /§ 12 Abs\. 1/ })).toBeInTheDocument();
    expect(table.getByRole("columnheader", { name: "§ 30 Abs. 2 Nr. 1 BSIG" })).toBeInTheDocument();
    // Fully and partly covered cells say so in words, not only in color.
    expect(table.getAllByRole("button", { name: /teilweise abgedeckt/ })).toHaveLength(7);
    expect(table.getAllByRole("button", { name: /vollständig abgedeckt/ })).toHaveLength(1);
    expect(
      table.getByRole("button", { name: /^§ 13 Abs\. 3 Nr\. 5.*eine Umsetzung zählt für beide$/ }),
    ).toBeInTheDocument();
    expect(table.getAllByRole("button", { name: /eine Umsetzung zählt für beide/ })).toHaveLength(
      1,
    );
  });

  it("sums up what is covered", async () => {
    await openCoverage();

    expect(await screen.findByText(/8 Paare mit Mapping/)).toBeInTheDocument();
    expect(screen.getByText(/1 vollständig/)).toBeInTheDocument();
  });

  it("lists a cell's Mappings and where they are reused when the cell is chosen", async () => {
    const { router } = await openCoverage();

    await userEvent.click(
      within(await grid()).getByRole("button", { name: /^§ 13 Abs\. 3 Nr\. 3 KRITIS-DachG/ }),
    );

    const details = within(await screen.findByRole("dialog"));
    expect(
      await details.findByText(/Unser Krisenstab ist für IT- und physische Vorfälle/),
    ).toBeInTheDocument();
    expect(details.getByText("Mandanten-Mapping")).toBeInTheDocument();
    expect(details.getByText(/Alarmabläufe für Objektschutz-Vorfälle/)).toBeInTheDocument();
    // Partial: the BSIG Implementation can't prove the whole duty, however it is referenced.
    expect(details.getByText(/Nur ein vollständiges Mapping/)).toBeInTheDocument();
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("target")).toBe("req-k-13-3-3");
    expect(params.get("source")).toBe("req-b-30-2-2");
  });

  it("closes the details with the back gesture", async () => {
    const { router } = await openCoverage();
    await userEvent.click(
      within(await grid()).getByRole("button", { name: /^§ 12 Abs\. 1 KRITIS-DachG/ }),
    );
    await screen.findByRole("dialog");

    await router.navigate(-1);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(new URLSearchParams(router.state.location.search).has("target")).toBe(false);
  });

  it("returns focus to the cell that opened the details", async () => {
    await openCoverage();
    const cell = within(await grid()).getByRole("button", { name: /^§ 12 Abs\. 1 KRITIS-DachG/ });
    await userEvent.click(cell);
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));

    await waitFor(() => {
      expect(cell).toHaveFocus();
    });
  });

  it("names the facilities where one Implementation counts for both", async () => {
    await openCoverage();

    await userEvent.click(
      within(await grid()).getByRole("button", { name: /^§ 13 Abs\. 3 Nr\. 5 KRITIS-DachG/ }),
    );

    expect(
      await within(await screen.findByRole("dialog")).findByText(/Wasserwerk Süd/),
    ).toBeInTheDocument();
  });

  it("closes a linked pair into the page, not back out of it", async () => {
    const { router } = renderRoute(`${PAGE}?target=req-k-12-1&source=req-b-30-2-1`);
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has("target")).toBe(false);
    });
    expect(router.state.location.pathname).toBe(PAGE);
  });

  it("says so when the pair in the URL has no Mapping", async () => {
    renderRoute(`${PAGE}?target=req-k-20-1&source=req-b-30-2-1`);

    expect(
      await within(await screen.findByRole("dialog")).findByText(
        /Für diese beiden Anforderungen gibt es kein Mapping/,
      ),
    ).toBeInTheDocument();
  });
});

describe("the coverage on phones", () => {
  it("is a list of the mapped pairs, grouped by KRITIS-DachG Requirement", async () => {
    await openCoverage();

    const list = within(await screen.findByRole("list", { name: /Mappings nach KRITIS-DachG/ }));
    expect(list.getAllByRole("button")).toHaveLength(8);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
