import { QueryClient } from "@tanstack/react-query";

import { apiGet } from "@/shared/api/client";
import { implementationQuery, updateImplementation } from "@/shared/api/compliance";
import { riskMatrixQuery, riskQuery, risksQuery } from "@/shared/api/risk";

import { SEED } from "./seed";
import { setSimulation } from "./simulation";

/** The reads the risk explorer needs, exercised through the real typed client. */

const DEMO = "muster-stadtwerke";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

describe("a risk", () => {
  it("names its Hazard, Assets and owner, so the detail needs no catalogue lists", async () => {
    const risk = await client().query(riskQuery(DEMO, "rk-n-power"));

    expect(risk.hazard).toMatchObject({ id: "hz-power", category: "technical" });
    expect(risk.hazard.name_de).not.toBe("");
    expect(risk.assets.map((asset) => asset.id)).toEqual(["as-n-power", "as-n-pumps"]);
    expect(Object.keys(risk.assets[0]!).toSorted()).toEqual(["criticality", "id", "name"]);
    expect(risk.assets[0]!.name).not.toBe("");
    expect(risk.owner_name).toBe("Deniz Yılmaz");
  });

  it("moves to a lower Residual Rating when a Treatment's Implementation is implemented", async () => {
    const before = await client().query(riskQuery(DEMO, "rk-n-power"));
    const treated = await client().query(implementationQuery(DEMO, "im-015"));

    await updateImplementation(DEMO, treated.id, treated.version, { status: "implemented" });

    const after = await client().query(riskQuery(DEMO, "rk-n-power"));
    expect(after.residual!.score).toBeLessThan(before.residual!.score);
  });
});

describe("the risk list", () => {
  it("filters by Scope", async () => {
    const page = await client().query(risksQuery(DEMO, { scope: "sc-sued" }));

    expect(page.items.map((risk) => risk.id).toSorted()).toEqual(
      SEED.risks
        .filter((risk) => risk.scope_id === "sc-sued")
        .map((risk) => risk.id)
        .toSorted(),
    );
  });

  it("filters by the category of the chosen rating", async () => {
    const all = await client().query(risksQuery(DEMO, { limit: 100 }));
    const high = all.items.filter((risk) => risk.inherent.category === "high");

    const page = await client().query(
      risksQuery(DEMO, { rating: "inherent", category: "high", limit: 100 }),
    );

    expect(page.items.map((risk) => risk.id)).toEqual(high.map((risk) => risk.id));
  });

  it("filters to one matrix cell of the chosen rating", async () => {
    const page = await client().query(
      risksQuery(DEMO, { rating: "inherent", likelihood: 3, impact: 4 }),
    );

    expect(page.items.map((risk) => risk.id)).toEqual(["rk-n-power"]);
  });

  it("lists risks without a Residual Rating as pending, never under a category", async () => {
    setSimulation({ riskEngineDown: true });

    const pending = await client().query(risksQuery(DEMO, { category: "pending", limit: 100 }));
    const low = await client().query(risksQuery(DEMO, { category: "low", limit: 100 }));

    expect(pending.page.total).toBe(SEED.risks.length);
    expect(low.page.total).toBe(0);
  });

  it.each([
    ["an unknown rating", "rating=current", "invalid_filter"],
    ["an unknown category", "category=severe", "invalid_filter"],
    ["a cell outside the matrix", "likelihood=5&impact=1", "invalid_filter"],
    [
      "pending for a rating that is never pending",
      "rating=inherent&category=pending",
      "invalid_filter",
    ],
  ])("refuses %s", async (_, query, code) => {
    const error = await failure(apiGet(`/api/v1/tenants/${DEMO}/risks?${query}`));

    expect(error).toMatchObject({ status: 400, code });
  });
});

describe("the risk matrix", () => {
  it("counts by the chosen rating", async () => {
    const inherent = await client().query(riskMatrixQuery(DEMO, { rating: "inherent" }));

    const cell = inherent.cells.find((item) => item.likelihood === 3 && item.impact === 4);
    expect(cell).toMatchObject({ count: 1 });
    expect(inherent.pending).toBe(0);
  });

  it("can be narrowed to one Scope", async () => {
    const matrix = await client().query(riskMatrixQuery(DEMO, { scope: "sc-sued" }));

    expect(matrix.total).toBe(SEED.risks.filter((risk) => risk.scope_id === "sc-sued").length);
  });

  it("never counts a Target as pending, even with the risk engine down", async () => {
    setSimulation({ riskEngineDown: true });

    const target = await client().query(riskMatrixQuery(DEMO, { rating: "target" }));

    expect(target.pending).toBe(0);
    expect(target.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(SEED.risks.length);
  });
});
