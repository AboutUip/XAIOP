/**
 * Stream / request lifecycle states (enterprise-SDK style).
 *
 * idle → connecting → streaming → completing → completed
 *                                      ↘ aborted | error
 * completed | aborted | error may send() again → connecting
 */

/** @typedef {'idle'|'connecting'|'streaming'|'completing'|'completed'|'aborted'|'error'} StreamStatus */

export const STREAM_STATUS = Object.freeze({
  IDLE: /** @type {StreamStatus} */ ("idle"),
  CONNECTING: /** @type {StreamStatus} */ ("connecting"),
  STREAMING: /** @type {StreamStatus} */ ("streaming"),
  COMPLETING: /** @type {StreamStatus} */ ("completing"),
  COMPLETED: /** @type {StreamStatus} */ ("completed"),
  ABORTED: /** @type {StreamStatus} */ ("aborted"),
  ERROR: /** @type {StreamStatus} */ ("error"),
});

/** Statuses where a new send / mode / url change is allowed. */
export const STREAM_IDLE_LIKE = Object.freeze([
  STREAM_STATUS.IDLE,
  STREAM_STATUS.COMPLETED,
  STREAM_STATUS.ABORTED,
  STREAM_STATUS.ERROR,
]);

/**
 * @param {StreamStatus} status
 * @returns {boolean}
 */
export function isStreamBusy(status) {
  return (
    status === STREAM_STATUS.CONNECTING ||
    status === STREAM_STATUS.STREAMING ||
    status === STREAM_STATUS.COMPLETING
  );
}
