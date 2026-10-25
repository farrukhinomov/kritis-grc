import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Empty } from "antd";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import { tenantKey } from "@/shared/api/keys";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { ErrorBoundary } from "@/shared/ui/patterns/ErrorBoundary";
import { WidgetSkeleton } from "@/shared/ui/patterns/Skeletons";

import type { CombinedQuery } from "./combine";

interface WidgetProps {
  title: string;
  /** Spans two columns on wide screens, for content that needs the width. */
  wide?: boolean;
  children: ReactNode;
}

/**
 * One dashboard card. It owns its error boundary, so a widget that fails to render
 * leaves the other five working.
 */
export function Widget({ title, wide = false, children }: WidgetProps) {
  const headingId = useId();
  const client = useQueryClient();
  const tenant = useCurrentMembership().tenant.slug;

  return (
    <section aria-labelledby={headingId} className={`grc-widget${wide ? " grc-widget-wide" : ""}`}>
      <h2 id={headingId} className="grc-widget-title">
        {title}
      </h2>
      {/* Re-rendering the same cached data would only fail again, so "Try again" drops
          it first. While this card shows its error, its own queries are the only ones of
          the Tenant nobody observes, so the other cards keep their data. */}
      <ErrorBoundary
        onReset={() =>
          void client.resetQueries({
            queryKey: tenantKey(tenant),
            predicate: (query) => query.getObserversCount() === 0,
          })
        }
      >
        {children}
      </ErrorBoundary>
    </section>
  );
}

interface WidgetContentProps<T> {
  query: CombinedQuery<T>;
  /** Lines of the loading placeholder, roughly the content's height. */
  rows: number;
  isEmpty: (data: T) => boolean;
  empty: string;
  children: (data: T) => ReactNode;
}

/**
 * Loading, error, empty or content: every widget goes through the same four states. A
 * failed refresh keeps the data already shown and says it may be outdated, instead of
 * replacing good numbers with an error.
 */
export function WidgetContent<T>({ query, rows, isEmpty, empty, children }: WidgetContentProps<T>) {
  const { t } = useTranslation();

  if (query.isError && query.data === undefined) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t("dashboard.loadError")}
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
        <p className="grc-widget-stale">
          {t("dashboard.stale")}{" "}
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
