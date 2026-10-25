import { QueryClient } from "@tanstack/react-query";

import { apiGet } from "@/shared/api/client";
import {
  approveSuggestion,
  mappingsQuery,
  mappingSuggestionsQuery,
  rejectSuggestion,
} from "@/shared/api/compliance";

import { setMockSession } from "./accounts";
import { SEED } from "./seed";

/** The reads and decisions the Mapping Suggestion review needs, through the typed client. */

const DEMO = "muster-stadtwerke";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);
const statuteOrder = (id: string) => SEED.requirements.findIndex((item) => item.id === id);

describe("the Mapping Suggestions", () => {
  it("name both Requirements, so the review needs no catalogue lists", async () => {
    const page = await client().query(mappingSuggestionsQuery(DEMO, { status: "pending" }));

    const first = page.items.find((item) => item.id === "sug-1")!;
    expect(first.target).toMatchObject({
      id: "req-k-13-3-2",
      citation: expect.stringContaining("§ 13") as unknown,
      framework_name: "KRITIS-Dachgesetz",
    });
    expect(first.source).toMatchObject({ id: "req-b-30-2-9", framework_name: "NIS2 (BSIG 2025)" });
    expect(first.source.title_de).not.toBe("");
    expect(first).toMatchObject({ decided_by_id: null, decided_by_name: null, decided_at: null });
  });

  it("list the pending ones in the order of the statute they would map to", async () => {
    const page = await client().query(mappingSuggestionsQuery(DEMO, { status: "pending" }));

    const order = page.items.map((item) => statuteOrder(item.target_requirement_id));
    expect(order).toEqual(order.toSorted((a, b) => a - b));
    expect(page.page.total).toBe(SEED.mappingSuggestions.length);
  });

  it("turn into a Tenant Mapping when approved, saying who decided and when", async () => {
    const mapping = await approveSuggestion(DEMO, "sug-1");

    expect(mapping).toMatchObject({ kind: "tenant", target_requirement_id: "req-k-13-3-2" });
    const mappings = await client().query(
      mappingsQuery(DEMO, { target_requirement: "req-k-13-3-2" }),
    );
    expect(mappings.items.map((item) => item.id)).toContain(mapping.id);
    const approved = await client().query(mappingSuggestionsQuery(DEMO, { status: "approved" }));
    expect(approved.items).toHaveLength(1);
    expect(approved.items[0]).toMatchObject({ id: "sug-1", decided_by_name: "Alex Kramer" });
    expect(approved.items[0]!.decided_at).not.toBeNull();
  });

  it("list decided ones with the latest decision first", async () => {
    await rejectSuggestion(DEMO, "sug-2");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await rejectSuggestion(DEMO, "sug-3");

    const rejected = await client().query(mappingSuggestionsQuery(DEMO, { status: "rejected" }));

    expect(rejected.items.map((item) => item.id)).toEqual(["sug-3", "sug-2"]);
  });

  it("can't be decided twice", async () => {
    await rejectSuggestion(DEMO, "sug-1");

    const error = await failure(approveSuggestion(DEMO, "sug-1"));

    expect(error).toMatchObject({ status: 409, code: "suggestion_already_decided" });
  });

  it("refuse an unknown status instead of answering with an empty list", async () => {
    const error = await failure(apiGet(`/api/v1/tenants/${DEMO}/mapping-suggestions?status=maybe`));

    expect(error).toMatchObject({ status: 400, code: "invalid_filter" });
  });

  it("can't be decided by an Auditor", async () => {
    setMockSession("auditor");

    const error = await failure(approveSuggestion(DEMO, "sug-1"));

    expect(error).toMatchObject({ status: 403 });
  });
});
