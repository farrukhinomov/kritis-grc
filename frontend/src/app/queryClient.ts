import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/shared/api/client";

const MAX_RETRIES = 1;
const FIRST_SERVER_ERROR = 500;

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
  return new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry } },
  });
}
