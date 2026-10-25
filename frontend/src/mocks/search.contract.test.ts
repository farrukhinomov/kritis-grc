import { QueryClient } from "@tanstack/react-query";

import { apiGet } from "@/shared/api/client";
import { searchQuery } from "@/shared/api/search";

import { SEED } from "./seed";

/** The search behind the command palette, through the typed client. */

const DEMO = "muster-stadtwerke";
const EMPTY = "wasserverband-musterland";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);
const search = (q: string, tenant = DEMO) => client().query(searchQuery(tenant, q));

describe("the search", () => {
  it("finds Requirements by citation, however it is spaced", async () => {
    const result = await search("§13 abs.3 nr.2");

    expect(result.requirements.items[0]).toMatchObject({
      id: "req-k-13-3-2",
      citation: "§ 13 Abs. 3 Nr. 2",
      framework_id: "fw-kritisdachg",
      framework_name: "KRITIS-Dachgesetz",
      paragraph: "§ 13",
      scope_id: "sc-nord",
    });
  });

  it("finds only Requirements the Tenant applies, which the cockpit can open", async () => {
    const result = await search("§13", EMPTY);

    expect(result.requirements.items).toEqual([]);
  });

  it("doesn't treat a query of punctuation as a citation that matches everything", async () => {
    const result = await search(". .");

    expect(result.requirements.total).toBe(0);
  });

  it("finds Requirements by their text, ignoring case and accents", async () => {
    const result = await search("resilienzplan");

    expect(result.requirements.items.map((item) => item.id)).toContain("req-k-13-4");
  });

  it("finds Risks and Assets of the Tenant by name", async () => {
    const result = await search("pumpwerk");

    expect(result.risks.items).toContainEqual({
      id: "rk-n-power",
      title_de: "Längerer Stromausfall legt Pumpwerk Nord still",
      scope_name: "Wasserwerk Nord",
    });
    expect(result.assets.items.map((item) => item.id)).toContain("as-n-pumps");
    expect(result.assets.items[0]).toHaveProperty("scope_name");
  });

  it("caps each group and says how many there are in all", async () => {
    const result = await search("abs");

    expect(result.requirements.items).toHaveLength(5);
    expect(result.requirements.total).toBeGreaterThan(5);
  });

  it("never returns another Tenant's Risks or Assets", async () => {
    const result = await search("pumpwerk", EMPTY);

    expect(result.risks.items).toEqual([]);
    expect(result.assets.items).toEqual([]);
    expect(SEED.risks.some((risk) => risk.title_de.includes("Pumpwerk"))).toBe(true);
  });

  it("refuses a query shorter than two characters", async () => {
    const error = await failure(apiGet(`/api/v1/tenants/${DEMO}/search?q=a`));

    expect(error).toMatchObject({ status: 400, code: "invalid_filter" });
  });
});
