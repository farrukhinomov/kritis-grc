/**
 * Thin HTTP client for the platform API.
 *
 * Requests go to the SPA's own origin under /api, so the session cookie and CSRF
 * protection work without any cross-origin setup. Errors arrive as RFC 9457 Problem
 * Details; callers branch on the stable `code`, and the UI translates it, so no
 * server-side wording ever reaches the user.
 *
 * This is the only module that talks HTTP; screens use the typed resource functions
 * built on it.
 */

const API_ROOT = "/api/v1";
const GENERIC_ERROR_CODE = "http_error";
const INVALID_RESPONSE_CODE = "invalid_response";
const NO_CONTENT = 204;

export interface FieldError {
  field: string;
  code: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly errors: FieldError[];

  constructor(status: number, code: string, detail: string, errors: FieldError[] = []) {
    super(`${String(status)} ${code}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.errors = errors;
  }
}

export type Query = Record<string, string | number | boolean | undefined>;

/** `/api/v1/tenants/{slug}/…` with every segment escaped and only the set parameters. */
export function tenantPath(slug: string, segments: readonly string[], query: Query = {}): string {
  const path = [API_ROOT, "tenants", slug, ...segments].map(encodeSegment).join("/");
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(name, String(value));
    }
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

function encodeSegment(segment: string, index: number): string {
  // The root is already a path; everything after it is data.
  return index === 0 ? segment : encodeURIComponent(segment);
}

interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** The resource version the change is based on; the server rejects a stale one. */
  ifMatch?: number;
  /** Lets the server recognize a retried create and answer it without creating twice. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.ifMatch !== undefined) {
    headers["If-Match"] = `"${String(options.ifMatch)}"`;
  }
  if (options.idempotencyKey !== undefined) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(path, {
    method: options.method,
    headers,
    credentials: "same-origin",
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === NO_CONTENT) {
    return undefined as T;
  }
  // A 200 that isn't JSON usually means the request never reached the API, e.g. a
  // missing proxy rule answering with the SPA's own index.html.
  if (!isJson(response)) {
    throw new ApiError(response.status, INVALID_RESPONSE_CODE, "Expected a JSON response.");
  }
  try {
    // The response shape is guaranteed by the API contract; generated types replace this
    // cast once the OpenAPI client exists.
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, INVALID_RESPONSE_CODE, "Malformed JSON response.");
  }
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: "GET", ...(signal ? { signal } : {}) });
}

function isJson(response: Response): boolean {
  return response.headers.get("Content-Type")?.includes("json") ?? false;
}

interface ProblemDetails {
  code?: unknown;
  detail?: unknown;
  errors?: unknown;
}

async function toApiError(response: Response): Promise<ApiError> {
  const problem = await readProblem(response);
  const code = typeof problem.code === "string" ? problem.code : GENERIC_ERROR_CODE;
  const detail = typeof problem.detail === "string" ? problem.detail : response.statusText;
  return new ApiError(response.status, code, detail, fieldErrors(problem.errors));
}

/** Keeps only well-formed entries: an error body must never crash the error handling. */
function fieldErrors(errors: unknown): FieldError[] {
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors.filter(
    (entry: unknown): entry is FieldError =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Partial<FieldError>).field === "string" &&
      typeof (entry as Partial<FieldError>).code === "string",
  );
}

async function readProblem(response: Response): Promise<ProblemDetails> {
  if (!isJson(response)) {
    return {};
  }
  try {
    return (await response.json()) as ProblemDetails;
  } catch {
    return {};
  }
}
