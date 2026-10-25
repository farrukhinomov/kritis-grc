import { HttpResponse } from "msw";

import type { Scope } from "@/shared/api/types";

import type { StoredScope } from "../seed";
import { deadlinesFor } from "../deadlines";
import { listResponse, notFound, tenantRoute } from "../http";

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

  tenantRoute("get", "/assets", ({ data, url }) => {
    const scope = url.searchParams.get("scope");
    return listResponse(
      data.assets.filter((asset) => scope === null || asset.scope_id === scope),
      url,
    );
  }),
];
