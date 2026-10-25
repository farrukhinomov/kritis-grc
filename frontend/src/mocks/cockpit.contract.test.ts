import { QueryClient } from "@tanstack/react-query";

import { apiGet } from "@/shared/api/client";
import {
  complianceParagraphsQuery,
  implementationQuery,
  implementationsQuery,
} from "@/shared/api/compliance";

import { SEED } from "./seed";

/** The reads the compliance cockpit needs, exercised through the real typed client. */

const DEMO = "muster-stadtwerke";
const KRITIS = "fv-kritisdachg-2026-07";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

describe("compliance paragraphs", () => {
  it("count one Scope's Implementations per paragraph, in statute order", async () => {
    const result = await client().query(
      complianceParagraphsQuery(DEMO, { framework_version: KRITIS, scope: "sc-nord" }),
    );

    expect(result.rows.map((row) => row.paragraph)).toEqual([
      "§ 8",
      "§ 12",
      "§ 13",
      "§ 16",
      "§ 18",
      "§ 20",
    ]);
    const section13 = result.rows.find((row) => row.paragraph === "§ 13");
    const expected = SEED.implementations.filter(
      (i) =>
        i.scope_id === "sc-nord" &&
        SEED.requirements.find((r) => r.id === i.requirement_id)?.paragraph === "§ 13",
    );
    expect(section13?.requirement_count).toBe(8);
    expect(Object.values(section13?.counts ?? {}).reduce((a, b) => a + b, 0)).toBe(expected.length);
  });

  it("need both the Framework Version and the Scope", async () => {
    const error = await failure(
      apiGet(`/api/v1/tenants/${DEMO}/compliance-paragraphs?scope=sc-nord`),
    );

    expect(error).toMatchObject({ status: 400, code: "missing_filter" });
  });

  it("are empty for a Scope without Implementations of that Framework", async () => {
    const result = await client().query(
      complianceParagraphsQuery(DEMO, { framework_version: "fv-bsig-2025-12", scope: "sc-nord" }),
    );

    expect(result.rows).toEqual([]);
  });
});

describe("implementations of one paragraph", () => {
  it("filter by the paragraph of their Requirement", async () => {
    const page = await client().query(
      implementationsQuery(DEMO, { scope: "sc-nord", paragraph: "§ 13", limit: 100 }),
    );

    expect(page.items).toHaveLength(8);
    for (const item of page.items) {
      expect(SEED.requirements.find((r) => r.id === item.requirement_id)?.paragraph).toBe("§ 13");
    }
  });

  it("name their owner, so readers needn't page through every member", async () => {
    const [first] = (
      await client().query(implementationsQuery(DEMO, { owner: "u-becker", limit: 1 }))
    ).items;

    expect(first).toMatchObject({ owner_id: "u-becker", owner_name: "Jana Becker" });
    await expect(client().query(implementationQuery(DEMO, first!.id))).resolves.toMatchObject({
      owner_name: "Jana Becker",
    });
  });
});
