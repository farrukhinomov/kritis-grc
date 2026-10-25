import { Alert, Button, Empty } from "antd";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { CombinedQuery } from "@/shared/lib/combineQueries";

import { WidgetSkeleton } from "./Skeletons";

interface QueryContentProps<T> {
  query: CombinedQuery<T>;
  /** Lines of the loading placeholder, roughly the content's height. */
  rows: number;
  isEmpty: (data: T) => boolean;
  empty: string;
  children: (data: T) => ReactNode;
}

/**
 * Loading, error, empty or content: every area that shows server data goes through the
 * same four states. A
 * failed refresh keeps the data already shown and says it may be outdated, instead of
 * replacing good numbers with an error.
 */
export function QueryContent<T>({ query, rows, isEmpty, empty, children }: QueryContentProps<T>) {
  const { t } = useTranslation();

  if (query.isError && query.data === undefined) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t("patterns.loadError")}
        action={
          <Button size="small" onClick={query.retry}>
            {t("errors.retry")}
          </Button>
        }
      />
    );
  }
  if (query.data === undefined) {
    return <WidgetSkeleton rows={rows} />;
  }
  return (
    <>
      {query.isError && (
        <p className="grc-query-stale">
          {t("patterns.stale")}{" "}
          <Button type="link" size="small" onClick={query.retry}>
            {t("errors.retry")}
          </Button>
        </p>
      )}
      {isEmpty(query.data) ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />
      ) : (
        children(query.data)
      )}
    </>
  );
}
