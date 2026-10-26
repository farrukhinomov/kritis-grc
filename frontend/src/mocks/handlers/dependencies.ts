import { HttpResponse } from "msw";

import type { DependencyGraph, GraphAsset } from "@/shared/api/types";

import type { TenantData } from "../db";
import { notFound, problem, tenantRoute } from "../http";
import { byResidualScore, present } from "./risk";

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
    const highest = naming.toSorted(byResidualScore)[0]?.residual ?? null;
    return {
      ...asset,
      // Only what the graph holds, so every edge has both of its ends.
      depends_on: asset.depends_on.filter((id) => reached.has(id)),
      scope_name: data.scopes.find((item) => item.id === asset.scope_id)?.name ?? "",
      risks: {
        count: naming.length,
        highest: highest && {
          likelihood: highest.likelihood,
          impact: highest.impact,
          score: highest.score,
          category: highest.category,
        },
      },
    };
  });
  const needed = new Set(own.flatMap((asset) => asset.depends_on));
  return {
    scope: { id: scope.id, name: scope.name },
    roots: own.filter((asset) => !needed.has(asset.id)).map((asset) => asset.id),
    assets,
  };
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
