import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Navigate } from "react-router";

import { demoLogin, sessionKey, sessionQuery } from "@/shared/api/auth";
import { LOGIN_PATH } from "@/shared/session/paths";
import { PageSkeleton } from "@/shared/ui/patterns/Skeletons";

/**
 * The address a visitor of the public prototype opens. There is nothing to sign in to, as
 * the demo accounts are open to everyone, so entering means: sign in as the GRC Manager
 * unless somebody is already signed in (in this browser tab), and open the dashboard of the
 * Demo Tenant. If that doesn't work, the login page is the fallback, never a blank screen.
 */
export function DemoEntry() {
  const client = useQueryClient();
  const { data: session, isError: sessionFailed } = useQuery(sessionQuery);
  const { mutate: signIn, isError: signInFailed } = useMutation({ mutationFn: demoLogin });
  // The effect runs twice in development; one visit must sign in once.
  const started = useRef(false);

  useEffect(() => {
    if (session === null && !started.current) {
      started.current = true;
      // Per-call callbacks don't run once this page is gone: a visitor who has moved on to
      // the login page and chosen another role keeps that choice.
      signIn("grc_manager", {
        onSuccess: (opened) => {
          // A previous user's cached data must never show in the new session; the
          // session itself stays, so what is watching it never sees a gap.
          client.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== sessionKey[0] });
          client.setQueryData(sessionKey, opened);
        },
      });
    }
  }, [client, session, signIn]);

  const first = session?.memberships[0];
  if (first) {
    return <Navigate to={`/t/${encodeURIComponent(first.tenant.slug)}/dashboard`} replace />;
  }
  if (sessionFailed || signInFailed || session) {
    return <Navigate to={LOGIN_PATH} replace />;
  }
  return <PageSkeleton />;
}
