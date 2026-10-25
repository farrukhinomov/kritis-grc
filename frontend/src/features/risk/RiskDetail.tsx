import { useQuery } from "@tanstack/react-query";
import { Alert, Button } from "antd";
import { useTranslation } from "react-i18next";

import { implementationQuery, requirementQuery } from "@/shared/api/compliance";
import { riskQuery } from "@/shared/api/risk";
import type { Risk, Treatment, TreatmentEffect } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { useUpdateStatus } from "@/shared/mutations/useUpdateStatus";
import { useCan } from "@/shared/session/sessionContext";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";
import { ResponsiveDrawer } from "@/shared/ui/patterns/ResponsiveDrawer";
import { StatusBadge } from "@/shared/ui/StatusBadge/StatusBadge";

import { RatingMatrix } from "./RatingMatrix";

export function RiskDetail({
  tenant,
  riskId,
  onClose,
}: {
  tenant: string;
  riskId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const query = combine([useQuery(riskQuery(tenant, riskId))] as const);

  return (
    <ResponsiveDrawer
      open
      onClose={onClose}
      width={560}
      title={<span lang="de">{query.data?.[0].title_de ?? t("risk.detail.title")}</span>}
    >
      <QueryContent query={query} rows={8} isEmpty={() => false} empty="">
        {([risk]) => <RiskContent tenant={tenant} risk={risk} />}
      </QueryContent>
    </ResponsiveDrawer>
  );
}

function RiskContent({ tenant, risk }: { tenant: string; risk: Risk }) {
  const { t, i18n } = useTranslation();
  const english = i18n.language === "en";

  return (
    <div className="grc-risk-detail">
      <dl className="grc-facts">
        <dt>{t("compliance.scope")}</dt>
        <dd>{risk.scope_name}</dd>
        <dt>{t("risk.table.hazard")}</dt>
        <dd>
          {english ? risk.hazard.name_en : risk.hazard.name_de} ·{" "}
          {t(`risk.hazardCategories.${risk.hazard.category}`)}
        </dd>
        <dt>{t("compliance.owner")}</dt>
        <dd>{risk.owner_name ?? t("compliance.unassigned")}</dd>
      </dl>

      <section aria-labelledby={`${risk.id}-ratings`}>
        <h3 id={`${risk.id}-ratings`} className="grc-drawer-subtitle">
          {t("risk.detail.ratings")}
        </h3>
        {/* A live region: when a Treatment takes effect, the new rating is announced. */}
        <div aria-live="polite">
          <RatingMatrix risk={risk} />
        </div>
        {!risk.residual && <Alert type="info" showIcon title={t("risk.detail.pending")} />}
      </section>

      <section aria-labelledby={`${risk.id}-assets`}>
        <h3 id={`${risk.id}-assets`} className="grc-drawer-subtitle">
          {t("risk.detail.assets")}
        </h3>
        {risk.assets.length === 0 ? (
          <p className="grc-meta">{t("risk.detail.noAssets")}</p>
        ) : (
          <ul className="grc-plain-list">
            {risk.assets.map((asset) => (
              <li key={asset.id}>
                {asset.name}{" "}
                <span className="grc-meta">· {t(`risk.criticality.${asset.criticality}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${risk.id}-treatments`}>
        <h3 id={`${risk.id}-treatments`} className="grc-drawer-subtitle">
          {t("risk.detail.treatments")}
        </h3>
        <ul className="grc-treatments">
          {risk.treatments.map((treatment) => (
            <TreatmentRow
              key={`${treatment.implementation_id}-${treatment.dimension}`}
              tenant={tenant}
              treatment={treatment}
              pending={!risk.residual}
              effect={risk.residual?.explanation.find(
                (item) =>
                  item.implementation_id === treatment.implementation_id &&
                  item.dimension === treatment.dimension,
              )}
            />
          ))}
        </ul>
        {risk.residual && (
          <p className="grc-meta">
            {t("risk.detail.method", { version: risk.residual.method_version })}
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * What a Treatment does now: fully, partly (partial work counts for half) or not yet.
 * Without a Residual Rating nothing is known about its effect, so it says so rather than
 * claiming an implemented Treatment does nothing.
 */
function TreatmentEffectText({
  applied,
  planned,
  dimension,
  pending,
}: {
  applied: number;
  planned: number;
  dimension: string;
  pending: boolean;
}) {
  const { t } = useTranslation();

  if (pending) {
    return t("risk.detail.effectPending");
  }
  if (applied >= planned) {
    return t("risk.detail.effectApplied", { count: planned, dimension });
  }
  if (applied > 0) {
    return t("risk.detail.effectPartial", { applied, count: planned, dimension });
  }
  return t("risk.detail.effectPlanned", { count: planned, dimension });
}

/**
 * One Treatment with what it does now: its Implementation, the planned effect and the
 * effect the risk engine applied. Marking the Implementation as implemented here is the
 * shortest way to see the Residual Rating follow.
 */
function TreatmentRow({
  tenant,
  treatment,
  effect,
  pending,
}: {
  tenant: string;
  treatment: Treatment;
  effect: TreatmentEffect | undefined;
  pending: boolean;
}) {
  const { t, i18n } = useTranslation();
  const canChange = useCan("change");
  const implementation = useQuery(implementationQuery(tenant, treatment.implementation_id)).data;
  const requirement = useQuery({
    ...requirementQuery(tenant, implementation?.requirement_id ?? ""),
    enabled: Boolean(implementation),
  }).data;
  const update = useUpdateStatus(tenant, implementation);
  const dimension = t(`risk.dimensions.${treatment.dimension}`);

  return (
    <li className="grc-treatment">
      <span className="grc-treatment-title">
        <strong>{requirement?.citation}</strong>{" "}
        {i18n.language === "en" ? requirement?.title_en : requirement?.title_de}
      </span>
      <span className="grc-treatment-effect">
        {implementation && <StatusBadge status={implementation.status} />}{" "}
        <TreatmentEffectText
          applied={effect?.levels_applied ?? 0}
          planned={treatment.levels}
          dimension={dimension}
          pending={pending}
        />
      </span>
      {canChange && implementation && implementation.status !== "implemented" && (
        <Button
          size="small"
          loading={update.isPending}
          onClick={() => {
            update.mutate("implemented");
          }}
        >
          {t("risk.detail.markImplemented")}
        </Button>
      )}
      {update.conflict ? (
        <Alert
          type="warning"
          showIcon
          title={t("drawer.conflict.title")}
          description={t("drawer.conflict.description")}
        />
      ) : (
        update.rolledBack && <Alert type="warning" showIcon title={t("drawer.rolledBack")} />
      )}
    </li>
  );
}
