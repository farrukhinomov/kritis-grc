import { HttpResponse } from "msw";

import type { RatingKind, Risk, RiskMatrix, RiskMatrixCell } from "@/shared/api/types";
import { RISK_CATEGORIES } from "@/shared/theme/semantic";

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
export function present(risk: StoredRisk, data: TenantData): Risk {
  const statusOf = (id: string) =>
    data.implementations.find((implementation) => implementation.id === id)?.status ?? "open";
  const hazard = data.hazards.find((item) => item.id === risk.hazard_id);
  return {
    ...risk,
    hazard: {
      id: risk.hazard_id,
      category: hazard?.category ?? "technical",
      name_de: hazard?.name_de ?? "",
      name_en: hazard?.name_en ?? "",
    },
    assets: risk.asset_ids.flatMap((id) => {
      const asset = data.assets.find((item) => item.id === id);
      return asset ? [{ id, name: asset.name, criticality: asset.criticality }] : [];
    }),
    owner_name: data.members.find((member) => member.id === risk.owner_id)?.display_name ?? null,
    scope_name: data.scopes.find((scope) => scope.id === risk.scope_id)?.name ?? "",
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
export function byResidualScore(a: Risk, b: Risk): number {
  if (a.residual && b.residual) {
    return b.residual.score - a.residual.score || b.inherent.score - a.inherent.score;
  }
  if (a.residual || b.residual) {
    return a.residual ? -1 : 1;
  }
  return b.inherent.score - a.inherent.score;
}

const RATINGS: readonly RatingKind[] = ["inherent", "residual", "target"];
const LEVELS = new Set(["1", "2", "3", "4"]);

/** The residual rating unless another is asked for; null for a name that doesn't exist. */
function ratingKind(value: string | null): RatingKind | null {
  return value === null ? "residual" : (RATINGS.find((rating) => rating === value) ?? null);
}

interface RiskListFilter {
  rating: RatingKind;
  category: string | null;
  likelihood: number | null;
  impact: number | null;
}

/** Invalid values are refused rather than ignored, so a typo never looks like a filter. */
function parseFilter(params: URLSearchParams): RiskListFilter | null {
  const rating = ratingKind(params.get("rating"));
  const category = params.get("category");
  const likelihood = params.get("likelihood");
  const impact = params.get("impact");
  // Only the residual rating can be missing; inherent and target are always set.
  const validCategory =
    category === null ||
    RISK_CATEGORIES.some((item) => item === category) ||
    (category === "pending" && rating === "residual");
  const validCell = [likelihood, impact].every((value) => value === null || LEVELS.has(value));
  if (!rating || !validCategory || !validCell) {
    return null;
  }
  return {
    rating,
    category,
    likelihood: likelihood === null ? null : Number(likelihood),
    impact: impact === null ? null : Number(impact),
  };
}

function matches(risk: Risk, filter: RiskListFilter): boolean {
  const value = risk[filter.rating];
  if (filter.category === "pending") {
    return value === null;
  }
  if (!value) {
    // An unrated risk can't be placed in a category or a cell.
    return filter.category === null && filter.likelihood === null && filter.impact === null;
  }
  return (
    (filter.category === null || value.category === filter.category) &&
    (filter.likelihood === null || value.likelihood === filter.likelihood) &&
    (filter.impact === null || value.impact === filter.impact)
  );
}

const inScope = (data: TenantData, scope: string | null) =>
  data.risks.filter((risk) => scope === null || risk.scope_id === scope);

export const riskHandlers = [
  tenantRoute("get", "/hazards", ({ data, url }) => listResponse(data.hazards, url)),

  tenantRoute("get", "/risks", ({ data, url }) => {
    const params = url.searchParams;
    const ordering = params.get("ordering");
    if (ordering !== null && ordering !== "-residual_score") {
      return problem(400, "invalid_ordering", "Unknown ordering.");
    }
    const filter = parseFilter(params);
    if (!filter) {
      return problem(400, "invalid_filter", "Unknown rating, category or cell.");
    }
    const asset = params.get("asset");
    const risks = inScope(data, params.get("scope"))
      .filter((risk) => asset === null || risk.asset_ids.includes(asset))
      .map((risk) => present(risk, data))
      .filter((risk) => matches(risk, filter));
    return listResponse(ordering === null ? risks : risks.toSorted(byResidualScore), url);
  }),

  tenantRoute("get", "/risk-matrix", ({ data, url }) => {
    const rating = ratingKind(url.searchParams.get("rating"));
    if (!rating) {
      return problem(400, "invalid_filter", "Unknown rating.");
    }
    const risks = inScope(data, url.searchParams.get("scope")).map((risk) => present(risk, data));
    const cells = new Map<string, RiskMatrixCell>();
    for (const risk of risks) {
      const value = risk[rating];
      if (!value) {
        continue;
      }
      const key = `${String(value.likelihood)} ${String(value.impact)}`;
      const cell = cells.get(key) ?? {
        likelihood: value.likelihood,
        impact: value.impact,
        count: 0,
        worst_category: value.category,
      };
      cell.count += 1;
      if (RISK_CATEGORIES.indexOf(value.category) > RISK_CATEGORIES.indexOf(cell.worst_category)) {
        cell.worst_category = value.category;
      }
      cells.set(key, cell);
    }
    const rated = [...cells.values()].reduce((sum, cell) => sum + cell.count, 0);
    return HttpResponse.json<RiskMatrix>({
      cells: [...cells.values()],
      pending: risks.length - rated,
      total: risks.length,
    });
  }),

  tenantRoute("get", "/risks/:id", ({ data, params }) => {
    const risk = data.risks.find((candidate) => candidate.id === params.id);
    return risk ? HttpResponse.json(present(risk, data)) : notFound();
  }),
];
