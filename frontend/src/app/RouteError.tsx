import { useNavigate } from "react-router";

import { ErrorPanel } from "@/shared/ui/patterns/ErrorBoundary";

/**
 * Shown in place of a page whose loading or rendering failed. Inside a Tenant it renders
 * within the shell, so navigation stays usable. Trying again reloads the page, which also
 * picks up a newer app version if a lazy-loaded chunk was missing after a deploy.
 */
export function RouteError() {
  const navigate = useNavigate();

  return <ErrorPanel onRetry={() => void navigate(0)} />;
}
