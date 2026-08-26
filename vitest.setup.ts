if (typeof globalThis.ResizeObserver === "undefined") {
  const ResizeObserverMock: typeof ResizeObserver = class {
    constructor(_callback: ResizeObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverMock
}
