import { HttpResponse } from "msw";

import type { Scope } from "@/shared/api/types";

import { CRITICAL_SERVICES, checkApplicability, serviceFor } from "../applicability";
import { logActivity, nextId } from "../db";
import { deadlinesFor } from "../deadlines";
import { jsonBody, listResponse, notFound, problem, tenantRoute } from "../http";
import { idempotency } from "../idempotency";
import type { StoredScope } from "../seed";
import { validateNewFacility } from "../validation";

function present(scope: StoredScope): Scope {
  const facility = scope.critical_facility;
  return {
    ...scope,
    critical_facility: facility && {
      ...facility,
      deadlines: deadlinesFor(facility.registration),
    },
  };
}

export const organizationHandlers = [
  tenantRoute("get", "", ({ data }) => HttpResponse.json(data.tenant)),

  tenantRoute("get", "/members", ({ data, url }) => listResponse(data.members, url)),

  tenantRoute("get", "/scopes", ({ data, url }) => {
    const kind = url.searchParams.get("kind");
    const scopes = data.scopes.filter((scope) => kind === null || scope.kind === kind);
    return listResponse(scopes.map(present), url);
  }),

  tenantRoute("get", "/scopes/:id", ({ data, params }) => {
    const scope = data.scopes.find((candidate) => candidate.id === params.id);
    return scope ? HttpResponse.json(present(scope)) : notFound();
  }),

  tenantRoute("post", "/scopes", async ({ data, request }) => {
    const body = await jsonBody(request);
    const { replay, remember } = idempotency(data, request, body);
    if (replay) {
      return replay;
    }
    const result = validateNewFacility(body);
    if (!result.ok) {
      return problem(422, "validation_error", "The Critical Facility is not valid.", result.errors);
    }
    const input = result.value;
    const details = input.critical_facility;
    const scope: StoredScope = {
      id: nextId("sc"),
      name: input.name.trim(),
      kind: "critical_facility",
      critical_facility: {
        sector: details.sector,
        critical_service: details.critical_service,
        people_supplied: details.people_supplied,
        // The threshold is the law's, not the caller's, so the server sets it.
        threshold: serviceFor(details.sector, details.critical_service)?.threshold ?? 0,
        location: input.location.trim(),
        registration: { status: details.registration.status, date: details.registration.date },
      },
    };
    data.scopes.push(scope);
    const created = present(scope);
    remember(201, created);
    logActivity(data, {
      action: "created",
      object_type: "scope",
      object_id: scope.id,
      object_label: scope.name,
      changes: [],
    });
    return HttpResponse.json(created, { status: 201 });
  }),

  tenantRoute("get", "/critical-services", ({ url }) => listResponse([...CRITICAL_SERVICES], url)),

  tenantRoute("get", "/applicability-check", ({ url }) => {
    const params = url.searchParams;
    const definition = serviceFor(params.get("sector"), params.get("critical_service"));
    const raw = params.get("people_supplied") ?? "";
    const people = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (!definition || !Number.isSafeInteger(people)) {
      return problem(400, "invalid_filter", "Name a known Critical Service and a whole number.");
    }
    return HttpResponse.json(
      checkApplicability(definition, {
        sector: definition.sector,
        critical_service: definition.critical_service,
        people_supplied: people,
      }),
    );
  }),

  tenantRoute("get", "/assets", ({ data, url }) => {
    const scope = url.searchParams.get("scope");
    return listResponse(
      data.assets.filter((asset) => scope === null || asset.scope_id === scope),
      url,
    );
  }),
];
