import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { risksQuery } from "@/shared/api/risk";
import { useCurrentMembership } from "@/shared/session/sessionContext";

import { combine } from "../combine";
import { WidgetContent } from "../Widget";
import { RiskChip } from "./riskLabels";

export const TOP_RISKS = 5;

export function TopRisksWidget() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const query = combine([
    useQuery(risksQuery(tenant, { ordering: "-residual_score", limit: TOP_RISKS })),
  ] as const);

  return (
    <WidgetContent
      query={query}
      rows={5}
      isEmpty={([risks]) => risks.items.length === 0}
      empty={t("dashboard.risks.empty")}
    >
      {([risks]) => (
        <ol className="grc-widget-list">
          {risks.items.map((risk) => (
            <li key={risk.id} className="grc-widget-row">
              {/* Risk titles are German in every UI language, like the statute texts. */}
              <span lang="de">{risk.title_de}</span>
              {risk.residual ? (
                <RiskChip category={risk.residual.category} score={risk.residual.score} />
              ) : (
                <span className="grc-widget-muted">{t("dashboard.risks.calculationPending")}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </WidgetContent>
  );
}
