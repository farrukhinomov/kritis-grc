import { Button, Result } from "antd";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";

/** What a failed area shows instead of its content; the rest of the page keeps working. */
export function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <Result
      status="warning"
      title={t("errors.title")}
      subTitle={t("errors.description")}
      extra={
        <Button icon={<AnimatedIcon preset="refresh" />} onClick={onRetry}>
          {t("errors.retry")}
        </Button>
      }
    />
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** When any of these change, a failed area tries again by itself (e.g. new filters). */
  resetKeys?: unknown[];
}

/**
 * Contains a rendering error to one area, such as a dashboard widget, so one broken
 * part never blanks the whole screen. "Try again" re-renders the area from scratch.
 */
export function ErrorBoundary({ children, resetKeys }: ErrorBoundaryProps) {
  return (
    <ReactErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => <ErrorPanel onRetry={resetErrorBoundary} />}
      {...(resetKeys ? { resetKeys } : {})}
    >
      {children}
    </ReactErrorBoundary>
  );
}
