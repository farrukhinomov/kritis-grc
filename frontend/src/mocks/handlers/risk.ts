import { HttpResponse } from "msw";

import type { Risk } from "@/shared/api/types";

import type { TenantData } from "../db";
import { listResponse, notFound, tenantRoute } from "../http";
import { assess, rate } from "../riskMethod";
import type { StoredRisk } from "../seed";
import { getSimulation } from "../simulation";

/**
 * The Residual Rating is recalculated on every read from the current Implementation
 * statuses, as the risk engine does after each change. When the risk engine is
 * unreachable it is null, and the UI shows "calculation pending".
 */
function present(risk: StoredRisk, data: TenantData): Risk {
  const statusOf = (id: string) =>
    data.implementations.find((implementation) => implementation.id === id)?.status ?? "open";
  return {
    ...risk,
    inherent: rate(risk.inherent.likelihood, risk.inherent.impact),
    target: rate(risk.target.likelihood, risk.target.impact),
    residual: getSimulation().riskEngineDown
      ? null
      : assess(risk.inherent, risk.treatments, statusOf),
  };
}

export const riskHandlers = [
  tenantRoute("get", "/hazards", ({ data, url }) => listResponse(data.hazards, url)),

  tenantRoute("get", "/risks", ({ data, url }) => {
    const scope = url.searchParams.get("scope");
    const risks = data.risks.filter((risk) => scope === null || risk.scope_id === scope);
    return listResponse(
      risks.map((risk) => present(risk, data)),
      url,
    );
  }),

  tenantRoute("get", "/risks/:id", ({ data, params }) => {
    const risk = data.risks.find((candidate) => candidate.id === params.id);
    return risk ? HttpResponse.json(present(risk, data)) : notFound();
  }),
];
