import "./activity.css";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Select } from "antd";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { activityQuery } from "@/shared/api/activity";
import type { ActivityAction, ActivityEntry } from "@/shared/api/types";
import { combine } from "@/shared/lib/combineQueries";
import { formatDateTime, formatRelative } from "@/shared/lib/format";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { ChangeText } from "@/shared/ui/activity/ChangeText";
import { isShownField } from "@/shared/ui/activity/changes";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryContent } from "@/shared/ui/patterns/QueryContent";

const PAGE_SIZE = 25;
const ALL = "all";
const OBJECT_TYPES = [
  "implementation",
  "evidence",
  "risk",
  "mapping",
  "mapping_suggestion",
  "risk_assessment",
  "scope",
  "tenant",
] as const;
type ObjectType = (typeof OBJECT_TYPES)[number];
const ACTIONS: readonly ActivityAction[] = [
  "created",
  "updated",
  "deleted",
  "approved",
  "rejected",
  "commented",
];

/**
 * The Tenant's Activity Log: every change, who made it and when, newest first. It is read
 * by cursor, as entries keep arriving at the top; more load on request or when the end
 * of the list scrolls into view. Filters are part of the URL, so a filtered view can be
 * shared or reloaded.
 */
export function ActivityPage() {
  const { t } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const [params, setParams] = useSearchParams();
  const type = OBJECT_TYPES.find((item) => item === params.get("type"));
  const action = ACTIONS.find((item) => item === params.get("action"));
  const log = useInfiniteQuery(
    activityQuery(tenant, {
      limit: PAGE_SIZE,
      ...(type ? { object_type: type } : {}),
      ...(action ? { action } : {}),
    }),
  );
  // Reaching the end of the list loads the next page; the button does the same for
  // keyboard users, where the observer isn't available, and as the retry after a
  // failure. One observer lives as long as the end marker and reads the current state,
  // so settling a fetch never starts the next one by itself.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = log;
  const latest = useRef({ ready: false, fetchNextPage });
  useEffect(() => {
    latest.current = {
      ready: hasNextPage && !log.isFetching && !log.isFetchNextPageError,
      fetchNextPage,
    };
  });
  const end = useCallback((node: HTMLDivElement | null) => {
    if (!node || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && latest.current.ready) {
        latest.current.ready = false;
        void latest.current.fetchNextPage();
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  const setFilter = (key: "type" | "action", value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === ALL) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  return (
    <>
      <PageHeader title={t("nav.activity")} description={t("activityLog.description")} />
      <div className="grc-activity-filters">
        <Select
          aria-label={t("activityLog.objectType")}
          className="grc-activity-select"
          value={type ?? ALL}
          options={[
            { value: ALL, label: t("activityLog.allTypes") },
            ...OBJECT_TYPES.map((item) => ({ value: item, label: t(`activityLog.types.${item}`) })),
          ]}
          onChange={(value: string) => {
            setFilter("type", value);
          }}
        />
        <Select
          aria-label={t("activityLog.action")}
          className="grc-activity-select"
          value={action ?? ALL}
          options={[
            { value: ALL, label: t("activityLog.allActions") },
            ...ACTIONS.map((item) => ({ value: item, label: t(`activityLog.actions.${item}`) })),
          ]}
          onChange={(value: string) => {
            setFilter("action", value);
          }}
        />
      </div>
      <QueryContent
        query={combine([log] as const)}
        rows={8}
        isEmpty={([data]) => (data.pages[0]?.items.length ?? 0) === 0}
        empty={type || action ? t("activityLog.emptyFiltered") : t("activityLog.empty")}
      >
        {([data]) => (
          <>
            <ol aria-label={t("nav.activity")} className="grc-activity-log">
              {data.pages
                .flatMap((page) => page.items)
                .map((entry) => (
                  <Entry key={entry.id} entry={entry} />
                ))}
            </ol>
            <div ref={end} />
            {hasNextPage && (
              <Button loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                {t("history.more")}
              </Button>
            )}
          </>
        )}
      </QueryContent>
    </>
  );
}

function Entry({ entry }: { entry: ActivityEntry }) {
  const { t, i18n } = useTranslation();
  const typeKey = OBJECT_TYPES.find((item: ObjectType) => item === entry.object_type);
  const changes = entry.changes.filter((change) => isShownField(change.field));

  return (
    <li className="grc-activity-entry">
      <span>
        <strong>{entry.actor_name || t("dashboard.activity.unknownActor")}</strong>{" "}
        {t(`history.actions.${entry.action}`)}:{" "}
        {typeKey && <span className="grc-meta">{t(`activityLog.types.${typeKey}`)} </span>}
        {entry.object_label}
      </span>
      {changes.length > 0 && (
        <ul className="grc-plain-list grc-activity-changes">
          {changes.map((change) => (
            <li key={change.field}>
              <ChangeText change={change} objectType={entry.object_type} />
            </li>
          ))}
        </ul>
      )}
      <time
        dateTime={entry.occurred_at}
        title={formatDateTime(entry.occurred_at, i18n.language)}
        className="grc-meta"
      >
        {formatRelative(entry.occurred_at, i18n.language)}
      </time>
    </li>
  );
}
