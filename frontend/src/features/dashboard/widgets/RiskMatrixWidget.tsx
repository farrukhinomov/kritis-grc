import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { riskMatrixQuery } from "@/shared/api/risk";
import { useCurrentMembership } from "@/shared/session/sessionContext";

import { combine } from "../combine";
import { WidgetContent } from "../Widget";

const LEVELS = [1, 2, 3, 4] as const;

export function RiskMatrixWidget() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const query = combine([useQuery(riskMatrixQuery(tenant))] as const);

  return (
    <WidgetContent
      query={query}
      rows={5}
      isEmpty={([matrix]) => matrix.total === 0}
      empty={t("dashboard.risks.empty")}
    >
      {([matrix]) => (
        <>
          <table className="grc-risk-matrix">
            <caption className="grc-visually-hidden">{t("dashboard.matrix.caption")}</caption>
            <thead>
              <tr>
                <td className="grc-risk-matrix-corner" />
                {LEVELS.map((likelihood) => (
                  <th key={likelihood} scope="col">
                    <span className="grc-visually-hidden">{t("dashboard.matrix.likelihood")} </span>
                    {likelihood}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEVELS.toReversed().map((impact) => (
                <tr key={impact}>
                  <th scope="row">
                    <span className="grc-visually-hidden">{t("dashboard.matrix.impact")} </span>
                    {impact}
                  </th>
                  {LEVELS.map((likelihood) => {
                    const cell = matrix.cells.find(
                      (item) => item.likelihood === likelihood && item.impact === impact,
                    );
                    return cell ? (
                      // The worst category colors the cell and is also written in it, so
                      // the meaning never depends on telling colors apart.
                      <td key={likelihood} className={`grc-risk-${cell.worst_category}`}>
                        {cell.count}
                        <span className="grc-risk-matrix-category">
                          {t(`dashboard.riskCategories.${cell.worst_category}`)}
                        </span>
                      </td>
                    ) : (
                      <td key={likelihood} />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="grc-risk-matrix-axes" aria-hidden>
            {t("dashboard.matrix.axes")}
          </p>
          {matrix.pending > 0 && (
            <p className="grc-widget-note">
              {t("dashboard.risks.pending", { count: matrix.pending })}
            </p>
          )}
        </>
      )}
    </WidgetContent>
  );
}
