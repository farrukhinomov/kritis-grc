import { http, HttpResponse } from "msw";

import type {
  ComplianceSummary,
  ComplianceSummaryRow,
  Evidence,
  FieldChange,
  Implementation,
  ParagraphSummary,
  ParagraphSummaryRow,
  UploadSlot,
  ImplementationChange,
  Mapping,
  MappingSuggestion,
  RequirementRef,
  SuggestionStatus,
} from "@/shared/api/types";

import { ACTOR_ID, logActivity, nextId, type TenantData, tenantData } from "../db";
import { idempotency } from "../idempotency";
import type { StoredImplementation, StoredSuggestion } from "../seed";
import { etag, jsonBody, listResponse, notFound, problem, tenantRoute } from "../http";
import { getSimulation, setSimulation } from "../simulation";
import {
  parseIfMatch,
  validateChange,
  validateEvidence,
  validateUploadRequest,
} from "../validation";

const byParam = <T>(items: T[], value: string | null, key: (item: T) => string) =>
  value === null ? items : items.filter((item) => key(item) === value);

/** An Implementation as the API returns it, with its owner's name joined in. */
function present(data: TenantData, implementation: StoredImplementation): Implementation {
  const owner = data.members.find((member) => member.id === implementation.owner_id);
  return { ...implementation, owner_name: owner?.display_name ?? null };
}

/** "§ 8" before "§ 8a" before "§ 12": numbers compare as numbers, letters after them. */
export const byParagraph = (a: string, b: string) => a.localeCompare(b, "de", { numeric: true });

function label(data: TenantData, implementation: StoredImplementation): string {
  const requirement = data.requirements.find((r) => r.id === implementation.requirement_id);
  const scope = data.scopes.find((s) => s.id === implementation.scope_id);
  return `${requirement?.citation ?? implementation.requirement_id} · ${scope?.name ?? ""}`;
}

function describeChanges(
  data: TenantData,
  before: StoredImplementation,
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

const ORDERINGS: Record<string, (a: StoredImplementation, b: StoredImplementation) => number> = {
  due_date: (a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
  "-due_date": (a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""),
  updated_at: (a, b) => a.updated_at.localeCompare(b.updated_at),
  "-updated_at": (a, b) => b.updated_at.localeCompare(a.updated_at),
};

const implementationRoutes = [
  tenantRoute("get", "/implementations", ({ data, url }) => {
    const params = url.searchParams;
    const requirementOf = (id: string) => data.requirements.find((r) => r.id === id);
    const versionOf = (requirementId: string) =>
      requirementOf(requirementId)?.framework_version_id ?? "";
    let items = byParam(data.implementations, params.get("scope"), (i) => i.scope_id);
    items = byParam(items, params.get("requirement"), (i) => i.requirement_id);
    items = byParam(items, params.get("owner"), (i) => i.owner_id ?? "");
    items = byParam(items, params.get("framework_version"), (i) => versionOf(i.requirement_id));
    items = byParam(
      items,
      params.get("paragraph"),
      (i) => requirementOf(i.requirement_id)?.paragraph ?? "",
    );
    // "any of" as a comma-separated list, the way Django filters read it.
    const statusParam = params.get("status");
    const statuses = statusParam ? statusParam.split(",") : undefined;
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
    const sorted = ordering ? items.toSorted(ordering) : items;
    return listResponse(
      sorted.map((implementation) => present(data, implementation)),
      url,
    );
  }),

  tenantRoute("get", "/compliance-summary", ({ data }) => {
    const frameworkOf = (requirementId: string) => {
      const versionId = data.requirements.find((r) => r.id === requirementId)?.framework_version_id;
      return data.frameworks.find((f) => f.versions.some((v) => v.id === versionId));
    };
    const rows = new Map<string, ComplianceSummaryRow>();
    for (const implementation of data.implementations) {
      const framework = frameworkOf(implementation.requirement_id);
      const scope = data.scopes.find((s) => s.id === implementation.scope_id);
      if (!framework || !scope) {
        continue;
      }
      const key = `${scope.id} ${framework.id}`;
      const row = rows.get(key) ?? {
        scope_id: scope.id,
        scope_name: scope.name,
        scope_kind: scope.kind,
        framework_id: framework.id,
        framework_name: framework.name,
        counts: { open: 0, partial: 0, implemented: 0, not_applicable: 0 },
      };
      row.counts[implementation.status] += 1;
      rows.set(key, row);
    }
    return HttpResponse.json<ComplianceSummary>({ rows: [...rows.values()] });
  }),

  tenantRoute("get", "/compliance-paragraphs", ({ data, url }) => {
    const version = url.searchParams.get("framework_version");
    const scope = url.searchParams.get("scope");
    if (!version || !scope) {
      return problem(400, "missing_filter", "framework_version and scope are required.");
    }
    const rows = new Map<string, ParagraphSummaryRow>();
    for (const implementation of data.implementations) {
      const requirement = data.requirements.find((r) => r.id === implementation.requirement_id);
      if (implementation.scope_id !== scope || requirement?.framework_version_id !== version) {
        continue;
      }
      const row = rows.get(requirement.paragraph) ?? {
        paragraph: requirement.paragraph,
        requirement_count: data.requirements.filter(
          (r) => r.framework_version_id === version && r.paragraph === requirement.paragraph,
        ).length,
        counts: { open: 0, partial: 0, implemented: 0, not_applicable: 0 },
      };
      row.counts[implementation.status] += 1;
      rows.set(requirement.paragraph, row);
    }
    return HttpResponse.json<ParagraphSummary>({
      rows: [...rows.values()].toSorted((a, b) => byParagraph(a.paragraph, b.paragraph)),
    });
  }),

  tenantRoute("get", "/implementations/:id", ({ data, params }) => {
    const implementation = data.implementations.find((i) => i.id === params.id);
    return implementation
      ? HttpResponse.json(present(data, implementation), {
          headers: { ETag: etag(implementation.version) },
        })
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
      return HttpResponse.json(present(data, current), {
        headers: { ETag: etag(current.version) },
      });
    }
    const updated: StoredImplementation = {
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
    return HttpResponse.json(present(data, updated), {
      headers: { ETag: etag(updated.version) },
    });
  }),
];

/** Where the mock pretends the object store is; in production a separate origin. */
const STORAGE_ORIGIN = "/mock-storage";

/** Upload URLs live about five minutes, long enough for 20 MB on a slow connection. */
const UPLOAD_URL_LIFETIME_MS = 5 * 60_000;

/**
 * The type a file's first bytes reveal. The browser's type comes from the file name, so
 * a web page renamed to .pdf would pass a check that trusts it. DOCX and XLSX are both
 * ZIP containers and are told apart by the announced type only.
 */
function detectFileType(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) {
    return "application/pdf";
  }
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return "image/png";
  }
  if (starts(0xff, 0xd8, 0xff)) {
    return "image/jpeg";
  }
  if (starts(0x50, 0x4b, 0x03, 0x04)) {
    return "application/zip";
  }
  return null;
}

const uploadRoutes = [
  tenantRoute("post", "/uploads", async ({ data, request, params }) => {
    const result = validateUploadRequest(await jsonBody(request));
    if (!result.ok) {
      return problem(422, "validation_error", "The file can't be uploaded.", result.errors);
    }
    const id = nextId("up");
    const expiresAt = Date.now() + UPLOAD_URL_LIFETIME_MS;
    data.uploads.set(id, { announced: result.value, expiresAt, stored: null, used: false });
    return HttpResponse.json<UploadSlot>(
      {
        upload_id: id,
        upload_url: `${STORAGE_ORIGIN}/${params.tenant ?? ""}/${id}`,
        expires_at: new Date(expiresAt).toISOString(),
      },
      { status: 201 },
    );
  }),

  // Storage, not the API: the signed URL itself is the permission, so there is no session
  // check here, only whether the URL is known and still valid.
  http.put(`${STORAGE_ORIGIN}/:tenant/:id`, async ({ params, request }) => {
    const upload = tenantData(String(params.tenant))?.uploads.get(String(params.id));
    if (!upload) {
      return problem(404, "not_found", "No such upload.");
    }
    if (Date.now() > upload.expiresAt) {
      return problem(403, "upload_expired", "The upload URL has expired.");
    }
    // One PUT per URL: otherwise the file could be replaced after it was checked.
    if (upload.stored || upload.used) {
      return problem(409, "already_uploaded", "This upload URL has already been used.");
    }
    const body = await request.arrayBuffer();
    upload.stored = {
      size_bytes: body.byteLength,
      content_type: request.headers.get("Content-Type") ?? "",
      detected: detectFileType(new Uint8Array(body)),
    };
    return new HttpResponse(null, { status: 200 });
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
    const { replay, remember } = idempotency(data, request, body);
    if (replay) {
      return replay;
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
      file: input.kind === "file" ? (data.uploads.get(input.upload_id)?.announced ?? null) : null,
      url: input.kind === "link" ? input.url : null,
      referenced_implementation_id:
        input.kind === "reference" ? input.referenced_implementation_id : null,
      added_by_id: ACTOR_ID,
      added_at: new Date().toISOString(),
    };
    data.evidence.push(evidence);
    if (input.kind === "file") {
      // One upload backs one Evidence; reusing it would let two records share one file.
      const upload = data.uploads.get(input.upload_id);
      if (upload) {
        upload.used = true;
      }
    }
    remember(201, evidence);
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

const SUGGESTION_STATUSES: readonly SuggestionStatus[] = ["pending", "approved", "rejected"];

function requirementRef(data: TenantData, id: string): RequirementRef {
  const requirement = data.requirements.find((item) => item.id === id)!;
  const framework = data.frameworks.find((item) =>
    item.versions.some((version) => version.id === requirement.framework_version_id),
  );
  return {
    id: requirement.id,
    citation: requirement.citation,
    title_de: requirement.title_de,
    title_en: requirement.title_en,
    framework_name: framework?.name ?? "",
  };
}

/** A Suggestion as the API returns it, with both Requirements and the decider named. */
function presentSuggestion(data: TenantData, suggestion: StoredSuggestion): MappingSuggestion {
  return {
    ...suggestion,
    target: requirementRef(data, suggestion.target_requirement_id),
    source: requirementRef(data, suggestion.source_requirement_id),
    decided_by_id: suggestion.decided_by_id ?? null,
    decided_by_name:
      data.members.find((member) => member.id === suggestion.decided_by_id)?.display_name ?? null,
    decided_at: suggestion.decided_at ?? null,
  };
}

/**
 * Pending ones come first, in the order of the statute they would map to, as a reviewer
 * works through the law; decided ones follow with the latest decision first.
 */
function suggestionOrder(data: TenantData) {
  const position = (id: string) => data.requirements.findIndex((item) => item.id === id);
  return (a: StoredSuggestion, b: StoredSuggestion) => {
    if (a.decided_at && b.decided_at) {
      return b.decided_at.localeCompare(a.decided_at);
    }
    if (a.decided_at || b.decided_at) {
      return a.decided_at ? 1 : -1;
    }
    return position(a.target_requirement_id) - position(b.target_requirement_id);
  };
}

function decide(data: TenantData, id: string, status: "approved" | "rejected") {
  const suggestion = data.mappingSuggestions.find((item) => item.id === id);
  if (!suggestion) {
    return notFound();
  }
  if (suggestion.status !== "pending") {
    return problem(409, "suggestion_already_decided", "This suggestion was already decided.");
  }
  suggestion.status = status;
  suggestion.decided_by_id = ACTOR_ID;
  suggestion.decided_at = new Date().toISOString();
  logActivity(data, {
    action: status,
    object_type: "mapping_suggestion",
    object_id: suggestion.id,
    object_label: `${suggestion.target_requirement_id} ← ${suggestion.source_requirement_id}`,
    changes: [{ field: "status", from: "pending", to: status }],
  });
  return suggestion;
}

const suggestionRoutes = [
  tenantRoute("get", "/mapping-suggestions", ({ data, url }) => {
    const status = url.searchParams.get("status");
    if (status !== null && !SUGGESTION_STATUSES.some((item) => item === status)) {
      return problem(400, "invalid_filter", `Unknown status "${status}".`);
    }
    const items = byParam(data.mappingSuggestions, status, (s) => s.status)
      .toSorted(suggestionOrder(data))
      .map((suggestion) => presentSuggestion(data, suggestion));
    return listResponse(items, url);
  }),

  tenantRoute(
    "post",
    "/mapping-suggestions/:id/approve",
    ({ data, params }) => {
      const suggestion = decide(data, String(params.id), "approved");
      if (suggestion instanceof Response) {
        return suggestion;
      }
      const mapping: Mapping = {
        id: nextId("map"),
        kind: "tenant",
        target_requirement_id: suggestion.target_requirement_id,
        source_requirement_id: suggestion.source_requirement_id,
        coverage: suggestion.coverage,
        justification_de: suggestion.rationale_de,
        gap_note_de: null,
        approved_by_id: ACTOR_ID,
        approved_at: suggestion.decided_at ?? new Date().toISOString(),
      };
      data.mappings.push(mapping);
      return HttpResponse.json(mapping, { status: 201 });
    },
    "approve",
  ),

  tenantRoute(
    "post",
    "/mapping-suggestions/:id/reject",
    ({ data, params }) => {
      const suggestion = decide(data, String(params.id), "rejected");
      return suggestion instanceof Response
        ? suggestion
        : HttpResponse.json(presentSuggestion(data, suggestion));
    },
    "approve",
  ),
];

export const complianceHandlers = [
  ...catalogueRoutes,
  ...implementationRoutes,
  ...uploadRoutes,
  ...evidenceRoutes,
  ...suggestionRoutes,
];
