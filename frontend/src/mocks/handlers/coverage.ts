import { HttpResponse } from "msw";

import type {
  CoverageCell,
  CoverageMatrix,
  CoverageRequirement,
  Framework,
} from "@/shared/api/types";

import type { TenantData } from "../db";
import { tenantRoute } from "../http";

/**
 * Which KRITIS-DachG Requirements the BSIG covers, as a grid of Requirement pairs. A cell
 * holds every Mapping between its two Requirements that applies to the Tenant: the
 * Platform's, and the Tenant's own once approved. It is rated by its strongest Mapping,
 * and it names the facilities whose Implementation already refers to the BSIG one as
 * Evidence, where one Implementation counts for both.
 */
function coverageMatrix(data: TenantData): CoverageMatrix {
  const requirementsOf = (key: Framework["key"]): CoverageRequirement[] => {
    const framework = data.frameworks.find((item) => item.key === key);
    const versions = new Set(framework?.versions.map((version) => version.id));
    return data.requirements
      .filter((item) => versions.has(item.framework_version_id))
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
      const sources = new Set(
        data.implementations
          .filter((item) => item.requirement_id === column.id)
          .map((item) => item.id),
      );
      const reused_in = data.implementations
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
        coverage: mappings.some((mapping) => mapping.coverage === "full") ? "full" : "partial",
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
