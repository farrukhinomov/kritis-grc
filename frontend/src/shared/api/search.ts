import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { apiGet, tenantPath } from "./client";
import { resourceKey } from "./keys";
import type { SearchResults } from "./types";

/** Shorter queries match nearly everything and tell the user nothing. */
export const MIN_SEARCH_LENGTH = 2;

export const searchQuery = (tenant: string, q: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "search", q),
    queryFn: ({ signal }) => apiGet<SearchResults>(tenantPath(tenant, ["search"], { q }), signal),
    // While the next query runs, the last results stay instead of flashing empty.
    placeholderData: keepPreviousData,
  });
