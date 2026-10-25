import { HttpResponse } from "msw";

import type { ActivityAction, ActivityEntry, CursorPage } from "@/shared/api/types";

import { positiveInt, problem, tenantRoute } from "../http";

const DEFAULT_LIMIT = 20;
const ACTIONS: readonly ActivityAction[] = [
  "created",
  "updated",
  "deleted",
  "approved",
  "rejected",
  "commented",
];
const MAX_LIMIT = 100;

/**
 * The cursor names the last entry the client has seen, not a position: entries keep
 * arriving at the top, and a position would shift under the client and repeat rows.
 * It is opaque to clients.
 */
const encodeCursor = (id: string) => btoa(`after:${id}`);

function decodeCursor(cursor: string): string | null {
  try {
    return /^after:(.+)$/.exec(atob(cursor))?.[1] ?? null;
  } catch {
    return null;
  }
}

export const activityHandlers = [
  tenantRoute("get", "/activity", ({ data, url }) => {
    const requested = positiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT);
    if (requested === null) {
      return problem(400, "invalid_pagination", "limit must be a positive integer.");
    }
    const limit = Math.min(requested, MAX_LIMIT);
    const params = url.searchParams;
    const objectId = params.get("object_id");
    const objectType = params.get("object_type");
    const action = params.get("action");
    if (action !== null && !ACTIONS.some((item) => item === action)) {
      return problem(400, "invalid_filter", `Unknown action "${action}".`);
    }
    const newestFirst = data.activity
      .filter(
        (entry) =>
          (objectId === null || entry.object_id === objectId) &&
          (objectType === null || entry.object_type === objectType) &&
          (action === null || entry.action === action),
      )
      .toReversed();

    let start = 0;
    const cursor = url.searchParams.get("cursor");
    if (cursor !== null) {
      const lastSeen = decodeCursor(cursor);
      const index = newestFirst.findIndex((entry) => entry.id === lastSeen);
      if (index === -1) {
        return problem(400, "invalid_cursor", "The cursor is not valid.");
      }
      start = index + 1;
    }
    const items = newestFirst.slice(start, start + limit).map((entry) => ({
      ...entry,
      actor_name: data.members.find((member) => member.id === entry.actor_id)?.display_name ?? "",
    }));
    const last = items.at(-1);
    const hasMore = start + limit < newestFirst.length;

    return HttpResponse.json<CursorPage<ActivityEntry>>({
      items,
      page: { next_cursor: hasMore && last ? encodeCursor(last.id) : null, limit },
    });
  }),
];
