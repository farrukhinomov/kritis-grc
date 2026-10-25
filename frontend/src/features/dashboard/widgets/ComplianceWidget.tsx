import { useQuery } from "@tanstack/react-query";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { complianceSummaryQuery } from "@/shared/api/compliance";
import type { ComplianceSummaryRow } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { duration, ease } from "@/shared/theme/motion";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

import { CountUp } from "../CountUp";
import { implementedPercent } from "../format";

/** One block per Scope: Critical Facilities first, as the KRITIS duties attach to them. */
function byScope(rows: ComplianceSummaryRow[]) {
  const scopes = new Map<string, ComplianceSummaryRow[]>();
  for (const row of rows.toSorted((a, b) => a.framework_name.localeCompare(b.framework_name))) {
    scopes.set(row.scope_id, [...(scopes.get(row.scope_id) ?? []), row]);
  }
  return [...scopes.values()].toSorted(
    ([a], [b]) =>
      Number(a?.scope_kind !== "critical_facility") - Number(b?.scope_kind !== "critical_facility"),
  );
}

export function ComplianceWidget() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const query = combine([useQuery(complianceSummaryQuery(tenant))] as const);

  return (
    <QueryContent
      query={query}
      rows={6}
      isEmpty={([summary]) => summary.rows.length === 0}
      empty={t("dashboard.compliance.empty")}
    >
      {([summary]) => (
        <div className="grc-compliance">
          {byScope(summary.rows).map((rows) => (
            <div key={rows[0]?.scope_id} className="grc-compliance-scope">
              <h3 className="grc-compliance-scope-name">{rows[0]?.scope_name}</h3>
              {rows.map((row) => (
                <ComplianceBar key={row.framework_id} row={row} />
              ))}
            </div>
          ))}
        </div>
      )}
    </QueryContent>
  );
}

/**
 * Only "implemented" counts toward the percentage; partial work shows as a lighter
 * segment beside it. Counting half of it would make a facility look further along than
 * an auditor would accept.
 */
function ComplianceBar({ row }: { row: ComplianceSummaryRow }) {
  const { t, i18n } = useTranslation();
  const { implemented, partial, open } = row.counts;
  const applicable = implemented + partial + open;
  const percent = implementedPercent(implemented, applicable);
  const share = (count: number) => (applicable === 0 ? 0 : (count / applicable) * 100);
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <div className="grc-compliance-row">
      <div className="grc-compliance-label">
        <span>{row.framework_name}</span>
        <strong className="grc-compliance-percent">
          <CountUp value={percent} format={(value) => `${number.format(value)} %`} />
        </strong>
      </div>
      <div
        role="progressbar"
        aria-label={`${row.scope_name} · ${row.framework_name}`}
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
