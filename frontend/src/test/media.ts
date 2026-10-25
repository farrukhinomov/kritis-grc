/**
 * jsdom has no layout engine, so media queries never match on their own. Tests opt into
 * a device by naming the queries that should match, e.g. the wide-screen query for the
 * sidebar layout. Everything else reports "no match", which is a phone with a mouse.
 */
const matching = new Set<string>();

export function matchMediaQueries(...queries: string[]): void {
  for (const query of queries) {
    matching.add(query);
  }
}

export function resetMediaQueries(): void {
  matching.clear();
}

export function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: matching.has(query),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

/** antd measures popups and overflow with ResizeObserver, which jsdom lacks. */
export function installResizeObserver(): void {
  class NoopResizeObserver {
    observe(): void {
      // jsdom never lays anything out, so there is nothing to report.
    }
    unobserve(): void {
      // See observe().
    }
    disconnect(): void {
      // See observe().
    }
  }
  Object.defineProperty(window, "ResizeObserver", { writable: true, value: NoopResizeObserver });
}
