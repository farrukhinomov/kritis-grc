import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { risksQuery } from "@/shared/api/risk";
import type { Risk, RiskCategory } from "@/shared/api/types";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { RISK_CATEGORIES } from "@/shared/theme/semantic";

import { combine } from "../combine";
import { WidgetContent } from "../Widget";

const LEVELS = [1, 2, 3, 4] as const;

/** The most severe category in a cell colors it, so a single critical risk stands out. */
function worst(risks: Risk[]): RiskCategory | undefined {
  return risks
    .map((risk) => risk.residual?.category)
    .filter((category) => category !== undefined)
    .toSorted((a, b) => RISK_CATEGORIES.indexOf(b) - RISK_CATEGORIES.indexOf(a))[0];
}

export function RiskMatrixWidget() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const query = combine([useQuery(risksQuery(tenant, { limit: 100 }))] as const);

  return (
    <WidgetContent
      query={query}
      rows={5}
      isEmpty={([risks]) => risks.items.length === 0}
      empty={t("dashboard.risks.empty")}
    >
      {([risks]) => {
        const rated = risks.items.filter((risk) => risk.residual);
        const at = (likelihood: number, impact: number) =>
          rated.filter(
            (risk) => risk.residual?.likelihood === likelihood && risk.residual.impact === impact,
          );
        const pending = risks.items.length - rated.length;
        return (
          <>
            <table className="grc-risk-matrix">
              <caption className="grc-visually-hidden">{t("dashboard.matrix.caption")}</caption>
              <thead>
                <tr>
                  <td className="grc-risk-matrix-corner" />
                  {LEVELS.map((likelihood) => (
                    <th key={likelihood} scope="col">
                      <span className="grc-visually-hidden">
                        {t("dashboard.matrix.likelihood")}{" "}
                      </span>
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
                      const cell = at(likelihood, impact);
                      const category = worst(cell);
                      return (
                        <td
                          key={likelihood}
                          className={category ? `grc-risk-${category}` : undefined}
                          data-testid={`cell-${String(likelihood)}-${String(impact)}`}
                        >
                          {cell.length > 0 && cell.length}
                          {category && (
                            <span className="grc-visually-hidden">
                              {" "}
                              {t(`dashboard.riskCategories.${category}`)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="grc-risk-matrix-axes" aria-hidden>
              {t("dashboard.matrix.axes")}
            </p>
            {pending > 0 && (
              <p className="grc-widget-note">{t("dashboard.risks.pending", { count: pending })}</p>
            )}
          </>
        );
      }}
    </WidgetContent>
  );
}
