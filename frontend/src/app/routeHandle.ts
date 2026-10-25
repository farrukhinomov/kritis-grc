import type { ParseKeys } from "i18next";
import { useMatches } from "react-router";

/** Route metadata: every page names its title, used for the tab title and the heading. */
export interface RouteHandle {
  titleKey: ParseKeys;
}

export function titled(titleKey: ParseKeys): { handle: RouteHandle } {
  return { handle: { titleKey } };
}

function isRouteHandle(handle: unknown): handle is RouteHandle {
  return typeof handle === "object" && handle !== null && "titleKey" in handle;
}

/** The title of the deepest matched route that declares one. */
export function useRouteTitleKey(): ParseKeys | undefined {
  const matches = useMatches();
  return matches.map((match) => match.handle).findLast(isRouteHandle)?.titleKey;
}
