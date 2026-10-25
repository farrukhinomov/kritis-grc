import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "antd";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { activityQuery } from "@/shared/api/activity";
import type { ActivityEntry, FieldChange, ImplementationStatus } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { formatDate, formatRelative } from "@/shared/lib/format";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

const PAGE_SIZE = 20;
const STATUSES = new Set<string>(["open", "partial", "implemented", "not_applicable"]);
const FIELDS = new Set(["status", "owner", "due_date", "note_de"]);

/** A changed value as the reader knows it: translated statuses and local dates. */
function display(change: FieldChange, value: string | null, t: TFunction, language: string) {
  if (value === null || value === "") {
    return t("history.empty");
  }
  if (change.field === "status" && STATUSES.has(value)) {
    return t(`implementationStatus.${value as ImplementationStatus}`);
  }
  if (change.field === "due_date") {
    return formatDate(value, language);
  }
  return value;
}

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
  const changes = entry.changes.filter((change) => FIELDS.has(change.field));

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
              {t(`history.fields.${change.field as "status"}`)}:{" "}
              {display(change, change.from, t, i18n.language)} →{" "}
              {display(change, change.to, t, i18n.language)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
