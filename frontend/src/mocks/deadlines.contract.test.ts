import { QueryClient } from "@tanstack/react-query";

import { approveRiskAssessment } from "@/shared/api/approvals";
import { deadlinesQuery } from "@/shared/api/organization";

import { tenantData } from "./db";

/** The timeline of legal deadlines, through the typed client. */

const DEMO = "muster-stadtwerke";
const EMPTY = "wasserverband-musterland";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("the deadlines", () => {
  it("list every legal deadline of every Critical Facility, soonest first", async () => {
    const result = await client().query(deadlinesQuery(DEMO));

    const dates = result.items.map((item) => item.due_date);
    expect(dates).toEqual(dates.toSorted());
    expect(new Set(result.items.map((item) => item.scope_name))).toEqual(
      new Set(["Wasserwerk Nord", "Wasserwerk Süd"]),
    );
    expect(result.items).toContainEqual({
      scope_id: "sc-nord",
      scope_name: "Wasserwerk Nord",
      citation: "§ 12",
      obligation: "risk_analysis",
      due_date: "2027-10-15",
      binding: false,
      basis: "planned_registration",
    });
  });

  it("include the renewal of an approved Risk Assessment, four years on", async () => {
    const result = await client().query(deadlinesQuery(DEMO));

    expect(result.items).toContainEqual({
      scope_id: "sc-sued",
      scope_name: "Wasserwerk Süd",
      citation: "§ 12",
      obligation: "risk_assessment_renewal",
      due_date: "2029-11-03",
      // Duties bind once the facility's Registration is confirmed; this one is planned.
      binding: false,
      basis: "approved_risk_assessment",
    });
  });

  it("bind once a Registration is confirmed", async () => {
    // Only the authority confirms a Registration, so no request of the app's can do it.
    const facility = tenantData(DEMO)!.scopes.find(
      (scope) => scope.id === "sc-nord",
    )!.critical_facility!;
    facility.registration = { status: "confirmed", date: "2027-01-31" };

    const result = await client().query(deadlinesQuery(DEMO));

    const nord = result.items.filter((item) => item.scope_id === "sc-nord");
    expect(nord.every((item) => item.binding && item.basis === "confirmed_registration")).toBe(
      true,
    );
    // Nine months after the last day of January is the last day of October.
    expect(nord[0]).toMatchObject({ citation: "§ 12", due_date: "2027-10-31" });
    expect(result.items.some((item) => item.scope_id === "sc-sued" && item.binding)).toBe(false);
  });

  it("renew from the latest approved Risk Assessment", async () => {
    const data = tenantData(DEMO)!;
    const approved = data.riskAssessments.find((item) => item.id === "ra-s-2025")!;
    // An older approval of the same facility no longer counts.
    data.riskAssessments.push({
      ...approved,
      id: "ra-n-2022",
      scope_id: "sc-nord",
      assessed_on: "2022-06-01",
    });
    await approveRiskAssessment(DEMO, "ra-n-2026");

    const result = await client().query(deadlinesQuery(DEMO));

    const renewals = result.items.filter((item) => item.obligation === "risk_assessment_renewal");
    expect(renewals.map((item) => [item.scope_id, item.due_date])).toEqual([
      ["sc-sued", "2029-11-03"],
      ["sc-nord", "2030-10-20"],
    ]);
  });

  it("are empty without a Critical Facility", async () => {
    const result = await client().query(deadlinesQuery(EMPTY));

    expect(result.items).toEqual([]);
  });
});
