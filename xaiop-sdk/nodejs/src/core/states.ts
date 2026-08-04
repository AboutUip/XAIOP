/**
 * Stream / request lifecycle states.
 *
 * idle → connecting → streaming → completing → completed
 *                                      ↘ aborted | error
 */

export type StreamStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "completing"
  | "completed"
  | "aborted"
  | "error";

export const STREAM_STATUS = Object.freeze({
  IDLE: "idle" as const,
  CONNECTING: "connecting" as const,
  STREAMING: "streaming" as const,
  COMPLETING: "completing" as const,
  COMPLETED: "completed" as const,
  ABORTED: "aborted" as const,
  ERROR: "error" as const,
});

/** Statuses where a new send / mode / url change is allowed. */
export const STREAM_IDLE_LIKE = Object.freeze([
  STREAM_STATUS.IDLE,
  STREAM_STATUS.COMPLETED,
  STREAM_STATUS.ABORTED,
  STREAM_STATUS.ERROR,
] as const);

export function isStreamBusy(status: StreamStatus): boolean {
  return (
    status === STREAM_STATUS.CONNECTING ||
    status === STREAM_STATUS.STREAMING ||
    status === STREAM_STATUS.COMPLETING
  );
}
