import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { activityQuery } from "@/shared/api/activity";
import { combine } from "@/shared/lib/combineQueries";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

import { formatRelative } from "@/shared/lib/format";

const SHOWN = 5;

export function ActivityWidget() {
  const { t, i18n } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const query = combine([useInfiniteQuery(activityQuery(tenant, { limit: SHOWN }))] as const);

  return (
    <QueryContent
      query={query}
      rows={5}
      isEmpty={([activity]) => (activity.pages[0]?.items.length ?? 0) === 0}
      empty={t("dashboard.activity.empty")}
    >
      {([activity]) => (
        <ul className="grc-widget-list">
          {(activity.pages[0]?.items ?? []).map((entry) => {
            const actor = entry.actor_name || t("dashboard.activity.unknownActor");
            return (
              <li key={entry.id} className="grc-widget-row">
                <span>
                  {t(`dashboard.activity.actions.${entry.action}`, {
                    actor,
                    object: entry.object_label,
                  })}
                </span>
                <time dateTime={entry.occurred_at} className="grc-widget-muted">
                  {formatRelative(entry.occurred_at, i18n.language)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </QueryContent>
  );
}
