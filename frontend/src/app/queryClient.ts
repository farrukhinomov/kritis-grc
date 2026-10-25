import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { sessionKey } from "@/shared/api/auth";
import { ApiError } from "@/shared/api/client";

const MAX_RETRIES = 1;
const FIRST_SERVER_ERROR = 500;
const UNAUTHORIZED = 401;

/**
 * One retry hides a brief network or server blip without making real outages slow to
 * show. Client errors (missing rights, unknown object, conflicts) are final: repeating
 * the request can't change the answer.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < FIRST_SERVER_ERROR) {
    return false;
  }
  return failureCount < MAX_RETRIES;
}

export function createQueryClient() {
  // The session is cached for good and only changes on login or logout. A 401 from any
  // request means it expired on the server, so it's dropped and the gate sends the user
  // to the login page instead of showing errors on every widget.
  const forgetExpiredSession = (error: unknown) => {
    if (error instanceof ApiError && error.status === UNAUTHORIZED) {
      client.setQueryData(sessionKey, null);
    }
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: forgetExpiredSession }),
    mutationCache: new MutationCache({ onError: forgetExpiredSession }),
    defaultOptions: { queries: { retry: shouldRetry } },
  });
  return client;
}
