import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { risksQuery } from "@/shared/api/risk";
import { combine } from "@/shared/lib/combineQueries";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { RiskChip } from "@/shared/ui/RiskChip/RiskChip";

export const TOP_RISKS = 5;

export function TopRisksWidget() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const query = combine([
    useQuery(risksQuery(tenant, { ordering: "-residual_score", limit: TOP_RISKS })),
  ] as const);

  return (
    <QueryContent
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
    </QueryContent>
  );
}
