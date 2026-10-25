import { useQuery } from "@tanstack/react-query";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { complianceSummaryQuery, frameworksQuery } from "@/shared/api/compliance";
import { scopesQuery } from "@/shared/api/organization";
import type { ComplianceSummary, Framework, Scope } from "@/shared/api/types";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { duration, ease } from "@/shared/theme/motion";

import { CountUp } from "../CountUp";
import { implementedPercent } from "../format";
import { combine } from "../combine";
import { WidgetContent } from "../Widget";

/** Critical Facilities first, as the KRITIS duties attach to them; the organization after. */
const byKind = (a: Scope, b: Scope) =>
  Number(a.kind !== "critical_facility") - Number(b.kind !== "critical_facility");

export function ComplianceWidget() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const query = combine([
    useQuery(complianceSummaryQuery(tenant)),
    useQuery(scopesQuery(tenant, { limit: 100 })),
    useQuery(frameworksQuery(tenant)),
  ] as const);

  return (
    <WidgetContent
      query={query}
      rows={6}
      isEmpty={([summary]) => summary.items.length === 0}
      empty={t("dashboard.compliance.empty")}
    >
      {([summary, scopes, frameworks]) => (
        <div className="grc-compliance">
          {scopes.items
            .filter((scope) => summary.items.some((row) => row.scope_id === scope.id))
            .toSorted(byKind)
            .map((scope) => (
              <div key={scope.id} className="grc-compliance-scope">
                <h3 className="grc-compliance-scope-name">{scope.name}</h3>
                {frameworks.items.map((framework) => {
                  const row = summary.items.find(
                    (item) => item.scope_id === scope.id && item.framework_id === framework.id,
                  );
                  return (
                    row && (
                      <ComplianceBar
                        key={framework.id}
                        scope={scope}
                        framework={framework}
                        row={row}
                      />
                    )
                  );
                })}
              </div>
            ))}
        </div>
      )}
    </WidgetContent>
  );
}

/**
 * Only "implemented" counts toward the percentage; partial work shows as a lighter
 * segment beside it. Counting half of it would make a facility look further along than
 * an auditor would accept.
 */
function ComplianceBar({
  scope,
  framework,
  row,
}: {
  scope: Scope;
  framework: Framework;
  row: ComplianceSummary;
}) {
  const { t, i18n } = useTranslation();
  const { implemented, partial, open } = row.counts;
  const applicable = implemented + partial + open;
  const percent = implementedPercent(implemented, applicable);
  const share = (count: number) => (applicable === 0 ? 0 : (count / applicable) * 100);
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <div className="grc-compliance-row">
      <div className="grc-compliance-label">
        <span>{framework.name}</span>
        <strong className="grc-compliance-percent">
          <CountUp value={percent} format={(value) => `${number.format(value)} %`} />
        </strong>
      </div>
      <div
        role="progressbar"
        aria-label={`${scope.name} · ${framework.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="grc-compliance-track"
      >
        {/* One transform for both segments: the fill grows from the left as a whole. */}
        <m.div
          className="grc-compliance-fill"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: duration.slow * 3, ease: ease.enter }}
        >
          <span
            className="grc-compliance-implemented"
            style={{ width: `${String(share(implemented))}%` }}
          />
          <span
            className="grc-compliance-partial"
            style={{ width: `${String(share(partial))}%` }}
          />
        </m.div>
      </div>
      <p className="grc-compliance-counts">
        {t("dashboard.compliance.counts", { implemented, applicable, partial })}
      </p>
    </div>
  );
}
