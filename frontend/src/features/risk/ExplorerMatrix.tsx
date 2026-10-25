import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { riskMatrixQuery } from "@/shared/api/risk";
import type { RatingKind } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

import type { Cell } from "./useExplorerPlace";

const LEVELS = [1, 2, 3, 4] as const;

interface ExplorerMatrixProps {
  tenant: string;
  rating: RatingKind;
  scope: string | null;
  selected: Cell | null;
  onSelect: (cell: Cell | null) => void;
}

/**
 * Counts per cell for the chosen rating, from the server's aggregate. Every cell is a
 * toggle button: pressing one narrows the risks to it, pressing it again shows all.
 */
export function ExplorerMatrix({ tenant, rating, scope, selected, onSelect }: ExplorerMatrixProps) {
  const { t } = useTranslation();
  const query = combine([
    useQuery(riskMatrixQuery(tenant, { rating, ...(scope ? { scope } : {}) })),
  ] as const);

  return (
    <QueryContent
      query={query}
      rows={5}
      isEmpty={([matrix]) => matrix.total === 0}
      empty={t("dashboard.risks.empty")}
    >
      {([matrix]) => (
        <div className="grc-explorer-matrix-wrap">
          <table className="grc-explorer-matrix">
            <caption className="grc-visually-hidden">
              {t("risk.matrix.caption", { rating: t(`risk.ratings.${rating}`) })}
            </caption>
            <thead>
              <tr>
                <td className="grc-explorer-corner" />
                {LEVELS.map((likelihood) => (
                  <th key={likelihood} scope="col">
                    {likelihood}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEVELS.toReversed().map((impact) => (
                <tr key={impact}>
                  <th scope="row">{impact}</th>
                  {LEVELS.map((likelihood) => {
                    const cell = matrix.cells.find(
                      (item) => item.likelihood === likelihood && item.impact === impact,
                    );
                    const pressed =
                      selected?.likelihood === likelihood && selected.impact === impact;
                    const count = cell?.count ?? 0;
                    return (
                      <td key={likelihood}>
                        <button
                          type="button"
                          className={`grc-explorer-cell${cell ? ` grc-risk-${cell.worst_category}` : ""}`}
                          aria-pressed={pressed}
                          data-cell={`${String(likelihood)}-${String(impact)}`}
                          disabled={count === 0 && !pressed}
                          onClick={() => {
                            onSelect(pressed ? null : { likelihood, impact });
                          }}
                        >
                          <span className="grc-visually-hidden">
                            {cell
                              ? t("risk.matrix.cellLabelCategory", {
                                  likelihood,
                                  impact,
                                  count,
                                  category: t(`dashboard.riskCategories.${cell.worst_category}`),
                                })
                              : t("risk.matrix.cellLabel", { likelihood, impact, count })}
                          </span>
                          <span aria-hidden>{count > 0 ? count : ""}</span>
                          {cell && (
                            <span aria-hidden className="grc-explorer-cell-category">
                              {t(`dashboard.riskCategories.${cell.worst_category}`)}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="grc-explorer-axes" aria-hidden>
            {t("dashboard.matrix.axes")}
          </p>
          {matrix.pending > 0 && (
            <p className="grc-widget-note">
              {t("dashboard.risks.pending", { count: matrix.pending })}
            </p>
          )}
        </div>
      )}
    </QueryContent>
  );
}
