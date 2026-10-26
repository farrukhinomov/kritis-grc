import { HttpResponse } from "msw";

import type {
  CoverageCell,
  CoverageMatrix,
  CoverageRequirement,
  Framework,
} from "@/shared/api/types";

import type { TenantData } from "../db";
import { tenantRoute } from "../http";

/** "§ 13 Abs. 3 Nr. 10" as numbers, so Nr. 10 follows Nr. 9 as in the statute. */
function statuteOrder(citation: string): number[] {
  return [...citation.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

function byStatute(a: string, b: string): number {
  const [left, right] = [statuteOrder(a), statuteOrder(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/**
 * Which KRITIS-DachG Requirements the BSIG covers, as a grid of Requirement pairs. A cell
 * holds every Mapping between its two Requirements that applies to the Tenant: the
 * Platform's, and the Tenant's own once approved. It is rated by its strongest Mapping.
 * One Implementation counts for both only where a full Mapping applies and the facility's
 * Implementation refers to an implemented BSIG one as Evidence: a partial Mapping leaves
 * part of the duty uncovered, and an unfinished Implementation proves nothing.
 */
function coverageMatrix(data: TenantData): CoverageMatrix {
  const requirementsOf = (key: Framework["key"]): CoverageRequirement[] => {
    const framework = data.frameworks.find((item) => item.key === key);
    // The version in force: the latest to take effect.
    const current = framework?.versions
      .toSorted((a, b) => a.effective_from.localeCompare(b.effective_from))
      .at(-1);
    return data.requirements
      .filter((item) => item.framework_version_id === current?.id)
      .toSorted((a, b) => byStatute(a.citation, b.citation))
      .map((item) => ({
        id: item.id,
        citation: item.citation,
        paragraph: item.paragraph,
        title_de: item.title_de,
        title_en: item.title_en,
        framework_key: key,
        framework_name: framework?.name ?? "",
      }));
  };
  const rows = requirementsOf("kritis_dachg");
  const columns = requirementsOf("bsig");
  const applying = data.mappings.filter(
    (mapping) => mapping.kind === "platform" || mapping.approved_by_id !== null,
  );

  const cells: CoverageCell[] = [];
  for (const row of rows) {
    for (const column of columns) {
      const mappings = applying
        .filter(
          (mapping) =>
            mapping.target_requirement_id === row.id && mapping.source_requirement_id === column.id,
        )
        // The Tenant's own judgement first, then the stronger coverage.
        .toSorted(
          (a, b) =>
            Number(b.kind === "tenant") - Number(a.kind === "tenant") ||
            Number(b.coverage === "full") - Number(a.coverage === "full"),
        );
      if (mappings.length === 0) {
        continue;
      }
      const full = mappings.some((mapping) => mapping.coverage === "full");
      const sources = new Set(
        data.implementations
          .filter((item) => item.requirement_id === column.id && item.status === "implemented")
          .map((item) => item.id),
      );
      const reused_in = (full ? data.implementations : [])
        .filter(
          (item) =>
            item.requirement_id === row.id &&
            data.evidence.some(
              (evidence) =>
                evidence.implementation_id === item.id &&
                evidence.kind === "reference" &&
                sources.has(evidence.referenced_implementation_id ?? ""),
            ),
        )
        .map((item) => ({
          scope_id: item.scope_id,
          scope_name: data.scopes.find((scope) => scope.id === item.scope_id)?.name ?? "",
        }))
        .toSorted((a, b) => a.scope_name.localeCompare(b.scope_name));
      cells.push({
        target_requirement_id: row.id,
        source_requirement_id: column.id,
        coverage: full ? "full" : "partial",
        mappings: mappings.map((mapping) => ({
          id: mapping.id,
          kind: mapping.kind,
          coverage: mapping.coverage,
          justification_de: mapping.justification_de,
          gap_note_de: mapping.gap_note_de,
        })),
        reused_in,
      });
    }
  }
  return {
    rows,
    columns,
    cells,
    totals: {
      cells: cells.length,
      full: cells.filter((cell) => cell.coverage === "full").length,
      partial: cells.filter((cell) => cell.coverage === "partial").length,
      reused: cells.filter((cell) => cell.reused_in.length > 0).length,
    },
  };
}

export const coverageHandlers = [
  tenantRoute("get", "/coverage-matrix", ({ data }) => HttpResponse.json(coverageMatrix(data))),
];
