import { HttpResponse } from "msw";

import type { ApprovalItem, RiskAssessment, RiskAssessmentStatus } from "@/shared/api/types";
import { addMonths } from "@/shared/lib/dates";
import { can } from "@/shared/session/permissions";

import { currentSession } from "../accounts";
import { logActivity, type TenantData } from "../db";
import { isRecord, jsonBody, listResponse, notFound, problem, tenantRoute } from "../http";
import type { StoredRiskAssessment } from "../seed";

const STATUSES: readonly RiskAssessmentStatus[] = ["submitted", "approved", "rejected"];
/** The law asks for a new Risk Assessment at least every four years. */
const VALID_MONTHS = 48;

const memberName = (data: TenantData, id: string | null) =>
  data.members.find((member) => member.id === id)?.display_name ?? null;

function present(data: TenantData, assessment: StoredRiskAssessment): RiskAssessment {
  return {
    ...assessment,
    scope_name: data.scopes.find((scope) => scope.id === assessment.scope_id)?.name ?? "",
    submitted_by_name: memberName(data, assessment.submitted_by_id) ?? "",
    decided_by_name: memberName(data, assessment.decided_by_id),
    next_due:
      assessment.status === "approved" ? addMonths(assessment.assessed_on, VALID_MONTHS) : null,
  };
}

/** The signed-in user, who decides; the inbox and the four-eyes rule both depend on it. */
const actor = () => currentSession()?.user.id ?? "";

/**
 * Everything the current user may approve: pending Mapping Suggestions and submitted Risk
 * Assessments they didn't submit themselves. An Auditor approves nothing. Oldest first,
 * so what has waited longest comes first.
 */
function inbox(data: TenantData, role: Parameters<typeof can>[0] | undefined): ApprovalItem[] {
  if (!role || !can(role, "approve")) {
    return [];
  }
  const suggestions: ApprovalItem[] = data.mappingSuggestions
    .filter((suggestion) => suggestion.status === "pending")
    .map((suggestion) => {
      const target = data.requirements.find((item) => item.id === suggestion.target_requirement_id);
      const source = data.requirements.find((item) => item.id === suggestion.source_requirement_id);
      return {
        kind: "mapping_suggestion",
        id: suggestion.id,
        title: `${target?.citation ?? ""} ${target?.title_de ?? ""}`.trim(),
        detail: `${source?.citation ?? ""} ${source?.title_de ?? ""}`.trim(),
        scope_id: null,
        submitted_by_name: null,
        submitted_at: suggestion.created_at,
      };
    });
  const assessments: ApprovalItem[] = data.riskAssessments
    .filter((item) => item.status === "submitted" && item.submitted_by_id !== actor())
    .map((item) => {
      const presented = present(data, item);
      return {
        kind: "risk_assessment",
        id: item.id,
        title: item.title_de,
        detail: presented.scope_name,
        scope_id: item.scope_id,
        submitted_by_name: presented.submitted_by_name,
        submitted_at: item.submitted_at,
      };
    });
  return [...suggestions, ...assessments].toSorted((a, b) =>
    a.submitted_at.localeCompare(b.submitted_at),
  );
}

/** Why an assessment can't be decided by the current user, or null when it can. */
function undecidable(data: TenantData, id: string) {
  const assessment = data.riskAssessments.find((item) => item.id === id);
  if (!assessment) {
    return notFound();
  }
  if (assessment.status !== "submitted") {
    return problem(409, "already_decided", "This Risk Assessment was already decided.");
  }
  // Four eyes: whoever wrote the assessment can't also be the one who approves it.
  if (assessment.submitted_by_id === actor()) {
    return problem(403, "own_submission", "A Risk Assessment can't be decided by its author.");
  }
  return null;
}

function decide(
  data: TenantData,
  id: string,
  status: "approved" | "rejected",
  note: string | null,
) {
  const blocked = undecidable(data, id);
  const assessment = data.riskAssessments.find((item) => item.id === id);
  if (blocked || !assessment) {
    return blocked ?? notFound();
  }
  assessment.status = status;
  assessment.decided_by_id = actor();
  assessment.decided_at = new Date().toISOString();
  assessment.decision_note_de = note;
  logActivity(
    data,
    {
      action: status,
      object_type: "risk_assessment",
      object_id: assessment.id,
      object_label: assessment.title_de,
      changes: [{ field: "status", from: "submitted", to: status }],
    },
    actor(),
  );
  return HttpResponse.json(present(data, assessment));
}

export const approvalHandlers = [
  tenantRoute("get", "/approvals", ({ data, params }) => {
    const role = currentSession()?.memberships.find(
      (membership) => membership.tenant.slug === params.tenant,
    )?.role;
    const items = inbox(data, role);
    return HttpResponse.json({ items, total: items.length });
  }),

  tenantRoute("get", "/risk-assessments", ({ data, url }) => {
    const status = url.searchParams.get("status");
    if (status !== null && !STATUSES.some((item) => item === status)) {
      return problem(400, "invalid_filter", `Unknown status "${status}".`);
    }
    const scope = url.searchParams.get("scope");
    const items = data.riskAssessments
      .filter(
        (item) =>
          (status === null || item.status === status) &&
          (scope === null || item.scope_id === scope),
      )
      .toSorted((a, b) => b.assessed_on.localeCompare(a.assessed_on))
      .map((item) => present(data, item));
    return listResponse(items, url);
  }),

  tenantRoute(
    "post",
    "/risk-assessments/:id/approve",
    ({ data, params }) => decide(data, String(params.id), "approved", null),
    "approve",
  ),

  tenantRoute(
    "post",
    "/risk-assessments/:id/reject",
    async ({ data, params, request }) => {
      // What can't be decided at all is said first; a missing reason only after that.
      const blocked = undecidable(data, String(params.id));
      if (blocked) {
        return blocked;
      }
      const body = await jsonBody(request);
      const note = isRecord(body) && typeof body.note_de === "string" ? body.note_de.trim() : "";
      if (note === "") {
        return problem(422, "validation_error", "Say why the assessment is rejected.", [
          { field: "note_de", code: "required" },
        ]);
      }
      return decide(data, String(params.id), "rejected", note);
    },
    "approve",
  ),
];
