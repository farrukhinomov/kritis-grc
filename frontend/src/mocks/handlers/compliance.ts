import { HttpResponse } from "msw";

import type {
  ComplianceSummary,
  Evidence,
  FieldChange,
  Implementation,
  ImplementationChange,
  Mapping,
} from "@/shared/api/types";

import { ACTOR_ID, logActivity, nextId, type TenantData } from "../db";
import {
  canonicalJson,
  etag,
  jsonBody,
  listResponse,
  notFound,
  problem,
  tenantRoute,
} from "../http";
import { getSimulation, setSimulation } from "../simulation";
import { parseIfMatch, validateChange, validateEvidence } from "../validation";

const byParam = <T>(items: T[], value: string | null, key: (item: T) => string) =>
  value === null ? items : items.filter((item) => key(item) === value);

function label(data: TenantData, implementation: Implementation): string {
  const requirement = data.requirements.find((r) => r.id === implementation.requirement_id);
  const scope = data.scopes.find((s) => s.id === implementation.scope_id);
  return `${requirement?.citation ?? implementation.requirement_id} · ${scope?.name ?? ""}`;
}

function describeChanges(
  data: TenantData,
  before: Implementation,
  change: ImplementationChange,
): FieldChange[] {
  const name = (id: string | null) =>
    id === null ? null : (data.members.find((member) => member.id === id)?.display_name ?? id);
  return (Object.keys(change) as (keyof ImplementationChange)[])
    .filter((field) => change[field] !== before[field])
    .map((field) =>
      field === "owner_id"
        ? { field: "owner", from: name(before.owner_id), to: name(change.owner_id ?? null) }
        : { field, from: before[field] ?? null, to: change[field] ?? null },
    );
}

/** The member whose save the simulated conflict pretends happened first. */
const SIMULATED_COLLEAGUE_ID = "u-becker";

const STATUSES = new Set(["open", "partial", "implemented", "not_applicable"]);

const ORDERINGS: Record<string, (a: Implementation, b: Implementation) => number> = {
  due_date: (a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
  "-due_date": (a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""),
  updated_at: (a, b) => a.updated_at.localeCompare(b.updated_at),
  "-updated_at": (a, b) => b.updated_at.localeCompare(a.updated_at),
};

const implementationRoutes = [
  tenantRoute("get", "/implementations", ({ data, url }) => {
    const params = url.searchParams;
    const versionOf = (requirementId: string) =>
      data.requirements.find((r) => r.id === requirementId)?.framework_version_id ?? "";
    let items = byParam(data.implementations, params.get("scope"), (i) => i.scope_id);
    items = byParam(items, params.get("requirement"), (i) => i.requirement_id);
    items = byParam(items, params.get("owner"), (i) => i.owner_id ?? "");
    items = byParam(items, params.get("framework_version"), (i) => versionOf(i.requirement_id));
    // "any of" as a comma-separated list, the way Django filters read it.
    const statuses = params.get("status")?.split(",");
    if (statuses?.some((status) => !STATUSES.has(status))) {
      return problem(400, "invalid_filter", "Unknown status.");
    }
    if (statuses) {
      items = items.filter((i) => statuses.includes(i.status));
    }
    const orderingName = params.get("ordering");
    const ordering = orderingName === null ? undefined : ORDERINGS[orderingName];
    if (orderingName !== null && !ordering) {
      return problem(400, "invalid_ordering", "Unknown ordering.");
    }
    return listResponse(ordering ? items.toSorted(ordering) : items, url);
  }),

  tenantRoute("get", "/compliance-summary", ({ data, url }) => {
    const frameworkOf = (requirementId: string) => {
      const versionId = data.requirements.find((r) => r.id === requirementId)?.framework_version_id;
      return data.frameworks.find((f) => f.versions.some((v) => v.id === versionId))?.id ?? "";
    };
    const rows = new Map<string, ComplianceSummary>();
    for (const implementation of data.implementations) {
      const framework_id = frameworkOf(implementation.requirement_id);
      const key = `${implementation.scope_id} ${framework_id}`;
      const row = rows.get(key) ?? {
        scope_id: implementation.scope_id,
        framework_id,
        counts: { open: 0, partial: 0, implemented: 0, not_applicable: 0 },
      };
      row.counts[implementation.status] += 1;
      rows.set(key, row);
    }
    return listResponse([...rows.values()], url);
  }),

  tenantRoute("get", "/implementations/:id", ({ data, params }) => {
    const implementation = data.implementations.find((i) => i.id === params.id);
    return implementation
      ? HttpResponse.json(implementation, { headers: { ETag: etag(implementation.version) } })
      : notFound();
  }),

  tenantRoute("patch", "/implementations/:id", async ({ data, params, request }) => {
    // Read the body before looking at the stored version: everything after this line runs
    // without yielding, so two saves of the same version can't both pass the check.
    const body = await jsonBody(request);
    const index = data.implementations.findIndex((i) => i.id === params.id);
    const current = data.implementations[index];
    if (!current) {
      return notFound();
    }
    const expected = parseIfMatch(request.headers.get("If-Match"));
    if (expected === null) {
      return problem(428, "precondition_required", "Send If-Match with the version you edited.");
    }
    if (getSimulation().conflictOnNextWrite) {
      // As if someone else saved a moment earlier: the stored version moves on.
      setSimulation({ conflictOnNextWrite: false });
      data.implementations[index] = {
        ...current,
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };
      logActivity(
        data,
        {
          action: "updated",
          object_type: "implementation",
          object_id: current.id,
          object_label: label(data, current),
          changes: [],
        },
        SIMULATED_COLLEAGUE_ID,
      );
      return problem(412, "version_conflict", "Someone else changed this in the meantime.");
    }
    if (expected !== current.version) {
      return problem(412, "version_conflict", "Someone else changed this in the meantime.");
    }
    const result = validateChange(body, data);
    if (!result.ok) {
      return problem(422, "validation_error", "The change is not valid.", result.errors);
    }
    const changes = describeChanges(data, current, result.value);
    if (changes.length === 0) {
      return HttpResponse.json(current, { headers: { ETag: etag(current.version) } });
    }
    const updated: Implementation = {
      ...current,
      ...result.value,
      version: current.version + 1,
      updated_at: new Date().toISOString(),
    };
    data.implementations[index] = updated;
    logActivity(data, {
      action: "updated",
      object_type: "implementation",
      object_id: updated.id,
      object_label: label(data, updated),
      changes,
    });
    return HttpResponse.json(updated, { headers: { ETag: etag(updated.version) } });
  }),
];

const evidenceRoutes = [
  tenantRoute("get", "/implementations/:id/evidence", ({ data, params, url }) => {
    if (!data.implementations.some((i) => i.id === params.id)) {
      return notFound();
    }
    return listResponse(
      data.evidence.filter((evidence) => evidence.implementation_id === params.id),
      url,
    );
  }),

  tenantRoute("post", "/implementations/:id/evidence", async ({ data, params, request }) => {
    const implementationId = params.id ?? "";
    if (!data.implementations.some((i) => i.id === implementationId)) {
      return notFound();
    }
    const body = await jsonBody(request);
    const key = request.headers.get("Idempotency-Key");
    const fingerprint = `POST ${new URL(request.url).pathname} ${canonicalJson(body)}`;
    const replay = key === null ? undefined : data.idempotency.get(key);
    if (replay) {
      return replay.fingerprint === fingerprint
        ? HttpResponse.json(replay.body, {
            status: replay.status,
            headers: { "Idempotent-Replayed": "true" },
          })
        : problem(422, "idempotency_key_reused", "This key was already used for another request.");
    }
    const result = validateEvidence(body, implementationId, data);
    if (!result.ok) {
      return problem(422, "validation_error", "The Evidence is not valid.", result.errors);
    }
    const input = result.value;
    const evidence: Evidence = {
      id: nextId("ev"),
      implementation_id: implementationId,
      kind: input.kind,
      title: input.title.trim(),
      file:
        input.kind === "file"
          ? {
              name: input.file.name,
              size_bytes: input.file.size_bytes,
              content_type: input.file.content_type,
            }
          : null,
      url: input.kind === "link" ? input.url : null,
      referenced_implementation_id:
        input.kind === "reference" ? input.referenced_implementation_id : null,
      added_by_id: ACTOR_ID,
      added_at: new Date().toISOString(),
    };
    data.evidence.push(evidence);
    if (key !== null) {
      data.idempotency.set(key, { status: 201, body: evidence, fingerprint });
    }
    logActivity(data, {
      action: "created",
      object_type: "evidence",
      object_id: evidence.id,
      object_label: evidence.title,
      changes: [],
    });
    return HttpResponse.json(evidence, { status: 201 });
  }),

  tenantRoute("delete", "/implementations/:id/evidence/:evidenceId", ({ data, params }) => {
    const index = data.evidence.findIndex(
      (e) => e.id === params.evidenceId && e.implementation_id === params.id,
    );
    const [removed] = index === -1 ? [] : data.evidence.splice(index, 1);
    if (!removed) {
      return notFound();
    }
    logActivity(data, {
      action: "deleted",
      object_type: "evidence",
      object_id: removed.id,
      object_label: removed.title,
      changes: [],
    });
    return new HttpResponse(null, { status: 204 });
  }),
];

const catalogueRoutes = [
  tenantRoute("get", "/frameworks", ({ data, url }) => listResponse(data.frameworks, url)),

  tenantRoute("get", "/requirements", ({ data, url }) => {
    const params = url.searchParams;
    const search = params.get("search")?.trim().toLowerCase();
    let items = byParam(
      data.requirements,
      params.get("framework_version"),
      (r) => r.framework_version_id,
    );
    items = byParam(items, params.get("paragraph"), (r) => r.paragraph);
    if (search) {
      items = items.filter((r) =>
        [r.citation, r.title_de, r.title_en].some((text) => text.toLowerCase().includes(search)),
      );
    }
    return listResponse(items, url);
  }),

  tenantRoute("get", "/requirements/:id", ({ data, params }) => {
    const requirement = data.requirements.find((r) => r.id === params.id);
    return requirement ? HttpResponse.json(requirement) : notFound();
  }),

  tenantRoute("get", "/mappings", ({ data, url }) => {
    const params = url.searchParams;
    let items = byParam(
      data.mappings,
      params.get("target_requirement"),
      (m) => m.target_requirement_id,
    );
    items = byParam(items, params.get("source_requirement"), (m) => m.source_requirement_id);
    return listResponse(items, url);
  }),
];

const suggestionRoutes = [
  tenantRoute("get", "/mapping-suggestions", ({ data, url }) =>
    listResponse(
      byParam(data.mappingSuggestions, url.searchParams.get("status"), (s) => s.status),
      url,
    ),
  ),

  tenantRoute(
    "post",
    "/mapping-suggestions/:id/approve",
    ({ data, params }) => {
      const suggestion = data.mappingSuggestions.find((s) => s.id === params.id);
      if (!suggestion) {
        return notFound();
      }
      if (suggestion.status !== "pending") {
        return problem(409, "suggestion_already_decided", "This suggestion was already decided.");
      }
      suggestion.status = "approved";
      const mapping: Mapping = {
        id: nextId("map"),
        kind: "tenant",
        target_requirement_id: suggestion.target_requirement_id,
        source_requirement_id: suggestion.source_requirement_id,
        coverage: suggestion.coverage,
        justification_de: suggestion.rationale_de,
        gap_note_de: null,
        approved_by_id: ACTOR_ID,
        approved_at: new Date().toISOString(),
      };
      data.mappings.push(mapping);
      logActivity(data, {
        action: "approved",
        object_type: "mapping_suggestion",
        object_id: suggestion.id,
        object_label: `${suggestion.target_requirement_id} ← ${suggestion.source_requirement_id}`,
        changes: [{ field: "status", from: "pending", to: "approved" }],
      });
      return HttpResponse.json(mapping, { status: 201 });
    },
    "approve",
  ),

  tenantRoute(
    "post",
    "/mapping-suggestions/:id/reject",
    ({ data, params }) => {
      const suggestion = data.mappingSuggestions.find((s) => s.id === params.id);
      if (!suggestion) {
        return notFound();
      }
      if (suggestion.status !== "pending") {
        return problem(409, "suggestion_already_decided", "This suggestion was already decided.");
      }
      suggestion.status = "rejected";
      logActivity(data, {
        action: "rejected",
        object_type: "mapping_suggestion",
        object_id: suggestion.id,
        object_label: `${suggestion.target_requirement_id} ← ${suggestion.source_requirement_id}`,
        changes: [{ field: "status", from: "pending", to: "rejected" }],
      });
      return HttpResponse.json(suggestion);
    },
    "approve",
  ),
];

export const complianceHandlers = [
  ...catalogueRoutes,
  ...implementationRoutes,
  ...evidenceRoutes,
  ...suggestionRoutes,
];
