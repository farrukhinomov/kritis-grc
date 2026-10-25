import { QueryClient } from "@tanstack/react-query";

import { apiGet } from "@/shared/api/client";
import {
  complianceSummaryQuery,
  implementationsQuery,
  updateImplementation,
} from "@/shared/api/compliance";
import { activityQuery } from "@/shared/api/activity";
import { riskMatrixQuery, risksQuery } from "@/shared/api/risk";

import { SEED } from "./seed";
import { setSimulation } from "./simulation";

/** The reads the dashboard needs, exercised through the real typed client. */

const DEMO = "muster-stadtwerke";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

describe("compliance summary", () => {
  it("counts Implementations per Scope and Framework by status", async () => {
    const summary = await client().query(complianceSummaryQuery(DEMO));

    const pairs = summary.rows.map((row) => `${row.scope_id}/${row.framework_id}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    const nord = summary.rows.filter((row) => row.scope_id === "sc-nord");
    const total = (status: "open" | "partial" | "implemented" | "not_applicable") =>
      nord.reduce((sum, row) => sum + row.counts[status], 0);
    expect([
      total("open"),
      total("partial"),
      total("implemented"),
      total("not_applicable"),
    ]).toEqual([5, 7, 3, 1]);
  });

  it("follows a status change at once", async () => {
    const before = await client().query(complianceSummaryQuery(DEMO));
    const [open] = (
      await client().query(implementationsQuery(DEMO, { scope: "sc-nord", status: "open" }))
    ).items;

    await updateImplementation(DEMO, open!.id, open!.version, { status: "implemented" });

    const after = await client().query(complianceSummaryQuery(DEMO));
    const implemented = (rows: typeof before.rows) =>
      rows
        .filter((row) => row.scope_id === "sc-nord")
        .reduce((sum, row) => sum + row.counts.implemented, 0);
    expect(implemented(after.rows)).toBe(implemented(before.rows) + 1);
  });

  it("is empty for a Tenant without Implementations", async () => {
    const summary = await client().query(complianceSummaryQuery("wasserverband-musterland"));

    expect(summary.rows).toEqual([]);
  });

  it("is one aggregate with names, never a page that could cut rows off", async () => {
    const summary = await client().query(complianceSummaryQuery(DEMO));

    expect(summary).not.toHaveProperty("page");
    expect(summary.rows.find((row) => row.scope_id === "sc-nord")).toMatchObject({
      scope_name: "Wasserwerk Nord",
      scope_kind: "critical_facility",
      framework_name: "KRITIS-Dachgesetz",
    });
  });
});

describe("risk matrix", () => {
  it("counts every risk by its residual cell", async () => {
    const matrix = await client().query(riskMatrixQuery(DEMO));

    expect(matrix.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(SEED.risks.length);
    expect(matrix).toMatchObject({ total: SEED.risks.length, pending: 0 });
    expect(matrix.cells.find((cell) => cell.likelihood === 3 && cell.impact === 3)).toMatchObject({
      worst_category: "critical",
    });
  });

  it("counts risks the engine hasn't rated as pending, not as low", async () => {
    setSimulation({ riskEngineDown: true });

    const matrix = await client().query(riskMatrixQuery(DEMO));

    expect(matrix).toEqual({ cells: [], pending: SEED.risks.length, total: SEED.risks.length });
  });
});

describe("activity", () => {
  it("names the actor, so clients needn't page through every member", async () => {
    const activity = await client().infiniteQuery(activityQuery(DEMO, { limit: 1 }));

    expect(activity.pages[0]?.items[0]).toMatchObject({ actor_name: "Tobias Wolff" });
  });
});

describe("implementations of one owner", () => {
  it("filter by owner and by several statuses at once", async () => {
    const page = await client().query(
      implementationsQuery(DEMO, { owner: "u-kramer", status: ["open", "partial"], limit: 100 }),
    );

    expect(page.items.length).toBeGreaterThan(0);
    expect(new Set(page.items.map((item) => item.owner_id))).toEqual(new Set(["u-kramer"]));
    expect(page.items.every((item) => item.status === "open" || item.status === "partial")).toBe(
      true,
    );
  });

  it("ignore an empty status, as Django filters do", async () => {
    const all = await client().query(implementationsQuery(DEMO, { limit: 1 }));

    const page = await client().query(implementationsQuery(DEMO, { status: [], limit: 1 }));

    expect(page.page.total).toBe(all.page.total);
  });

  it("reject an unknown status in the list", async () => {
    const error = await failure(apiGet(`/api/v1/tenants/${DEMO}/implementations?status=open,done`));

    expect(error).toMatchObject({ status: 400, code: "invalid_filter" });
  });
});

describe("risks by Residual Rating", () => {
  it("come highest first", async () => {
    const page = await client().query(risksQuery(DEMO, { ordering: "-residual_score", limit: 5 }));

    const scores = page.items.map((risk) => risk.residual?.score ?? 0);
    expect(page.items).toHaveLength(5);
    expect(scores).toEqual(scores.toSorted((a, b) => b - a));
  });

  it("put risks without a Residual Rating last, ordered by inherent score", async () => {
    setSimulation({ riskEngineDown: true });

    const page = await client().query(risksQuery(DEMO, { ordering: "-residual_score" }));

    const scores = page.items.map((risk) => risk.inherent.score);
    expect(scores).toEqual(scores.toSorted((a, b) => b - a));
  });

  it("reject an unknown ordering", async () => {
    const error = await failure(apiGet(`/api/v1/tenants/${DEMO}/risks?ordering=name`));

    expect(error).toMatchObject({ status: 400, code: "invalid_ordering" });
  });
});
