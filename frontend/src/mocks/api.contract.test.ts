import { QueryClient } from "@tanstack/react-query";

import { activityQuery } from "@/shared/api/activity";
import { ApiError, apiGet } from "@/shared/api/client";
import {
  addEvidence,
  approveSuggestion,
  evidenceQuery,
  frameworksQuery,
  implementationQuery,
  implementationsQuery,
  mappingsQuery,
  mappingSuggestionsQuery,
  rejectSuggestion,
  removeEvidence,
  requirementQuery,
  requirementsQuery,
  updateImplementation,
} from "@/shared/api/compliance";
import {
  assetsQuery,
  membersQuery,
  scopeQuery,
  scopesQuery,
  tenantQuery,
} from "@/shared/api/organization";
import { hazardsQuery, riskQuery, risksQuery } from "@/shared/api/risk";

import { SEED } from "./seed";
import { setSimulation } from "./simulation";

/**
 * The mock API exercised through the real typed client, so both sides of the contract
 * are checked together: what the screens send and what the backend must answer.
 */

const DEMO = "muster-stadtwerke";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

async function nordImplementation(requirementId: string) {
  const page = await client().query(
    implementationsQuery(DEMO, { scope: "sc-nord", requirement: requirementId }),
  );
  return page.items[0]!;
}

describe("tenants", () => {
  it("serve the Demo Tenant", async () => {
    await expect(client().query(tenantQuery(DEMO))).resolves.toMatchObject({
      name: "Muster-Stadtwerke Saar GmbH",
    });
  });

  it("answer 404, not 403, for a Tenant outside the user's Memberships", async () => {
    const error = await failure(client().query(tenantQuery("someone-else")));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "not_found" });
  });

  it("give other Tenants the shared catalogues but no data of their own", async () => {
    const other = "wasserverband-musterland";

    const requirements = await client().query(requirementsQuery(other));
    const scopes = await client().query(scopesQuery(other));

    expect(requirements.page.total).toBeGreaterThan(0);
    expect(scopes.items).toEqual([]);
  });
});

describe("lists", () => {
  it("page with a total and cap the limit at 100", async () => {
    const page = await client().query(requirementsQuery(DEMO, { page: 2, limit: 500 }));

    expect(page.page).toEqual({ number: 2, limit: 100, total: 30 });
    expect(page.items).toEqual([]);
  });

  it("reject a page that isn't a positive number", async () => {
    const error = await failure(apiGet(`/api/v1/tenants/${DEMO}/requirements?page=0`));

    expect(error).toMatchObject({ status: 400, code: "invalid_pagination" });
  });

  it("filter and search", async () => {
    const page = await client().query(requirementsQuery(DEMO, { search: "resilienzplan" }));

    expect(page.items.map((r) => r.citation)).toEqual(["§ 13 Abs. 4"]);
  });
});

describe("Critical Facilities", () => {
  it("come with deadlines projected from their planned Registration", async () => {
    const scope = await client().query(scopeQuery(DEMO, "sc-nord"));

    expect(scope.critical_facility?.deadlines[0]).toEqual({
      citation: "§ 12",
      due_date: "2027-10-15",
      binding: false,
    });
  });
});

describe("changing an Implementation", () => {
  it("saves with the current version, bumps it and logs the change", async () => {
    const before = await nordImplementation("req-k-13-3-4");

    const after = await updateImplementation(DEMO, before.id, before.version, {
      status: "implemented",
    });

    expect(after).toMatchObject({ status: "implemented", version: before.version + 1 });
    const activity = await client().infiniteQuery(activityQuery(DEMO));
    expect(activity.pages[0]?.items[0]).toMatchObject({
      action: "updated",
      object_id: before.id,
      actor_id: "u-kramer",
      changes: [{ field: "status", from: "partial", to: "implemented" }],
    });
  });

  it("refuses a stale version with 412, so nobody overwrites someone else's change", async () => {
    const before = await nordImplementation("req-k-13-3-4");

    const error = await failure(
      updateImplementation(DEMO, before.id, before.version - 1, { status: "open" }),
    );

    expect(error).toMatchObject({ status: 412, code: "version_conflict" });
  });

  it("requires If-Match", async () => {
    const before = await nordImplementation("req-k-13-3-4");

    const response = await fetch(`/api/v1/tenants/${DEMO}/implementations/${before.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "open" }),
    });

    expect(response.status).toBe(428);
  });

  it("reports invalid fields with their codes", async () => {
    const before = await nordImplementation("req-k-13-3-4");

    const error = await failure(
      updateImplementation(DEMO, before.id, before.version, {
        status: "done" as never,
        due_date: "2027-02-30",
      }),
    );

    expect(error).toMatchObject({
      status: 422,
      errors: [
        { field: "status", code: "invalid_choice" },
        { field: "due_date", code: "invalid_date" },
      ],
    });
  });

  it("serves the version as ETag", async () => {
    const before = await nordImplementation("req-k-13-3-4");

    const response = await fetch(`/api/v1/tenants/${DEMO}/implementations/${before.id}`);

    expect(response.headers.get("ETag")).toBe(`"${String(before.version)}"`);
  });

  it("moves the Risk it treats: the Residual Rating follows the new status", async () => {
    const risk = () => client().query(riskQuery(DEMO, "rk-n-power"));
    expect((await risk()).residual).toMatchObject({ likelihood: 2, impact: 3, category: "high" });
    const backup = await nordImplementation("req-k-13-3-4");

    await updateImplementation(DEMO, backup.id, backup.version, { status: "implemented" });

    expect((await risk()).residual).toMatchObject({ likelihood: 2, impact: 2, category: "medium" });
  });
});

describe("Evidence", () => {
  const link = { kind: "link" as const, title: "Prüfbericht", url: "https://example.org/bericht" };

  it("is added once, even when the same request is retried", async () => {
    const implementation = await nordImplementation("req-k-13-4");

    const first = await addEvidence(DEMO, implementation.id, link, "key-1");
    const retry = await addEvidence(DEMO, implementation.id, link, "key-1");

    expect(retry).toEqual(first);
    const evidence = await client().query(evidenceQuery(DEMO, implementation.id));
    expect(evidence.items).toHaveLength(1);
  });

  it("refuses a reused key with a different request", async () => {
    const implementation = await nordImplementation("req-k-13-4");
    await addEvidence(DEMO, implementation.id, link, "key-1");

    const error = await failure(
      addEvidence(DEMO, implementation.id, { ...link, title: "Anderer Titel" }, "key-1"),
    );

    expect(error).toMatchObject({ status: 422, code: "idempotency_key_reused" });
  });

  it("must not reference its own Implementation", async () => {
    const implementation = await nordImplementation("req-k-13-4");

    const error = await failure(
      addEvidence(
        DEMO,
        implementation.id,
        { kind: "reference", title: "Selbst", referenced_implementation_id: implementation.id },
        "key-2",
      ),
    );

    expect(error).toMatchObject({
      errors: [{ field: "referenced_implementation_id", code: "self_reference" }],
    });
  });

  it("can be removed", async () => {
    const implementation = await nordImplementation("req-k-13-4");
    const evidence = await addEvidence(DEMO, implementation.id, link, "key-3");

    await removeEvidence(DEMO, implementation.id, evidence.id);

    const remaining = await client().query(evidenceQuery(DEMO, implementation.id));
    expect(remaining.items).toEqual([]);
  });
});

describe("Mapping Suggestions", () => {
  it("become a Tenant Mapping when approved, and can't be decided twice", async () => {
    const mapping = await approveSuggestion(DEMO, "sug-1");

    expect(mapping).toMatchObject({ kind: "tenant", approved_by_id: "u-kramer" });
    const mappings = await client().query(
      mappingsQuery(DEMO, { target_requirement: "req-k-13-3-2" }),
    );
    expect(mappings.items.map((m) => m.id)).toContain(mapping.id);
    await expect(failure(rejectSuggestion(DEMO, "sug-1"))).resolves.toMatchObject({
      status: 409,
      code: "suggestion_already_decided",
    });
  });

  it("drop out of the pending list when rejected", async () => {
    await rejectSuggestion(DEMO, "sug-2");

    const pending = await client().query(mappingSuggestionsQuery(DEMO, { status: "pending" }));
    expect(pending.items.map((s) => s.id)).not.toContain("sug-2");
  });
});

describe("Activity Log", () => {
  it("pages newest first by cursor until the oldest entry", async () => {
    const query = client();
    const options = activityQuery(DEMO, { limit: 10 });

    const first = await query.infiniteQuery(options);
    expect(first.pages[0]?.items[0]?.id).toBe("ac-15");
    const next = first.pages[0]?.page.next_cursor;
    expect(next).toBeTruthy();

    const older = await apiGet<{ items: { id: string }[]; page: { next_cursor: string | null } }>(
      `/api/v1/tenants/${DEMO}/activity?limit=10&cursor=${encodeURIComponent(next!)}`,
    );
    expect(older.items.at(-1)?.id).toBe("ac-01");
    expect(older.page.next_cursor).toBeNull();
  });
});

describe("simulation", () => {
  it("fails requests when the failure rate is 100 %", async () => {
    setSimulation({ failureRate: 1 });

    await expect(failure(client().query(tenantQuery(DEMO)))).resolves.toMatchObject({
      status: 503,
      code: "service_unavailable",
    });
  });

  it("makes the next write conflict, as if someone else saved first", async () => {
    const before = await nordImplementation("req-k-13-4");
    setSimulation({ conflictOnNextWrite: true });

    const error = await failure(
      updateImplementation(DEMO, before.id, before.version, { status: "partial" }),
    );

    expect(error).toMatchObject({ status: 412 });
    const current = await client().query(implementationQuery(DEMO, before.id));
    expect(current.version).toBe(before.version + 1);
    await expect(
      updateImplementation(DEMO, before.id, current.version, { status: "partial" }),
    ).resolves.toMatchObject({ status: "partial" });
  });

  it("leaves the Residual Rating pending while the risk engine is down", async () => {
    setSimulation({ riskEngineDown: true });

    const risk = await client().query(riskQuery(DEMO, "rk-n-power"));

    expect(risk.residual).toBeNull();
    expect(risk.inherent).toMatchObject({ score: 12, category: "critical" });
  });
});

describe("review regressions", () => {
  it("let only one of two concurrent saves of the same version through", async () => {
    const before = await nordImplementation("req-k-13-4");

    const results = await Promise.allSettled([
      updateImplementation(DEMO, before.id, before.version, { status: "partial" }),
      updateImplementation(DEMO, before.id, before.version, { status: "implemented" }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ status: 412 });
  });

  it("keep the Activity Log cursor stable while new entries arrive", async () => {
    const first = await apiGet<{ items: { id: string }[]; page: { next_cursor: string } }>(
      `/api/v1/tenants/${DEMO}/activity?limit=5`,
    );
    const before = await nordImplementation("req-k-13-4");
    await updateImplementation(DEMO, before.id, before.version, { status: "partial" });

    const second = await apiGet<{ items: { id: string }[] }>(
      `/api/v1/tenants/${DEMO}/activity?limit=5&cursor=${encodeURIComponent(first.page.next_cursor)}`,
    );

    const firstIds = first.items.map((entry) => entry.id);
    expect(second.items.some((entry) => firstIds.includes(entry.id))).toBe(false);
    expect(second.items[0]?.id).toBe("ac-10");
  });

  it.each([
    ["an invalid Activity Log limit", "activity?limit=0", "invalid_pagination"],
    ["an unknown ordering", "implementations?ordering=title", "invalid_ordering"],
    ["an unknown status", "implementations?status=done", "invalid_filter"],
  ])("reject %s", async (_, path, code) => {
    await expect(failure(apiGet(`/api/v1/tenants/${DEMO}/${path}`))).resolves.toMatchObject({
      status: 400,
      code,
    });
  });

  it("log the simulated colleague's save that causes the conflict", async () => {
    const before = await nordImplementation("req-k-13-4");
    setSimulation({ conflictOnNextWrite: true });

    await failure(updateImplementation(DEMO, before.id, before.version, { status: "partial" }));

    const activity = await client().infiniteQuery(activityQuery(DEMO, { object_id: before.id }));
    expect(activity.pages[0]?.items[0]).toMatchObject({ actor_id: "u-becker", action: "updated" });
  });

  it("recognize a retry whose JSON keys arrive in another order, and mark it as replayed", async () => {
    const implementation = await nordImplementation("req-k-13-4");
    const path = `/api/v1/tenants/${DEMO}/implementations/${implementation.id}/evidence`;
    const send = (body: string) =>
      fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "k-order" },
        body,
      });

    const first = await send('{"kind":"link","title":"T","url":"https://a.example"}');
    const retry = await send('{"url":"https://a.example","title":"T","kind":"link"}');

    expect(retry.status).toBe(201);
    expect(retry.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await retry.json()).toEqual(await first.json());
  });

  it("keep Tenants and the fixtures apart: a write changes only its own Tenant", async () => {
    const before = await nordImplementation("req-k-13-4");
    const pristine = SEED.implementations.find((i) => i.id === before.id);

    await updateImplementation(DEMO, before.id, before.version, { status: "implemented" });

    expect(SEED.implementations.find((i) => i.id === before.id)).toEqual(pristine);
    const other = await client().query(implementationsQuery("wasserverband-musterland"));
    expect(other.items).toEqual([]);
  });
});

describe("read endpoints", () => {
  it("list members, Scopes by kind, and Assets by Scope", async () => {
    const query = client();

    const members = await query.query(membersQuery(DEMO));
    const facilities = await query.query(scopesQuery(DEMO, { kind: "critical_facility" }));
    const assets = await query.query(assetsQuery(DEMO, { scope: "sc-sued" }));

    expect(members.items.map((m) => m.role)).toContain("auditor");
    expect(facilities.items.map((s) => s.name)).toEqual(["Wasserwerk Nord", "Wasserwerk Süd"]);
    expect(assets.items.every((asset) => asset.scope_id === "sc-sued")).toBe(true);
  });

  it("answer 404 for unknown objects", async () => {
    const query = client();

    const reads = [
      query.query(scopeQuery(DEMO, "sc-x")),
      query.query(requirementQuery(DEMO, "req-x")),
      query.query(implementationQuery(DEMO, "im-x")),
      query.query(riskQuery(DEMO, "rk-x")),
      query.query(evidenceQuery(DEMO, "im-x")),
    ];
    for (const read of reads) {
      await expect(failure(read)).resolves.toMatchObject({ status: 404 });
    }
    await expect(failure(approveSuggestion(DEMO, "sug-x"))).resolves.toMatchObject({ status: 404 });
    await expect(failure(rejectSuggestion(DEMO, "sug-x"))).resolves.toMatchObject({ status: 404 });
    await expect(failure(removeEvidence(DEMO, "im-001", "ev-x"))).resolves.toMatchObject({
      status: 404,
    });
    await expect(
      failure(updateImplementation(DEMO, "im-x", 1, { status: "open" })),
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      failure(addEvidence(DEMO, "im-x", { kind: "link", title: "T", url: "https://a.b" }, "k")),
    ).resolves.toMatchObject({ status: 404 });
  });

  it("serve a Requirement, Frameworks and Hazards", async () => {
    const query = client();

    const requirement = await query.query(requirementQuery(DEMO, "req-k-13-4"));
    const frameworks = await query.query(frameworksQuery(DEMO));
    const hazards = await query.query(hazardsQuery(DEMO));

    expect(requirement.pending_legal_detail).not.toBeNull();
    expect(frameworks.items.map((f) => f.key)).toEqual(["kritis_dachg", "bsig"]);
    expect(new Set(hazards.items.map((h) => h.category))).toEqual(
      new Set(["natural", "technical", "human"]),
    );
  });

  it("filter Requirements by Framework Version and paragraph", async () => {
    const page = await client().query(
      requirementsQuery(DEMO, { framework_version: "fv-bsig-2025-12", paragraph: "§ 30" }),
    );

    expect(page.page.total).toBe(10);
  });

  it("filter and order Implementations", async () => {
    const query = client();

    const open = await query.query(
      implementationsQuery(DEMO, {
        framework_version: "fv-kritisdachg-2026-07",
        status: "open",
        ordering: "due_date",
        limit: 100,
      }),
    );
    const latest = await query.query(implementationsQuery(DEMO, { ordering: "-updated_at" }));

    expect(open.items.every((i) => i.status === "open" && i.scope_id !== "sc-org")).toBe(true);
    const dates = open.items.map((i) => i.due_date ?? "9999");
    expect(dates).toEqual([...dates].sort());
    const updated = latest.items.map((i) => i.updated_at);
    expect(updated).toEqual([...updated].sort().reverse());
  });

  it("list Risks of one Scope and filter Mappings by source", async () => {
    const query = client();

    const risks = await query.query(risksQuery(DEMO, { scope: "sc-sued" }));
    const mappings = await query.query(mappingsQuery(DEMO, { source_requirement: "req-b-32-1" }));

    expect(risks.items.every((risk) => risk.scope_id === "sc-sued")).toBe(true);
    expect(mappings.items.map((m) => m.target_requirement_id)).toEqual(["req-k-18-1"]);
  });

  it("filter the Activity Log by object and reject a forged cursor", async () => {
    const entries = await apiGet<{ items: { object_id: string }[] }>(
      `/api/v1/tenants/${DEMO}/activity?object_id=ev-1`,
    );

    expect(entries.items.map((entry) => entry.object_id)).toEqual(["ev-1"]);
    await expect(
      failure(apiGet(`/api/v1/tenants/${DEMO}/activity?cursor=bm9wZQ`)),
    ).resolves.toMatchObject({ status: 400, code: "invalid_cursor" });
  });

  it("answer an unchanged save with the same version", async () => {
    const before = await nordImplementation("req-k-13-4");

    const after = await updateImplementation(DEMO, before.id, before.version, {
      status: before.status,
    });

    expect(after.version).toBe(before.version);
  });

  it("refuse to decide a rejected suggestion again", async () => {
    await rejectSuggestion(DEMO, "sug-3");

    await expect(failure(approveSuggestion(DEMO, "sug-3"))).resolves.toMatchObject({
      status: 409,
    });
  });
});
