import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "antd";
import { useTranslation } from "react-i18next";

import { activityQuery } from "@/shared/api/activity";
import type { ActivityEntry } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { formatRelative } from "@/shared/lib/format";
import { ChangeText } from "@/shared/ui/activity/ChangeText";
import { isShownField } from "@/shared/ui/activity/changes";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

const PAGE_SIZE = 20;

export function HistoryPanel({
  tenant,
  implementationId,
}: {
  tenant: string;
  implementationId: string;
}) {
  const { t } = useTranslation();
  const history = useInfiniteQuery(
    activityQuery(tenant, { object_id: implementationId, limit: PAGE_SIZE }),
  );

  return (
    <QueryContent
      query={combine([history] as const)}
      rows={4}
      isEmpty={([data]) => (data.pages[0]?.items.length ?? 0) === 0}
      empty={t("history.none")}
    >
      {([data]) => (
        <div className="grc-drawer-panel">
          <ol aria-label={t("drawer.tabs.history")} className="grc-history">
            {data.pages
              .flatMap((page) => page.items)
              .map((entry) => (
                <HistoryEntry key={entry.id} entry={entry} />
              ))}
          </ol>
          {history.hasNextPage && (
            <Button
              loading={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {t("history.more")}
            </Button>
          )}
        </div>
      )}
    </QueryContent>
  );
}

function HistoryEntry({ entry }: { entry: ActivityEntry }) {
  const { t, i18n } = useTranslation();
  const changes = entry.changes.filter((change) => isShownField(change.field));

  return (
    <li className="grc-history-entry">
      <span>
        <strong>{entry.actor_name || t("dashboard.activity.unknownActor")}</strong>{" "}
        {t(`history.actions.${entry.action}`)}{" "}
        <time dateTime={entry.occurred_at} className="grc-meta">
          {formatRelative(entry.occurred_at, i18n.language)}
        </time>
      </span>
      {changes.length > 0 && (
        <ul className="grc-history-changes">
          {changes.map((change) => (
            <li key={change.field}>
              <ChangeText change={change} objectType={entry.object_type} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
