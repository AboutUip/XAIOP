/**
 * Dot-checkpoint stream parser (XAIOP PROT-HIER / PROT-BOUND).
 *
 * `.` bounds **phases**. Each phase is parsed on its own; XAIOP later-wins
 * means the phase parse *is* the incremental unit — not a JSON-tree diff of
 * cumulative snapshots.
 *
 * - First phase: `[0, endOfDot]` as written (includes the `.` line).
 * - Later phases: slice after prior `.` … through next `.` / EOF, parsed with
 *   a leading `.` so Root reset is present.
 * - `finish()` sets snapshot = parse(full buffer).
 */

import { parseSync } from "../parse.js";
import { materializeSnapshot } from "./materialize.js";

/**
 * @typedef {{
 *   compat: false|boolean|object,
 *   streamProcessing: boolean,
 *   onChunk: (diff: unknown) => void,
 * }} CheckpointHooks
 */

export class DotCheckpointEngine {
  /** @param {CheckpointHooks} hooks */
  constructor(hooks) {
    this._hooks = hooks;
    /** @type {string} */
    this._buffer = "";
    /** @type {number} */
    this._segmentStart = 0;
    /** @type {number} */
    this._scanAt = 0;
    /** @type {boolean} */
    this._sawDot = false;
    /** @type {unknown|undefined} */
    this._latestSnapshot = undefined;
    /** Bytes of buffer covered by completed phases (through last `.` or flushed tail). */
    this._committedAt = 0;
    /** @type {unknown|null} */
    this._committedSnapshot = null;
    this._closed = false;
  }

  get buffer() {
    return this._buffer;
  }

  get snapshot() {
    return this._latestSnapshot;
  }

  /** End offset of wire that has reached a phase boundary (or EOF flush). */
  get committedAt() {
    return this._committedAt;
  }

  /**
   * Materialized parse of buffer[0..committedAt).
   * Only advances when a `.` phase completes or tail is flushed at finish —
   * never from mid-phase partial wire.
   */
  get committedSnapshot() {
    return this._committedSnapshot;
  }

  /** @param {string} chunk */
  push(chunk) {
    if (this._closed) throw new Error("checkpoint engine is closed");
    if (typeof chunk !== "string") {
      throw new TypeError("stream chunk must be a string");
    }
    if (!chunk) return;
    this._buffer += chunk;
    if (this._hooks.streamProcessing) this._scanDots(false);
  }

  finish() {
    if (this._closed) return;
    this._closed = true;

    if (!this._hooks.streamProcessing) {
      const value = this._parse(this._buffer);
      this._commit(this._buffer.length, value);
      this._hooks.onChunk(value);
      this._latestSnapshot = value;
      this._segmentStart = this._buffer.length;
      this._scanAt = this._buffer.length;
      return;
    }

    this._scanDots(true);
    this._flushTail();
    this._latestSnapshot = this._parse(this._buffer);
    this._commit(this._buffer.length, this._latestSnapshot);
  }

  /** @param {boolean} atEof */
  _scanDots(atEof) {
    while (this._scanAt < this._buffer.length) {
      const info = readLine(this._buffer, this._scanAt, atEof);
      if (!info) break;
      this._scanAt = info.end;
      if (info.line === ".") this._emitPhase(info.end);
      if (!info.consumedNewline && atEof) break;
    }
  }

  /** @param {number} end exclusive end of the `.` line */
  _emitPhase(end) {
    const raw = this._buffer.slice(this._segmentStart, end);
    const text = this._sawDot ? withLeadingDot(raw) : raw;
    const diff = normalizeEmptyPhase(raw, this._parse(text));
    this._sawDot = true;
    this._segmentStart = end;
    // Commit only through this `.` — UI/JSON must not use trailing mid-phase bytes.
    this._commit(end, this._parse(this._buffer.slice(0, end)));
    this._hooks.onChunk(diff);
  }

  _flushTail() {
    if (this._segmentStart < this._buffer.length) {
      const raw = this._buffer.slice(this._segmentStart);
      let diff;
      if (!this._sawDot) {
        diff = this._parse(raw);
      } else {
        diff = normalizeEmptyPhase(raw, this._parse(withLeadingDot(raw)));
      }
      this._segmentStart = this._buffer.length;
      this._commit(this._buffer.length, this._parse(this._buffer));
      this._hooks.onChunk(diff);
      return;
    }
    if (!this._sawDot && this._buffer.length === 0) {
      this._commit(0, null);
      this._hooks.onChunk(null);
    }
  }

  /**
   * @param {number} at
   * @param {unknown} snapshot
   */
  _commit(at, snapshot) {
    this._committedAt = at;
    this._committedSnapshot = snapshot ?? null;
  }

  /**
   * @param {string} text
   * @returns {unknown}
   */
  _parse(text) {
    if (text.length === 0) return null;
    return materializeSnapshot(parseSync(text, this._hooks.compat));
  }
}

/** @param {string} raw */
function withLeadingDot(raw) {
  if (raw === "." || raw.startsWith(".\n") || raw.startsWith(".\r\n")) {
    return raw;
  }
  return raw.startsWith("\n") ? `.${raw}` : `.\n${raw}`;
}

/**
 * @param {string} raw
 * @param {unknown} value
 */
function normalizeEmptyPhase(raw, value) {
  const body = raw
    .replace(/^\.\r?\n?/, "")
    .replace(/\r?\n?\.\r?\n?$/, "")
    .trim();
  return body.length === 0 ? null : value;
}

/**
 * @param {string} text
 * @param {number} from
 * @param {boolean} atEof
 * @returns {{ line: string, end: number, consumedNewline: boolean }|null}
 */
function readLine(text, from, atEof) {
  if (from >= text.length) return null;
  let i = from;
  while (i < text.length) {
    if (text[i] === "\n") {
      let line = text.slice(from, i);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      return { line, end: i + 1, consumedNewline: true };
    }
    i++;
  }
  if (!atEof) return null;
  return { line: text.slice(from), end: text.length, consumedNewline: false };
}
