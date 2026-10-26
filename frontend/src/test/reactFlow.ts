/**
 * The graph library measures its nodes before it shows them, and jsdom lays nothing out.
 * These stand-ins report a fixed size for every element, so the nodes become visible and
 * tests can reach them like any other content. Undone after each test.
 */
const WIDTH = 200;
const HEIGHT = 80;

export function layOutForGraphs(): () => void {
  const restore: (() => void)[] = [];
  const stub = (target: object, name: string, value: PropertyDescriptor) => {
    const previous = Object.getOwnPropertyDescriptor(target, name);
    Object.defineProperty(target, name, { configurable: true, ...value });
    restore.push(() => {
      if (previous) {
        Object.defineProperty(target, name, previous);
      } else {
        Reflect.deleteProperty(target, name);
      }
    });
  };

  class ReportingResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element): void {
      const box = [{ inlineSize: WIDTH, blockSize: HEIGHT }];
      const entry = {
        target,
        contentRect: { x: 0, y: 0, top: 0, left: 0, width: WIDTH, height: HEIGHT },
        borderBoxSize: box,
        contentBoxSize: box,
        devicePixelContentBoxSize: box,
      };
      // Reported after the element is in place, as a browser does on its next frame.
      setTimeout(() => {
        this.callback([entry as unknown as ResizeObserverEntry], this);
      }, 0);
    }
    unobserve(): void {
      // Nothing is pending; every size is reported at once.
    }
    disconnect(): void {
      // See unobserve().
    }
  }

  class ScaleMatrix {
    m22: number;
    constructor(transform?: string) {
      const scale = /scale\(([\d.]+)\)/.exec(transform ?? "")?.[1];
      this.m22 = scale === undefined ? 1 : Number(scale);
    }
  }

  // The test setup installs a silent one that may be replaced but not redefined.
  const silent = window.ResizeObserver;
  window.ResizeObserver = ReportingResizeObserver;
  restore.push(() => {
    window.ResizeObserver = silent;
  });
  stub(window, "DOMMatrixReadOnly", { writable: true, value: ScaleMatrix });
  stub(HTMLElement.prototype, "offsetWidth", { get: () => WIDTH });
  stub(HTMLElement.prototype, "offsetHeight", { get: () => HEIGHT });
  return () => {
    for (const undo of restore.reverse()) {
      undo();
    }
  };
}
