import "@/shared/ui/RiskChip/riskChip.css";

import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { assetsQuery } from "@/shared/api/organization";
import { risksQuery } from "@/shared/api/risk";
import type { Asset } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { ResponsiveDrawer } from "@/shared/ui/patterns/ResponsiveDrawer";
import { RiskChip } from "@/shared/ui/RiskChip/RiskChip";

interface AssetDetailProps {
  tenant: string;
  scopeId: string;
  assetId: string;
  onClose: () => void;
}

/** One Asset: what it is, what it depends on, what depends on it, and the risks naming it. */
export function AssetDetail({ tenant, scopeId, assetId, onClose }: AssetDetailProps) {
  const { t } = useTranslation();
  const query = combine([
    useQuery(assetsQuery(tenant, { scope: scopeId, limit: 100 })),
    useQuery(risksQuery(tenant, { asset: assetId, limit: 100 })),
  ] as const);
  const assets = query.data?.[0].items ?? [];
  const asset = assets.find((item) => item.id === assetId);

  return (
    <ResponsiveDrawer open onClose={onClose} title={asset?.name ?? t("facilities.asset")}>
      <QueryContent
        query={query}
        rows={6}
        isEmpty={() => !asset}
        empty={t("facilities.unknownAsset")}
      >
        {([, risks]) =>
          asset && (
            <div className="grc-asset-detail">
              <p>{asset.description}</p>
              <dl className="grc-facts">
                <dt>{t("facilities.kind")}</dt>
                <dd>{t(`facilities.assetKinds.${asset.kind}`)}</dd>
                <dt>{t("facilities.criticality")}</dt>
                <dd>{t(`risk.criticality.${asset.criticality}`)}</dd>
              </dl>
              <AssetLinks
                title={t("facilities.dependsOn")}
                assets={assets.filter((item) => asset.depends_on.includes(item.id))}
              />
              <AssetLinks
                title={t("facilities.neededBy")}
                assets={assets.filter((item) => item.depends_on.includes(asset.id))}
              />
              <section aria-labelledby={`${asset.id}-risks`}>
                <h3 id={`${asset.id}-risks`} className="grc-drawer-subtitle">
                  {t("facilities.risks")}
                </h3>
                {risks.items.length === 0 ? (
                  <p className="grc-meta">{t("facilities.noRisks")}</p>
                ) : (
                  <ul className="grc-plain-list">
                    {risks.items.map((risk) => (
                      <li key={risk.id} className="grc-asset-risk">
                        <span lang="de">{risk.title_de}</span>
                        {risk.residual ? (
                          <RiskChip category={risk.residual.category} score={risk.residual.score} />
                        ) : (
                          <span className="grc-meta">
                            {t("dashboard.risks.calculationPending")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )
        }
      </QueryContent>
    </ResponsiveDrawer>
  );
}

function AssetLinks({ title, assets }: { title: string; assets: Asset[] }) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="grc-drawer-subtitle">
        {title}
      </h3>
      {assets.length === 0 ? (
        <p className="grc-meta">{t("facilities.none")}</p>
      ) : (
        <ul className="grc-plain-list">
          {assets.map((item) => (
            <li key={item.id}>
              {item.name}{" "}
              <span className="grc-meta">· {t(`risk.criticality.${item.criticality}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
