import { useCallback, useSyncExternalStore } from "react";

/** Subscribes to a CSS media query, so the component re-renders when it starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    [query],
  );

  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

export const COARSE_POINTER_QUERY = "(pointer: coarse)";
