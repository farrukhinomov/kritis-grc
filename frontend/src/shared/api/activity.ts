import { infiniteQueryOptions } from "@tanstack/react-query";

import { apiGet, tenantPath } from "./client";
import { resourceKey } from "./keys";
import type { ActivityEntry, CursorPage } from "./types";

export interface ActivityFilter {
  object_id?: string;
  limit?: number;
}

/** Newest first; each page carries the cursor for the next, older one. */
export const activityQuery = (tenant: string, filter: ActivityFilter = {}) =>
  infiniteQueryOptions({
    queryKey: resourceKey(tenant, "activity", filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      apiGet<CursorPage<ActivityEntry>>(
        tenantPath(tenant, ["activity"], { ...filter, cursor: pageParam }),
        signal,
      ),
    getNextPageParam: (last) => last.page.next_cursor ?? undefined,
  });
