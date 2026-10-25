import { notifyManager, type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/shared/api/client";
import {
  approveSuggestion,
  rejectSuggestion,
  type SuggestionFilter,
} from "@/shared/api/compliance";
import { resourceKey } from "@/shared/api/keys";
import type { MappingSuggestion, Page } from "@/shared/api/types";
import { useSession } from "@/shared/session/sessionContext";

export type Decision = "approved" | "rejected";

export interface DecideVariables {
  suggestion: MappingSuggestion;
  decision: Decision;
}

interface DecideCallbacks {
  onDecided: (variables: DecideVariables) => void;
  onFailed: (error: Error, variables: DecideVariables) => void;
}

/**
 * Approves or rejects a Mapping Suggestion. Nothing changes before the server agrees: an
 * approval creates a Tenant Mapping, a statement about the Tenant, so it is never shown
 * as done before it is. Once the server confirms, every cached list is updated in one
 * step, which lets the card glide from one list into the other; the refetch afterwards
 * brings the server's own version. The callbacks run for every decision, not only the
 * latest, and don't wait for that refetch.
 */
export function useDecideSuggestion(tenant: string, { onDecided, onFailed }: DecideCallbacks) {
  const client = useQueryClient();
  const user = useSession().user;
  const suggestions = resourceKey(tenant, "mapping-suggestions");

  // One batch, so all lists render the change together: a card that left one list in
  // an earlier render than it reached the other would jump instead of glide.
  const updateLists = (
    change: (page: Page<MappingSuggestion>, filter: SuggestionFilter) => Page<MappingSuggestion>,
  ) => {
    notifyManager.batch(() => {
      for (const [key, page] of client.getQueriesData<Page<MappingSuggestion>>({
        queryKey: suggestions,
      })) {
        if (page) {
          client.setQueryData(key, change(page, filterOf(key)));
        }
      }
    });
  };

  return useMutation({
    mutationFn: async ({ suggestion, decision }: DecideVariables) => {
      await (decision === "approved"
        ? approveSuggestion(tenant, suggestion.id)
        : rejectSuggestion(tenant, suggestion.id));
    },
    onSuccess: (_, variables) => {
      const decided: MappingSuggestion = {
        ...variables.suggestion,
        status: variables.decision,
        decided_by_id: user.id,
        decided_by_name: user.display_name,
        decided_at: new Date().toISOString(),
      };
      updateLists((page, filter) => moved(page, filter, variables.suggestion.status, decided));
      onDecided(variables);
    },
    onError: (error, variables) => {
      // Someone else decided first; where it went is only known after the refetch. Taking
      // it out now keeps it from showing in two lists while they reload one by one.
      if (error instanceof ApiError && error.status === 409) {
        updateLists((page) => without(page, variables.suggestion.id));
      }
      onFailed(error, variables);
    },
    // Also after a failure: a 409 means the lists must show the current state. Not
    // awaited, so the feedback above never waits for three reloads.
    onSettled: () => {
      void client.invalidateQueries({ queryKey: suggestions });
      // An approval adds a Tenant Mapping, which the cockpit's references read.
      void client.invalidateQueries({ queryKey: resourceKey(tenant, "mappings") });
      void client.invalidateQueries({ queryKey: resourceKey(tenant, "activity") });
    },
  });
}

function filterOf(key: QueryKey): SuggestionFilter {
  const last = key.at(-1);
  return typeof last === "object" && last !== null ? last : {};
}

function without(page: Page<MappingSuggestion>, id: string): Page<MappingSuggestion> {
  const items = page.items.filter((item) => item.id !== id);
  return items.length < page.items.length
    ? { items, page: { ...page.page, total: page.page.total - 1 } }
    : page;
}

/**
 * One cached page after a decision. Every page of the list it left counts one fewer,
 * every page of the list it joined one more; it appears on top of that list's first page.
 */
function moved(
  page: Page<MappingSuggestion>,
  filter: SuggestionFilter,
  from: MappingSuggestion["status"],
  decided: MappingSuggestion,
): Page<MappingSuggestion> {
  const others = page.items.filter((item) => item.id !== decided.id);
  const joined = filter.status === decided.status;
  const left = filter.status === from;
  const items =
    joined && (filter.page ?? 1) === 1 ? [decided, ...others].slice(0, page.page.limit) : others;
  const total = page.page.total + (joined ? 1 : 0) - (left ? 1 : 0);
  return { items, page: { ...page.page, total } };
}
