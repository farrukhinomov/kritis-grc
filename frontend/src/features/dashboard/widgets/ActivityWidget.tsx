import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { activityQuery } from "@/shared/api/activity";
import { membersQuery } from "@/shared/api/organization";
import { useCurrentMembership } from "@/shared/session/sessionContext";

import { formatRelative } from "../format";
import { combine } from "../combine";
import { WidgetContent } from "../Widget";

const SHOWN = 5;

export function ActivityWidget() {
  const { t, i18n } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const query = combine([
    useInfiniteQuery(activityQuery(tenant, { limit: SHOWN })),
    useQuery(membersQuery(tenant)),
  ] as const);

  return (
    <WidgetContent
      query={query}
      rows={5}
      isEmpty={([activity]) => (activity.pages[0]?.items.length ?? 0) === 0}
      empty={t("dashboard.activity.empty")}
    >
      {([activity, members]) => (
        <ul className="grc-widget-list">
          {(activity.pages[0]?.items ?? []).map((entry) => {
            const actor =
              members.items.find((member) => member.id === entry.actor_id)?.display_name ??
              t("dashboard.activity.unknownActor");
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
    </WidgetContent>
  );
}
