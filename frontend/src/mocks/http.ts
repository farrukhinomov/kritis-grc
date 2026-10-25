import { delay, http, HttpResponse, type PathParams } from "msw";

import type { FieldError } from "@/shared/api/client";
import type { Page } from "@/shared/api/types";

import { can, type Permission } from "@/shared/session/permissions";

import { currentSession } from "./accounts";
import { type TenantData, tenantData } from "./db";
import { getSimulation, LATENCIES } from "./simulation";

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  412: "Precondition Failed",
  422: "Unprocessable Content",
  428: "Precondition Required",
  503: "Service Unavailable",
};

/** An RFC 9457 Problem Details response with the stable `code` the UI translates. */
export function problem(status: number, code: string, detail: string, errors?: FieldError[]) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: TITLES[status] ?? "Error",
      status,
      detail,
      code,
      ...(errors ? { errors } : {}),
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

export const notFound = () => problem(404, "not_found", "No such resource in this tenant.");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function positiveInt(value: string | null, fallback: number): number | null {
  if (value === null) {
    return fallback;
  }
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * Page-number pagination as the backend does it: the limit is capped at 100 rather than
 * rejected, and a page past the end is simply empty.
 */
export function paginate<T>(items: readonly T[], url: URL): Page<T> | Response {
  const number = positiveInt(url.searchParams.get("page"), 1);
  const requested = positiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT);
  if (number === null || requested === null) {
    return problem(400, "invalid_pagination", "page and limit must be positive integers.");
  }
  const limit = Math.min(requested, MAX_LIMIT);
  const start = (number - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    page: { number, limit, total: items.length },
  };
}

export function listResponse(items: readonly unknown[], url: URL) {
  const page = paginate(items, url);
  return page instanceof Response ? page : HttpResponse.json(page);
}

export const etag = (version: number) => `"${String(version)}"`;

/** Adds the configured latency, and fails the request at the configured rate. */
async function simulate(): Promise<Response | undefined> {
  const { latency, failureRate } = getSimulation();
  if (LATENCIES[latency] > 0) {
    await delay(LATENCIES[latency]);
  }
  if (failureRate > 0 && Math.random() < failureRate) {
    return problem(503, "service_unavailable", "Simulated failure.");
  }
  return undefined;
}

export interface TenantContext {
  data: TenantData;
  params: Record<string, string>;
  request: Request;
  url: URL;
}

type Resolver = (context: TenantContext) => Response | Promise<Response>;

function stringParams(params: PathParams): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      Array.isArray(value) ? "" : String(value),
    ]),
  );
}

export const notAuthenticated = () =>
  problem(401, "not_authenticated", "Sign in to use this endpoint.");

/**
 * A route under `/api/v1/tenants/:tenant`. A Tenant without a Membership answers 404,
 * exactly like one that doesn't exist, so other Tenants' existence is never revealed.
 * Reads need `view`; every other method needs `change` unless the route says otherwise.
 * The role check comes before any lookup, so a refused write learns nothing about the
 * object it named.
 */
export function tenantRoute(
  method: "get" | "post" | "patch" | "delete",
  path: string,
  resolve: Resolver,
  permission: Permission = method === "get" ? "view" : "change",
) {
  return http[method](`/api/v1/tenants/:tenant${path}`, async ({ params, request }) => {
    const failure = await simulate();
    if (failure) {
      return failure;
    }
    const session = currentSession();
    if (!session) {
      return notAuthenticated();
    }
    const values = stringParams(params);
    const membership = session.memberships.find(({ tenant }) => tenant.slug === values.tenant);
    const data = tenantData(values.tenant ?? "");
    if (!membership || !data) {
      return notFound();
    }
    if (!can(membership.role, permission)) {
      return problem(403, "permission_denied", "Your role in this tenant does not allow this.");
    }
    return resolve({ data, params: values, request, url: new URL(request.url) });
  });
}

/** JSON with sorted keys, so the same content always gives the same text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_, nested: unknown) =>
    isRecord(nested)
      ? Object.fromEntries(Object.entries(nested).toSorted(([a], [b]) => a.localeCompare(b)))
      : nested,
  );
}

/** The request's JSON body, or undefined when it isn't valid JSON. */
export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
