import { QueryClient } from "@tanstack/react-query";

import { apiGet } from "@/shared/api/client";
import { dependencyGraphQuery } from "@/shared/api/organization";

import { tenantData } from "./db";
import { setSimulation } from "./simulation";

/** The dependency graph of a Critical Facility, through the typed client. */

const DEMO = "muster-stadtwerke";
const EMPTY = "wasserverband-musterland";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);
const graph = (scope: string, tenant = DEMO) => client().query(dependencyGraphQuery(tenant, scope));

describe("the dependency graph", () => {
  it("holds the facility's Assets and everything they depend on, in other Scopes too", async () => {
    const result = await graph("sc-nord");

    expect(result.scope).toEqual({ id: "sc-nord", name: "Wasserwerk Nord" });
    const ids = result.assets.map((asset) => asset.id);
    expect(ids).toEqual(expect.arrayContaining(["as-n-plant", "as-dc", "as-grid", "as-chlorine"]));
    // Süd's Assets are not Nord's dependencies.
    expect(ids.some((id) => id.startsWith("as-s-"))).toBe(false);
    expect(result.assets.find((asset) => asset.id === "as-grid")).toMatchObject({
      name: "Stromversorgung (Verteilnetzbetreiber)",
      kind: "supplier",
      scope_id: "sc-org",
      depends_on: [],
    });
    expect(result.assets.find((asset) => asset.id === "as-grid")!.scope_name).not.toBe("");
  });

  it("names the Assets the facility relies on directly: those nothing else needs", async () => {
    const result = await graph("sc-nord");

    expect(result.roots.toSorted()).toEqual(["as-n-plant", "as-n-reservoir"]);
  });

  it("overlays each Asset with its facility's Risks and the highest Residual Rating", async () => {
    const result = await graph("sc-nord");

    const wells = result.assets.find((asset) => asset.id === "as-n-wells")!;
    expect(wells.risks.count).toBe(2);
    // Of its two Risks, the higher Residual Rating.
    expect(wells.risks.highest).toEqual({ likelihood: 2, impact: 4, score: 8, category: "high" });
    // Both plants rely on the chlorine supplier, but only a Risk of Nord names it.
    const chlorine = result.assets.find((asset) => asset.id === "as-chlorine")!;
    expect(chlorine.risks.count).toBe(1);
    const sued = await graph("sc-sued");
    expect(sued.assets.find((asset) => asset.id === "as-chlorine")!.risks.count).toBe(0);
    expect(result.assets.find((asset) => asset.id === "as-grid")!.risks).toEqual({
      count: 0,
      highest: null,
    });
  });

  it("leaves the highest rating out while the risk engine can't calculate it", async () => {
    setSimulation({ riskEngineDown: true });

    const result = await graph("sc-nord");

    const wells = result.assets.find((asset) => asset.id === "as-n-wells")!;
    expect(wells.risks).toEqual({ count: 2, highest: null });
  });

  it("follows Assets in a cycle without running forever", async () => {
    const assets = tenantData(DEMO)!.assets;
    assets.find((asset) => asset.id === "as-grid")!.depends_on = ["as-n-power"];

    const result = await graph("sc-nord");

    expect(result.assets.filter((asset) => asset.id === "as-grid")).toHaveLength(1);
  });

  it("starts from the facility's own Assets even where they need each other in a cycle", async () => {
    const assets = tenantData(DEMO)!.assets;
    // Plant and reservoir rely on each other, so neither is "needed by nothing".
    assets.find((asset) => asset.id === "as-n-reservoir")!.depends_on.push("as-n-plant");
    assets.find((asset) => asset.id === "as-n-plant")!.depends_on.push("as-n-reservoir");

    const result = await graph("sc-nord");

    expect(result.roots).toEqual(["as-n-plant"]);
  });

  it("exists only for a Critical Facility of the Tenant", async () => {
    expect(await failure(graph("sc-org"))).toMatchObject({ status: 404 });
    expect(await failure(graph("sc-nord", EMPTY))).toMatchObject({ status: 404 });
    expect(await failure(apiGet(`/api/v1/tenants/${DEMO}/dependency-graph`))).toMatchObject({
      status: 400,
      code: "invalid_filter",
    });
  });
});
