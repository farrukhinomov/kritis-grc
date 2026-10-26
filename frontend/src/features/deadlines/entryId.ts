import type { DeadlineItem } from "@/shared/api/types";

/** The list entry a timeline marker leads to; one per deadline, unique on the page. */
export const entryId = (item: DeadlineItem) =>
  `deadline-${item.scope_id}-${item.obligation}-${item.due_date}`;
