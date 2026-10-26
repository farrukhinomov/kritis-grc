import { queryOptions } from "@tanstack/react-query";

import { ApiError, apiGet, apiRequest, tenantPath } from "./client";
import { resourceKey } from "./keys";
import type {
  ComplianceSummary,
  CoverageMatrix,
  ParagraphSummary,
  Evidence,
  Framework,
  Implementation,
  ImplementationChange,
  ImplementationStatus,
  Mapping,
  MappingSuggestion,
  NewEvidence,
  Page,
  PageParams,
  Requirement,
  SuggestionStatus,
  UploadRequest,
  UploadSlot,
} from "./types";

export const frameworksQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "frameworks"),
    queryFn: ({ signal }) => apiGet<Page<Framework>>(tenantPath(tenant, ["frameworks"]), signal),
  });

export interface RequirementFilter extends PageParams {
  framework_version?: string;
  paragraph?: string;
  search?: string;
}

export const requirementsQuery = (tenant: string, filter: RequirementFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "requirements", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<Requirement>>(tenantPath(tenant, ["requirements"], { ...filter }), signal),
  });

export const requirementQuery = (tenant: string, id: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "requirements", id),
    queryFn: ({ signal }) => apiGet<Requirement>(tenantPath(tenant, ["requirements", id]), signal),
  });

export interface ImplementationFilter extends PageParams {
  scope?: string;
  framework_version?: string;
  requirement?: string;
  owner?: string;
  /** The paragraph of the Implementation's Requirement, such as "§ 13". */
  paragraph?: string;
  /** Several statuses match any of them. */
  status?: ImplementationStatus | readonly ImplementationStatus[];
  ordering?: "due_date" | "-due_date" | "updated_at" | "-updated_at";
}

export const implementationsQuery = (tenant: string, filter: ImplementationFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "implementations", filter),
    queryFn: ({ signal }) => {
      const { status, ...rest } = filter;
      // A comma-separated list, the form Django filters accept for "any of".
      // An empty list means no status filter, as for Django; "status=" would match nothing.
      const statuses = typeof status === "string" ? status : status?.join(",");
      const query = { ...rest, status: statuses === "" ? undefined : statuses };
      return apiGet<Page<Implementation>>(tenantPath(tenant, ["implementations"], query), signal);
    },
  });

export interface ParagraphFilter {
  framework_version: string;
  scope: string;
}

/** Paragraphs in statute order with their counts; the cockpit's first column. */
export const complianceParagraphsQuery = (tenant: string, filter: ParagraphFilter) =>
  queryOptions({
    queryKey: resourceKey(tenant, "implementations", "paragraphs", filter),
    queryFn: ({ signal }) =>
      apiGet<ParagraphSummary>(
        tenantPath(tenant, ["compliance-paragraphs"], { ...filter }),
        signal,
      ),
  });

/** Counted by the server, so the dashboard never pages through every Implementation. */
export const complianceSummaryQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "implementations", "summary"),
    queryFn: ({ signal }) =>
      apiGet<ComplianceSummary>(tenantPath(tenant, ["compliance-summary"]), signal),
  });

export const implementationQuery = (tenant: string, id: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "implementations", id),
    queryFn: ({ signal }) =>
      apiGet<Implementation>(tenantPath(tenant, ["implementations", id]), signal),
  });

/**
 * `version` is the one the user saw. If someone else saved in between, the server
 * answers 412 `version_conflict` instead of silently overwriting their change.
 */
export function updateImplementation(
  tenant: string,
  id: string,
  version: number,
  change: ImplementationChange,
): Promise<Implementation> {
  return apiRequest<Implementation>(tenantPath(tenant, ["implementations", id]), {
    method: "PATCH",
    body: change,
    ifMatch: version,
  });
}

export const evidenceQuery = (tenant: string, implementationId: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "implementations", implementationId, "evidence"),
    queryFn: ({ signal }) =>
      apiGet<Page<Evidence>>(
        tenantPath(tenant, ["implementations", implementationId, "evidence"]),
        signal,
      ),
  });

/**
 * Create the key once per user action, outside any retry loop: a retry with the same key
 * returns the first result instead of adding the Evidence twice.
 */
export function addEvidence(
  tenant: string,
  implementationId: string,
  evidence: NewEvidence,
  idempotencyKey: string,
): Promise<Evidence> {
  return apiRequest<Evidence>(
    tenantPath(tenant, ["implementations", implementationId, "evidence"]),
    { method: "POST", body: evidence, idempotencyKey },
  );
}

/** Part of the API contract: the server enforces both; the UI checks first to say why. */
export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;
export const EVIDENCE_FILE_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/** Issued for one file; the API checks its size and type before handing out the URL. */
export function requestUpload(
  tenant: string,
  file: UploadRequest,
  signal?: AbortSignal,
): Promise<UploadSlot> {
  return apiRequest<UploadSlot>(tenantPath(tenant, ["uploads"]), {
    method: "POST",
    body: file,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Sends the file straight to storage, bypassing the API, and reports progress between 0
 * and 1. XMLHttpRequest rather than fetch: fetch can't report upload progress.
 */
export function uploadFile(
  slot: UploadSlot,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Cancelled before it started: nothing may be sent.
    if (signal?.aborted) {
      reject(new DOMException("The upload was cancelled.", "AbortError"));
      return;
    }
    const request = new XMLHttpRequest();
    request.open("PUT", slot.upload_url);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(storageError(request));
      }
    };
    request.onerror = () => {
      reject(new ApiError(0, "network_error", "The upload did not reach storage."));
    };
    request.onabort = () => {
      reject(new DOMException("The upload was cancelled.", "AbortError"));
    };
    signal?.addEventListener(
      "abort",
      () => {
        request.abort();
      },
      { once: true },
    );
    request.send(file);
  });
}

function storageError(request: XMLHttpRequest): ApiError {
  try {
    const problem = JSON.parse(request.responseText) as { code?: unknown; detail?: unknown };
    return new ApiError(
      request.status,
      typeof problem.code === "string" ? problem.code : "upload_failed",
      typeof problem.detail === "string" ? problem.detail : "",
    );
  } catch {
    return new ApiError(request.status, "upload_failed", "");
  }
}

export function removeEvidence(
  tenant: string,
  implementationId: string,
  evidenceId: string,
): Promise<undefined> {
  return apiRequest<undefined>(
    tenantPath(tenant, ["implementations", implementationId, "evidence", evidenceId]),
    { method: "DELETE" },
  );
}

export interface MappingFilter extends PageParams {
  target_requirement?: string;
  source_requirement?: string;
}

export const mappingsQuery = (tenant: string, filter: MappingFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "mappings", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<Mapping>>(tenantPath(tenant, ["mappings"], { ...filter }), signal),
  });

/**
 * An aggregate of the server's: every applying Mapping as a KRITIS-DachG by BSIG grid. Kept
 * under the Mappings' key, so every change to a Mapping refreshes it as well.
 */
export const coverageMatrixQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "mappings", "coverage-matrix"),
    queryFn: ({ signal }) =>
      apiGet<CoverageMatrix>(tenantPath(tenant, ["coverage-matrix"]), signal),
  });

export interface SuggestionFilter extends PageParams {
  status?: SuggestionStatus;
}

export const mappingSuggestionsQuery = (tenant: string, filter: SuggestionFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "mapping-suggestions", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<MappingSuggestion>>(
        tenantPath(tenant, ["mapping-suggestions"], { ...filter }),
        signal,
      ),
  });

/** Approving turns the Suggestion into a Tenant Mapping, which the response returns. */
export function approveSuggestion(tenant: string, id: string): Promise<Mapping> {
  return apiRequest<Mapping>(tenantPath(tenant, ["mapping-suggestions", id, "approve"]), {
    method: "POST",
  });
}

export function rejectSuggestion(tenant: string, id: string): Promise<MappingSuggestion> {
  return apiRequest<MappingSuggestion>(tenantPath(tenant, ["mapping-suggestions", id, "reject"]), {
    method: "POST",
  });
}
