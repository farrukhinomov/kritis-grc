/**
 * Thin HTTP client for the platform API.
 *
 * Requests go to the SPA's own origin under /api, so the session cookie and CSRF
 * protection work without any cross-origin setup. Errors arrive as RFC 9457 Problem
 * Details; callers branch on the stable `code`, and the UI translates it, so no
 * server-side wording ever reaches the user.
 */

const GENERIC_ERROR_CODE = "http_error";
const INVALID_RESPONSE_CODE = "invalid_response";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;

  constructor(status: number, code: string, detail: string) {
    super(`${String(status)} ${code}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

interface ProblemDetails {
  code?: unknown;
  detail?: unknown;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw await toApiError(response);
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

function isJson(response: Response): boolean {
  return response.headers.get("Content-Type")?.includes("json") ?? false;
}

async function toApiError(response: Response): Promise<ApiError> {
  const problem = await readProblem(response);
  const code = typeof problem.code === "string" ? problem.code : GENERIC_ERROR_CODE;
  const detail = typeof problem.detail === "string" ? problem.detail : response.statusText;
  return new ApiError(response.status, code, detail);
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
