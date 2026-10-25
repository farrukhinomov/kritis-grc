/**
 * jsdom has no IntersectionObserver. This stand-in records what is observed, so a test
 * can say when something scrolls into view.
 */
type Callback = (entries: { isIntersecting: boolean; target: Element }[]) => void;

const observers = new Set<{ callback: Callback; targets: Set<Element> }>();

export function installIntersectionObserver(): void {
  class StandIn {
    private readonly entry: { callback: Callback; targets: Set<Element> };

    constructor(callback: Callback) {
      this.entry = { callback, targets: new Set() };
      observers.add(this.entry);
    }

    observe(target: Element) {
      this.entry.targets.add(target);
    }

    unobserve(target: Element) {
      this.entry.targets.delete(target);
    }

    disconnect() {
      observers.delete(this.entry);
    }
  }
  globalThis.IntersectionObserver = StandIn as unknown as typeof IntersectionObserver;
}

/** Tells every live observer that its targets are in view. */
export function scrollIntoViewEverywhere(): void {
  for (const { callback, targets } of [...observers]) {
    callback([...targets].map((target) => ({ isIntersecting: true, target })));
  }
}

export function resetIntersectionObservers(): void {
  observers.clear();
}
