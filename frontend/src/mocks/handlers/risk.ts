import { HttpResponse } from "msw";

import type { Risk } from "@/shared/api/types";

import type { TenantData } from "../db";
import { listResponse, notFound, problem, tenantRoute } from "../http";
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

/**
 * Highest Residual Rating first. A risk the engine hasn't rated yet must not look
 * harmless, so unrated risks come last but in inherent order, never mixed in at zero.
 */
function byResidualScore(a: Risk, b: Risk): number {
  if (a.residual && b.residual) {
    return b.residual.score - a.residual.score || b.inherent.score - a.inherent.score;
  }
  if (a.residual || b.residual) {
    return a.residual ? -1 : 1;
  }
  return b.inherent.score - a.inherent.score;
}

export const riskHandlers = [
  tenantRoute("get", "/hazards", ({ data, url }) => listResponse(data.hazards, url)),

  tenantRoute("get", "/risks", ({ data, url }) => {
    const scope = url.searchParams.get("scope");
    const ordering = url.searchParams.get("ordering");
    if (ordering !== null && ordering !== "-residual_score") {
      return problem(400, "invalid_ordering", "Unknown ordering.");
    }
    const risks = data.risks
      .filter((risk) => scope === null || risk.scope_id === scope)
      .map((risk) => present(risk, data));
    return listResponse(ordering === null ? risks : risks.toSorted(byResidualScore), url);
  }),

  tenantRoute("get", "/risks/:id", ({ data, params }) => {
    const risk = data.risks.find((candidate) => candidate.id === params.id);
    return risk ? HttpResponse.json(present(risk, data)) : notFound();
  }),
];
