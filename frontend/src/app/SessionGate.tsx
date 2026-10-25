import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router";

import { sessionQuery } from "@/shared/api/auth";
import { LOGIN_PATH, RETURN_PARAM } from "@/shared/session/paths";
import { SessionContext } from "@/shared/session/sessionContext";
import { ErrorPanel } from "@/shared/ui/patterns/ErrorBoundary";
import { PageSkeleton } from "@/shared/ui/patterns/Skeletons";

/** Pages behind it always have a signed-in user; anyone else is sent to the login page. */
export function SessionGate() {
  const { data: session, isPending, isError, refetch } = useQuery(sessionQuery);
  const { pathname, search } = useLocation();

  if (isPending) {
    return <PageSkeleton />;
  }
  // Only a session that never loaded stops the app. A failed reload keeps the one it
  // has, as every other query does; a 401 still signs out, as it drops the session.
  if (isError && session === undefined) {
    return <ErrorPanel onRetry={() => void refetch()} />;
  }
  if (!session) {
    const next = new URLSearchParams({ [RETURN_PARAM]: `${pathname}${search}` });
    return <Navigate to={`${LOGIN_PATH}?${next.toString()}`} replace />;
  }
  return (
    <SessionContext value={session}>
      <Outlet />
    </SessionContext>
  );
}
