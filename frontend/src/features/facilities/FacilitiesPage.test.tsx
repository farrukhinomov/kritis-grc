import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WIDE_SCREEN_QUERY } from "@/shared/lib/breakpoints";
import { matchMediaQueries } from "@/test/media";
import { renderRoute } from "@/test/render";

const PAGE = "/t/muster-stadtwerke/facilities";

async function openFacilities(search = "") {
  const rendered = renderRoute(`${PAGE}${search}`);
  await screen.findByRole("heading", { level: 1, name: "Anlagen und Assets" });
  return rendered;
}

const params = (router: { state: { location: { search: string } } }) =>
  new URLSearchParams(router.state.location.search);

beforeEach(() => {
  matchMediaQueries(WIDE_SCREEN_QUERY);
});

describe("the Facilities and Assets", () => {
  it("list every Scope, with a Critical Facility's service, supply and Registration", async () => {
    await openFacilities();

    const north = within(await screen.findByRole("region", { name: "Wasserwerk Nord" }));
    expect(north.getByText(/Trinkwasserversorgung/)).toBeInTheDocument();
    expect(north.getByText(/620\.000 versorgte Personen/)).toBeInTheDocument();
    expect(north.getByText(/Registrierung geplant: 15\.01\.2027/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /gesamt/ })).toBeInTheDocument();
  });

  it("show the Assets of the chosen Scope with kind and criticality", async () => {
    const { router } = await openFacilities();

    await userEvent.click(
      await screen.findByRole("button", { name: "Assets anzeigen: Wasserwerk Süd" }),
    );

    const assets = within(await screen.findByRole("region", { name: "Assets: Wasserwerk Süd" }));
    expect(await assets.findByText("Pumpwerk Süd")).toBeInTheDocument();
    expect(assets.getAllByText(/Kritikalität/).length).toBeGreaterThan(0);
    expect(params(router).get("scope")).toBe("sc-sued");
  });

  it("open an Asset with its dependencies and the risks that name it", async () => {
    const { router } = await openFacilities("?scope=sc-nord");

    await userEvent.click(await screen.findByRole("button", { name: "Pumpwerk Nord" }));

    const detail = within(await screen.findByRole("dialog"));
    expect(
      await detail.findByText("Längerer Stromausfall legt Pumpwerk Nord still"),
    ).toBeInTheDocument();
    expect(detail.getByRole("region", { name: "Hängt ab von" })).toHaveTextContent(/Netzanschluss/);
    expect(params(router).get("asset")).toBe("as-n-pumps");

    await router.navigate(-1);
    await waitFor(() => {
      expect(params(router).get("asset")).toBeNull();
    });
  });

  it("open an Asset straight from a link, as the search gives one", async () => {
    await openFacilities("?scope=sc-nord&asset=as-n-pumps");

    const detail = within(await screen.findByRole("dialog"));
    expect(await detail.findByRole("region", { name: "Hängt ab von" })).toBeInTheDocument();
    expect(detail.getAllByText(/Pumpwerk Nord/).length).toBeGreaterThan(0);
  });

  it("explain an empty Tenant", async () => {
    renderRoute("/t/wasserverband-musterland/facilities");

    expect(await screen.findByText(/Noch keine Anlagen erfasst/)).toBeInTheDocument();
  });
});
