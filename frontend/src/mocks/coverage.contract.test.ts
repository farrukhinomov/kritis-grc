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

    expect(result.rows.map((row) => row.citation)).toEqual([
      "§ 8 Abs. 1",
      "§ 8 Abs. 6",
      "§ 12 Abs. 1",
      "§ 13 Abs. 1",
      "§ 13 Abs. 3 Nr. 1",
      "§ 13 Abs. 3 Nr. 2",
      "§ 13 Abs. 3 Nr. 3",
      "§ 13 Abs. 3 Nr. 4",
      "§ 13 Abs. 3 Nr. 5",
      "§ 13 Abs. 3 Nr. 6",
      "§ 13 Abs. 4",
      "§ 16 Abs. 2",
      "§ 16 Abs. 3",
      "§ 18 Abs. 1",
      "§ 18 Abs. 2",
      "§ 20 Abs. 1",
    ]);
    // Statute order, not text order: Nr. 10 comes after Nr. 9.
    expect(result.columns.map((column) => column.citation).slice(8, 10)).toEqual([
      "§ 30 Abs. 2 Nr. 9",
      "§ 30 Abs. 2 Nr. 10",
    ]);
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

    // Fully covered, and Süd refers to the implemented BSIG Implementation as Evidence.
    const cell = result.cells.find((item) => item.target_requirement_id === "req-k-13-3-5")!;
    expect(cell.reused_in).toEqual([{ scope_id: "sc-sued", scope_name: "Wasserwerk Süd" }]);
  });

  it("doesn't count a reference under a partial Mapping, which leaves part uncovered", async () => {
    const result = await matrix();

    // Both facilities refer to the BSIG Implementation here, but the Mapping is partial.
    const cell = result.cells.find((item) => item.target_requirement_id === "req-k-13-3-3")!;
    expect(cell.coverage).toBe("partial");
    expect(cell.reused_in).toEqual([]);
  });

  it("doesn't count a reference to a BSIG Implementation that isn't implemented", async () => {
    tenantData(DEMO)!.implementations.find((item) => item.id === "im-041")!.status = "partial";

    const result = await matrix();

    const cell = result.cells.find((item) => item.target_requirement_id === "req-k-13-3-5")!;
    expect(cell.reused_in).toEqual([]);
  });

  it("counts what is mapped, how fully, and where it is reused", async () => {
    const result = await matrix();

    expect(result.totals).toEqual({ cells: 8, full: 1, partial: 7, reused: 1 });
  });

  it("holds only the Platform Mappings for a Tenant without its own", async () => {
    const result = await matrix(EMPTY);

    // The seven Platform Mappings; the Demo Tenant's own pair § 13 Abs. 3 Nr. 3 is missing.
    expect(result.totals).toEqual({ cells: 7, full: 0, partial: 7, reused: 0 });
    expect(result.cells.some((cell) => cell.target_requirement_id === "req-k-13-3-3")).toBe(false);
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
