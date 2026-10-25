import { Alert, Button, Empty } from "antd";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

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

  return (
    <section aria-labelledby={headingId} className={`grc-widget${wide ? " grc-widget-wide" : ""}`}>
      <h2 id={headingId} className="grc-widget-title">
        {title}
      </h2>
      <ErrorBoundary>{children}</ErrorBoundary>
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

/** Loading, error, empty or content: every widget goes through the same four states. */
export function WidgetContent<T>({ query, rows, isEmpty, empty, children }: WidgetContentProps<T>) {
  const { t } = useTranslation();

  if (query.isError) {
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
  if (isEmpty(query.data)) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />;
  }
  return children(query.data);
}
