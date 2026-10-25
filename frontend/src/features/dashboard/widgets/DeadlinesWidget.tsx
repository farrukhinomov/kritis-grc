import { useQuery } from "@tanstack/react-query";
import { Tag } from "antd";
import { useTranslation } from "react-i18next";

import { scopesQuery } from "@/shared/api/organization";
import { combine } from "@/shared/lib/combineQueries";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

import { CountUp } from "../CountUp";
import { daysUntil, formatDate } from "../format";

/** Enough to see what's next for both facilities without turning into a calendar. */
const SHOWN = 4;

export function DeadlinesWidget() {
  const { t, i18n } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const query = combine([useQuery(scopesQuery(tenant, { kind: "critical_facility" }))] as const);

  return (
    <QueryContent
      query={query}
      rows={4}
      isEmpty={([scopes]) => !scopes.items.some((scope) => scope.critical_facility)}
      empty={t("dashboard.deadlines.empty")}
    >
      {([scopes]) => {
        const deadlines = scopes.items
          .flatMap((scope) =>
            (scope.critical_facility?.deadlines ?? []).map((deadline) => ({
              ...deadline,
              key: `${scope.id} ${deadline.citation}`,
              facility: scope.name,
            })),
          )
          .toSorted((a, b) => a.due_date.localeCompare(b.due_date))
          .slice(0, SHOWN);
        return (
          <>
            <ul className="grc-widget-list">
              {deadlines.map((deadline) => {
                const days = daysUntil(deadline.due_date);
                return (
                  <li key={deadline.key} className="grc-deadline">
                    <span className="grc-deadline-days" data-overdue={days < 0}>
                      {days < 0 ? (
                        t("dashboard.deadlines.overdue", { count: -days })
                      ) : (
                        <CountUp
                          value={days}
                          format={(value) => t("dashboard.deadlines.inDays", { count: value })}
                        />
                      )}
                    </span>
                    <span className="grc-deadline-detail">
                      <strong>{deadline.citation} KRITIS-DachG</strong> · {deadline.facility}
                      <br />
                      {formatDate(deadline.due_date, i18n.language)}{" "}
                      {!deadline.binding && (
                        <Tag className="grc-deadline-projected">
                          {t("dashboard.deadlines.projected")}
                        </Tag>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {/* Planned Registrations only project deadlines. The explanation is written out,
              not hidden in a tooltip, so nobody takes the date as legally fixed. */}
            {deadlines.some((deadline) => !deadline.binding) && (
              <p className="grc-widget-note">{t("dashboard.deadlines.projectedHint")}</p>
            )}
          </>
        );
      }}
    </QueryContent>
  );
}
