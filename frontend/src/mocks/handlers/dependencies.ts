import { HttpResponse } from "msw";

import type { DependencyGraph, GraphAsset, Rating, Risk } from "@/shared/api/types";

import type { TenantData } from "../db";
import { notFound, problem, tenantRoute } from "../http";
import { byResidualScore, present } from "./risk";

/**
 * The highest Residual Rating among an Asset's Risks. While any of them is still being
 * calculated the answer is unknown: the pending one may be the highest, and an Asset must
 * never look less threatened than it is.
 */
export function highestResidual(risks: Risk[]): Rating | null {
  if (risks.length === 0 || risks.some((risk) => !risk.residual)) {
    return null;
  }
  const highest = risks.toSorted(byResidualScore)[0]?.residual;
  return highest
    ? {
        likelihood: highest.likelihood,
        impact: highest.impact,
        score: highest.score,
        category: highest.category,
      }
    : null;
}

/** Everything reachable from `start` along the dependencies, `start` included. */
function closure(start: string, byId: Map<string, { depends_on: string[] }>): Set<string> {
  const reached = new Set([start]);
  const queue = [start];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const next of byId.get(id)?.depends_on ?? []) {
      if (byId.has(next) && !reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return reached;
}

/**
 * A Critical Facility's Assets and, across Scopes, everything they depend on, as one graph.
 * The overlay counts only the facility's own Risks: an Asset two facilities share is
 * threatened differently in each, and the other facility's Risks are not this one's.
 */
function dependencyGraph(data: TenantData, scopeId: string): DependencyGraph | null {
  const scope = data.scopes.find((item) => item.id === scopeId);
  if (!scope?.critical_facility) {
    return null;
  }
  const own = data.assets.filter((asset) => asset.scope_id === scope.id);
  const reached = new Map(own.map((asset) => [asset.id, asset]));
  // Breadth-first over the dependencies; the map makes a cycle end where it began.
  const queue = [...own];
  for (let asset = queue.shift(); asset; asset = queue.shift()) {
    for (const id of asset.depends_on) {
      const dependency = data.assets.find((item) => item.id === id);
      if (dependency && !reached.has(id)) {
        reached.set(id, dependency);
        queue.push(dependency);
      }
    }
  }
  const risks = data.risks
    .filter((risk) => risk.scope_id === scope.id)
    .map((risk) => present(risk, data));
  const assets = [...reached.values()].map((asset): GraphAsset => {
    const naming = risks.filter((risk) => risk.asset_ids.includes(asset.id));
    return {
      ...asset,
      // Only what the graph holds, so every edge has both of its ends.
      depends_on: asset.depends_on.filter((id) => reached.has(id)),
      scope_name: data.scopes.find((item) => item.id === asset.scope_id)?.name ?? "",
      risks: { count: naming.length, highest: highestResidual(naming) },
    };
  });
  const needed = new Set(own.flatMap((asset) => asset.depends_on));
  const roots = own.filter((asset) => !needed.has(asset.id)).map((asset) => asset.id);
  // Own Assets that only need each other in a cycle are needed by something, so none of
  // them is a root; the first by name starts each such group, or it would vanish.
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const covered = new Set(roots.flatMap((id) => [...closure(id, byId)]));
  for (const asset of own.toSorted((a, b) => a.name.localeCompare(b.name))) {
    if (!covered.has(asset.id)) {
      roots.push(asset.id);
      for (const id of closure(asset.id, byId)) {
        covered.add(id);
      }
    }
  }
  return { scope: { id: scope.id, name: scope.name }, roots, assets };
}

export const dependencyHandlers = [
  tenantRoute("get", "/dependency-graph", ({ data, url }) => {
    const scope = url.searchParams.get("scope");
    if (!scope) {
      return problem(400, "invalid_filter", "Name the Critical Facility in `scope`.");
    }
    const graph = dependencyGraph(data, scope);
    return graph ? HttpResponse.json(graph) : notFound();
  }),
];
