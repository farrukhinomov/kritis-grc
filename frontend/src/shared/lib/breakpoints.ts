import { useMediaQuery } from "./useMediaQuery";

/**
 * Two layouts: phones get bottom navigation, sheets and card lists; everything from a
 * portrait tablet up gets the sidebar, drawers and tables. Same edge as antd's `md`.
 */
export const WIDE_SCREEN_QUERY = "(min-width: 768px)";

export function useIsWideScreen(): boolean {
  return useMediaQuery(WIDE_SCREEN_QUERY);
}

/** Below this width the sidebar starts collapsed, leaving room for the content. */
export const ROOMY_SCREEN_QUERY = "(min-width: 1200px)";
