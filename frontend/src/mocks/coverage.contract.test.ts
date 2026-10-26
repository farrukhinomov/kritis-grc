import { QueryClient } from "@tanstack/react-query";

import { coverageMatrixQuery } from "@/shared/api/compliance";

import { tenantData } from "./db";

/** The coverage matrix of KRITIS-DachG by BSIG, through the typed client. */

const DEMO = "muster-stadtwerke";
const EMPTY = "wasserverband-musterland";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const matrix = (tenant = DEMO) => client().query(coverageMatrixQuery(tenant));

describe("the coverage matrix", () => {
  it("has the KRITIS-DachG Requirements as rows and the BSIG ones as columns, in order", async () => {
    const result = await matrix();

    expect(result.rows[0]).toMatchObject({ citation: "§ 8 Abs. 1", paragraph: "§ 8" });
    expect(result.rows.every((row) => row.framework_key === "kritis_dachg")).toBe(true);
    expect(result.columns.every((column) => column.framework_key === "bsig")).toBe(true);
    expect(result.rows).toHaveLength(16);
    expect(result.columns).toHaveLength(14);
  });

  it("puts each Mapping into the cell of its two Requirements", async () => {
    const result = await matrix();

    expect(result.cells).toContainEqual(
      expect.objectContaining({
        target_requirement_id: "req-k-12-1",
        source_requirement_id: "req-b-30-2-1",
        coverage: "partial",
      }),
    );
  });

  it("rates a cell by its strongest Mapping, and lists them all", async () => {
    const result = await matrix();

    // A Platform Mapping says partial; the Tenant's own approved one says full.
    const cell = result.cells.find((item) => item.target_requirement_id === "req-k-13-3-5")!;
    expect(cell.coverage).toBe("full");
    expect(cell.mappings.map((mapping) => [mapping.kind, mapping.coverage])).toEqual([
      ["tenant", "full"],
      ["platform", "partial"],
    ]);
  });

  it("names the facilities where one Implementation already counts for both", async () => {
    const result = await matrix();

    const cell = result.cells.find((item) => item.target_requirement_id === "req-k-13-3-3")!;
    expect(cell.reused_in).toEqual([
      { scope_id: "sc-nord", scope_name: "Wasserwerk Nord" },
      { scope_id: "sc-sued", scope_name: "Wasserwerk Süd" },
    ]);
    expect(
      result.cells.find((item) => item.target_requirement_id === "req-k-12-1")!.reused_in,
    ).toEqual([]);
  });

  it("counts what is mapped, how fully, and where it is reused", async () => {
    const result = await matrix();

    expect(result.totals).toEqual({ cells: 8, full: 1, partial: 7, reused: 1 });
  });

  it("holds only the Platform Mappings for a Tenant without its own", async () => {
    const result = await matrix(EMPTY);

    expect(result.cells.flatMap((cell) => cell.mappings).every((m) => m.kind === "platform")).toBe(
      true,
    );
    expect(result.totals.reused).toBe(0);
  });

  it("leaves out a Tenant Mapping that is still waiting for approval", async () => {
    const mapping = tenantData(DEMO)!.mappings.find((item) => item.id === "map-t-2")!;
    mapping.approved_by_id = null;
    mapping.approved_at = null;

    const result = await matrix();

    const cell = result.cells.find((item) => item.target_requirement_id === "req-k-13-3-5")!;
    expect(cell.coverage).toBe("partial");
  });
});
