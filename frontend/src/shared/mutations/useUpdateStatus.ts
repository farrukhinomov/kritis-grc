import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "@/shared/api/client";
import { implementationQuery, updateImplementation } from "@/shared/api/compliance";
import { resourceKey } from "@/shared/api/keys";
import type { Implementation, ImplementationStatus, Page } from "@/shared/api/types";

const PRECONDITION_FAILED = 412;

const isImplementation = (data: unknown, id: string): data is Implementation =>
  typeof data === "object" && data !== null && (data as Partial<Implementation>).id === id;

const isPage = (data: unknown): data is Page<unknown> =>
  typeof data === "object" &&
  data !== null &&
  Array.isArray((data as Partial<Page<unknown>>).items);

/** The cached data with one Implementation's status replaced; anything else unchanged. */
function withStatus(data: unknown, id: string, status: ImplementationStatus): unknown {
  if (isImplementation(data, id)) {
    return { ...data, status };
  }
  if (isPage(data)) {
    return { ...data, items: data.items.map((item) => withStatus(item, id, status)) };
  }
  return data;
}

/**
 * Changes the status at once on screen and saves it in the background. If the save
 * fails, every cached copy goes back to what it was, which the drawer shows; a 412 means
 * someone else saved first, and the user is told so instead of their change vanishing.
 * Afterwards Implementations, Risks and the Activity Log are fetched anew: the counts
 * and the Residual Rating follow the status, and the change has to appear in the history.
 */
export function useUpdateStatus(tenant: string, implementation: Implementation | undefined) {
  const client = useQueryClient();
  const [rolledBack, setRolledBack] = useState(false);
  const [conflict, setConflict] = useState(false);
  const implementations = resourceKey(tenant, "implementations");

  const mutation = useMutation({
    mutationFn: (status: ImplementationStatus) => {
      if (!implementation) {
        return Promise.reject(new Error("No Implementation to change."));
      }
      return updateImplementation(tenant, implementation.id, implementation.version, { status });
    },
    onMutate: async (status) => {
      setRolledBack(false);
      await client.cancelQueries({ queryKey: implementations });
      const snapshot: [QueryKey, unknown][] = client.getQueriesData({ queryKey: implementations });
      if (implementation) {
        client.setQueriesData({ queryKey: implementations }, (data: unknown) =>
          withStatus(data, implementation.id, status),
        );
      }
      return { snapshot };
    },
    onError: (error, _status, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        client.setQueryData(key, data);
      }
      setRolledBack(true);
      setConflict(error instanceof ApiError && error.status === PRECONDITION_FAILED);
    },
    onSuccess: (updated) => {
      client.setQueryData(implementationQuery(tenant, updated.id).queryKey, updated);
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: implementations }),
        client.invalidateQueries({ queryKey: resourceKey(tenant, "risks") }),
        // Shows each Asset's highest Residual Rating, which follows the status too.
        client.invalidateQueries({ queryKey: resourceKey(tenant, "dependency-graph") }),
        client.invalidateQueries({ queryKey: resourceKey(tenant, "activity") }),
      ]),
  });

  return {
    ...mutation,
    rolledBack,
    conflict,
    dismissConflict: () => {
      setConflict(false);
    },
  };
}
