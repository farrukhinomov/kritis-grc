import { QueryClient } from "@tanstack/react-query";

import { apiGet } from "@/shared/api/client";
import { approveSuggestion } from "@/shared/api/compliance";
import {
  approvalsQuery,
  approveRiskAssessment,
  rejectRiskAssessment,
  riskAssessmentsQuery,
} from "@/shared/api/approvals";

import { setMockSession } from "./accounts";
import { ACTOR_ID, tenantData } from "./db";
import { SEED } from "./seed";

/** The approvals inbox and the Risk Assessment decisions, through the typed client. */

const DEMO = "muster-stadtwerke";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

describe("the approvals inbox", () => {
  it("lists pending Mapping Suggestions and submitted Risk Assessments, oldest first", async () => {
    const inbox = await client().query(approvalsQuery(DEMO));

    const kinds = inbox.items.map((item) => item.kind);
    expect(kinds.filter((kind) => kind === "mapping_suggestion")).toHaveLength(
      SEED.mappingSuggestions.length,
    );
    expect(inbox.items).toContainEqual(
      expect.objectContaining({
        kind: "risk_assessment",
        id: "ra-n-2026",
        submitted_by_name: "Deniz Yılmaz",
      }) as unknown,
    );
    const times = inbox.items.map((item) => item.submitted_at);
    expect(times).toEqual(times.toSorted());
    expect(inbox.total).toBe(inbox.items.length);
  });

  it("drops what was decided", async () => {
    await approveSuggestion(DEMO, "sug-1");

    const inbox = await client().query(approvalsQuery(DEMO));

    expect(inbox.items.map((item) => item.id)).not.toContain("sug-1");
  });

  it("is empty for an Auditor, who approves nothing", async () => {
    setMockSession("auditor");

    const inbox = await client().query(approvalsQuery(DEMO));

    expect(inbox).toEqual({ items: [], total: 0 });
  });
});

describe("a Risk Assessment", () => {
  it("is approved by someone other than its author, and is then due again in four years", async () => {
    const approved = await approveRiskAssessment(DEMO, "ra-n-2026");

    expect(approved).toMatchObject({
      status: "approved",
      decided_by_name: "Alex Kramer",
      next_due: "2030-10-20",
    });
    const list = await client().query(riskAssessmentsQuery(DEMO));
    expect(list.items.find((item) => item.id === "ra-n-2026")?.status).toBe("approved");
  });

  it("can't be approved by its own author", async () => {
    // The signed-in GRC Manager submitted this one.
    tenantData(DEMO)!.riskAssessments.find((item) => item.id === "ra-n-2026")!.submitted_by_id =
      ACTOR_ID;

    const error = await failure(approveRiskAssessment(DEMO, "ra-n-2026"));

    expect(error).toMatchObject({ status: 403, code: "own_submission" });
    const inbox = await client().query(approvalsQuery(DEMO));
    expect(inbox.items.map((item) => item.id)).not.toContain("ra-n-2026");
  });

  it("is rejected only with a reason", async () => {
    const error = await failure(rejectRiskAssessment(DEMO, "ra-n-2026", "  "));

    expect(error).toMatchObject({ status: 422, code: "validation_error" });
    const rejected = await rejectRiskAssessment(DEMO, "ra-n-2026", "Lieferkette fehlt.");
    expect(rejected).toMatchObject({ status: "rejected", decision_note_de: "Lieferkette fehlt." });
  });

  it("can't be decided twice", async () => {
    await approveRiskAssessment(DEMO, "ra-n-2026");

    const error = await failure(approveRiskAssessment(DEMO, "ra-n-2026"));

    expect(error).toMatchObject({ status: 409, code: "already_decided" });
  });

  it("can't be decided by an Auditor", async () => {
    setMockSession("auditor");

    const error = await failure(approveRiskAssessment(DEMO, "ra-n-2026"));

    expect(error).toMatchObject({ status: 403 });
  });

  it("refuses an unknown status filter", async () => {
    const error = await failure(apiGet(`/api/v1/tenants/${DEMO}/risk-assessments?status=x`));

    expect(error).toMatchObject({ status: 400, code: "invalid_filter" });
  });
});
