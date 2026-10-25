import { notifyManager, type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  approveSuggestion,
  rejectSuggestion,
  type SuggestionFilter,
} from "@/shared/api/compliance";
import { resourceKey } from "@/shared/api/keys";
import type { MappingSuggestion, Page } from "@/shared/api/types";
import { useSession } from "@/shared/session/sessionContext";

export type Decision = "approved" | "rejected";

interface DecideVariables {
  suggestion: MappingSuggestion;
  decision: Decision;
}

/**
 * Approves or rejects a Mapping Suggestion. Nothing changes before the server agrees: an
 * approval creates a Tenant Mapping, a statement about the Tenant, so it is never shown
 * as done before it is. Once the server confirms, every cached list is updated in one
 * step, which lets the card glide from one list into the other; the refetch afterwards
 * brings the server's own version.
 */
export function useDecideSuggestion(tenant: string) {
  const client = useQueryClient();
  const user = useSession().user;
  const suggestions = resourceKey(tenant, "mapping-suggestions");

  return useMutation({
    mutationFn: async ({ suggestion, decision }: DecideVariables) => {
      await (decision === "approved"
        ? approveSuggestion(tenant, suggestion.id)
        : rejectSuggestion(tenant, suggestion.id));
    },
    onSuccess: (_, { suggestion, decision }) => {
      const decided: MappingSuggestion = {
        ...suggestion,
        status: decision,
        decided_by_id: user.id,
        decided_by_name: user.display_name,
        decided_at: new Date().toISOString(),
      };
      // One batch, so both lists render the move together: a card that left one list in
      // an earlier render than it reached the other would jump instead of glide.
      notifyManager.batch(() => {
        for (const [key, page] of client.getQueriesData<Page<MappingSuggestion>>({
          queryKey: suggestions,
        })) {
          if (page) {
            client.setQueryData(key, moved(page, filterOf(key), decided));
          }
        }
      });
    },
    // Also after a failure: a 409 means someone else decided, and the lists must show it.
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: suggestions }),
        // An approval adds a Tenant Mapping, which the cockpit's references read.
        client.invalidateQueries({ queryKey: resourceKey(tenant, "mappings") }),
        client.invalidateQueries({ queryKey: resourceKey(tenant, "activity") }),
      ]),
  });
}

function filterOf(key: QueryKey): SuggestionFilter {
  const last = key.at(-1);
  return typeof last === "object" && last !== null ? last : {};
}

/** One cached page after the decision: without the Suggestion, or with it on top. */
function moved(
  page: Page<MappingSuggestion>,
  filter: SuggestionFilter,
  decided: MappingSuggestion,
): Page<MappingSuggestion> {
  const others = page.items.filter((item) => item.id !== decided.id);
  const removed = others.length < page.items.length;
  const added = filter.status === decided.status && (filter.page ?? 1) === 1;
  const items = added ? [decided, ...others].slice(0, page.page.limit) : others;
  return {
    items,
    page: { ...page.page, total: page.page.total - (removed ? 1 : 0) + (added ? 1 : 0) },
  };
}
