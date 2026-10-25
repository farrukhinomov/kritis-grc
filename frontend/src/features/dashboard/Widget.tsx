import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";

import { tenantKey } from "@/shared/api/keys";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { ErrorBoundary } from "@/shared/ui/patterns/ErrorBoundary";

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
