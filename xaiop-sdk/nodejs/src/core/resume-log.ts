// @ts-nocheck
/**
 * Outbound phase wire log for producer-side resume.
 *
 * Seq here is the **session-log** sequence (one entry per completed logical
 * phase). On `resume{ fromSeq }`, replay `wiresAfter(fromSeq)` — each entry is
 * prefixed with `#!xaiop/seq/v1` so the consumer gets `meta.logSeq` (not only
 * connection-local `meta.seq`).
 *
 * Historical Diffs are not stored — only wire text (and optional committed JSON).
 */

import { stampWireWithLogSeq } from "./control.js";

export class ResumeWireLog {
  constructor() {
    /** @type {{ seq: number, wire: string, committed?: unknown }[]} */
    this._entries = [];
  }

  get size() {
    return this._entries.length;
  }

  /** Highest recorded seq, or 0 if empty. */
  get highestSeq() {
    if (this._entries.length === 0) return 0;
    return this._entries[this._entries.length - 1].seq;
  }

  /**
   * @param {{ seq: number, wire: string, committed?: unknown }} entry
   * @returns {this}
   */
  record(entry) {
    if (!entry || !Number.isInteger(entry.seq) || entry.seq < 1) {
      throw new TypeError("ResumeWireLog.record requires seq >= 1");
    }
    if (typeof entry.wire !== "string") {
      throw new TypeError("ResumeWireLog.record requires wire string");
    }
    const last = this.highestSeq;
    if (entry.seq <= last) {
      throw new XaiopResumeLogError(
        `ResumeWireLog seq must be strictly increasing (got ${entry.seq}, last ${last})`,
        { code: "RESUME_LOG_SEQ", seq: entry.seq },
      );
    }
    this._entries.push({
      seq: entry.seq,
      wire: entry.wire,
      committed: entry.committed,
    });
    return this;
  }

  /**
   * Concatenated wire for all phases with seq > fromSeq (resume continue).
   * Each phase is prefixed with `#!xaiop/seq/v1` so peers bind `meta.logSeq`.
   * @param {number} fromSeq
   * @returns {string}
   */
  wiresAfter(fromSeq) {
    return this._joinAfter(fromSeq, true);
  }

  /**
   * Like {@link wiresAfter} but **without** seq stamp frames (tests / raw dump).
   * @param {number} fromSeq
   * @returns {string}
   */
  wiresAfterRaw(fromSeq) {
    return this._joinAfter(fromSeq, false);
  }

  /**
   * @param {number} fromSeq
   * @param {boolean} stamp
   * @returns {string}
   */
  _joinAfter(fromSeq, stamp) {
    const n = Number(fromSeq);
    if (!Number.isInteger(n) || n < 0) {
      throw new TypeError("wiresAfter requires non-negative integer fromSeq");
    }
    let out = "";
    for (let i = 0; i < this._entries.length; i++) {
      const e = this._entries[i];
      if (e.seq > n) {
        out += stamp ? stampWireWithLogSeq(e.seq, e.wire) : e.wire;
      }
    }
    return out;
  }

  /**
   * @param {number} seq
   * @returns {{ seq: number, wire: string, committed?: unknown }|null}
   */
  entryAt(seq) {
    const n = Number(seq);
    for (let i = 0; i < this._entries.length; i++) {
      if (this._entries[i].seq === n) return { ...this._entries[i] };
    }
    return null;
  }

  /**
   * Committed snapshot recorded at `seq`, if any.
   * @param {number} seq
   */
  committedAt(seq) {
    const e = this.entryAt(seq);
    return e && "committed" in e ? e.committed : undefined;
  }

  /** @returns {{ seq: number, wire: string, committed?: unknown }[]} */
  toArray() {
    return this._entries.map((e) => ({ ...e }));
  }

  clear() {
    this._entries.length = 0;
    return this;
  }
}

export class XaiopResumeLogError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, seq?: number }} [detail]
   */
  constructor(message, detail = {}) {
    super(message);
    this.name = "XaiopResumeLogError";
    this.code = detail.code || "RESUME_LOG";
    if (detail.seq !== undefined) this.seq = detail.seq;
  }
}
