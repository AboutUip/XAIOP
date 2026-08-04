/**
 * Portable "run soon" scheduler.
 * Prefers Node `setImmediate`, then `MessageChannel`, then `setTimeout(0)`.
 */
export function scheduleImmediate(fn: () => void): void {
  const g = globalThis as typeof globalThis & {
    setImmediate?: (cb: () => void) => void;
  };
  if (typeof g.setImmediate === "function") {
    g.setImmediate(fn);
    return;
  }
  if (typeof MessageChannel === "function") {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => fn();
    port2.postMessage(null);
    return;
  }
  setTimeout(fn, 0);
}
