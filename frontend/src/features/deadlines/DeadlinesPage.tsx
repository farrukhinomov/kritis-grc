import "./deadlines.css";

import { useQuery } from "@tanstack/react-query";
import { Tag } from "antd";
import { useTranslation } from "react-i18next";

import { deadlinesQuery } from "@/shared/api/organization";
import { useIsWideScreen } from "@/shared/lib/breakpoints";
import { combine } from "@/shared/lib/combineQueries";
import { localToday } from "@/shared/lib/dates";
import { daysUntil, formatDate } from "@/shared/lib/format";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

import { entryId } from "./entryId";
import { Timeline } from "./Timeline";

/**
 * Every legal deadline of every Critical Facility, as the server calculates them. Wide
 * screens add a timeline for the overview; the list below it carries every detail and is
 * the whole page on phones and for screen readers. Projected and binding deadlines differ
 * in shape and in words, never in color alone, because a projected date is not yet law.
 */
export function DeadlinesPage() {
  const { t, i18n } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const wide = useIsWideScreen();
  const query = combine([useQuery(deadlinesQuery(tenant))] as const);

  return (
    <>
      <PageHeader title={t("nav.deadlines")} description={t("deadlines.description")} />
      <QueryContent
        query={query}
        rows={6}
        isEmpty={([deadlines]) => deadlines.items.length === 0}
        empty={t("deadlines.empty")}
      >
        {([{ items }]) => (
          <div className="grc-deadlines">
            {items.some((item) => !item.binding) && (
              <p role="note" className="grc-deadlines-note">
                {t("dashboard.deadlines.projectedHint")}
              </p>
            )}
            {wide && <Timeline items={items} today={localToday()} />}
            <ol className="grc-plain-list grc-deadlines-list" aria-label={t("deadlines.list")}>
              {items.map((item) => {
                const days = daysUntil(item.due_date);
                return (
                  <li
                    key={entryId(item)}
                    id={entryId(item)}
                    // Reached from its timeline marker, so focus can land here.
                    tabIndex={-1}
                    className="grc-deadlines-entry"
                  >
                    <span
                      className="grc-deadline-marker"
                      data-binding={item.binding}
                      aria-hidden="true"
                    />
                    <div className="grc-deadlines-when">
                      <strong>{formatDate(item.due_date, i18n.language)}</strong>
                      <span className="grc-meta" data-overdue={days < 0}>
                        {days < 0
                          ? t("dashboard.deadlines.overdue", { count: -days })
                          : t("dashboard.deadlines.inDays", { count: days })}
                      </span>
                    </div>
                    <div className="grc-deadlines-what">
                      <p className="grc-deadlines-title">
                        <strong>{t("deadlines.citation", { citation: item.citation })}</strong>{" "}
                        {t(`deadlines.obligations.${item.obligation}`)}
                      </p>
                      <p className="grc-meta">
                        {item.scope_name} · {t(`deadlines.basis.${item.basis}`)}
                      </p>
                    </div>
                    <Tag className="grc-deadlines-tag" data-binding={item.binding}>
                      {item.binding ? t("deadlines.binding") : t("dashboard.deadlines.projected")}
                    </Tag>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </QueryContent>
    </>
  );
}
