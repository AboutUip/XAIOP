/**
 * Response consumption modes (multi-select). Default: callback only.
 */

export type StreamMode = "callback" | "promise" | "asyncIterator" | "events";

export const STREAM_MODES = Object.freeze({
  CALLBACK: "callback" as const,
  PROMISE: "promise" as const,
  ASYNC_ITERATOR: "asyncIterator" as const,
  EVENTS: "events" as const,
});

export const ALL_STREAM_MODES: ReadonlySet<StreamMode> = Object.freeze(
  new Set<StreamMode>(Object.values(STREAM_MODES)),
);

export function normalizeModes(
  modes?: Iterable<StreamMode> | StreamMode[] | StreamMode | null,
): Set<StreamMode> {
  if (modes == null) {
    return new Set<StreamMode>([STREAM_MODES.CALLBACK]);
  }
  const list =
    typeof modes === "string" ? [modes] : [...(modes as Iterable<StreamMode>)];
  const out = new Set<StreamMode>();
  for (const m of list) {
    if (!ALL_STREAM_MODES.has(m)) {
      throw new TypeError(`unknown stream mode: ${String(m)}`);
    }
    out.add(m);
  }
  if (out.size === 0) {
    out.add(STREAM_MODES.CALLBACK);
  }
  return out;
}
