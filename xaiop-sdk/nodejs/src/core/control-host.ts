// @ts-nocheck
/**
 * Shared control-plane host for WS / Stream surfaces.
 * Owns demux ingest, session cursor, and outgoing control frames.
 */

import {
  ControlIngest,
  ControlSessionState,
  XaiopControlError,
  encodeAckFrame,
  encodeResumeFrame,
  encodeSessionFrame,
  encodeSnapshotFrame,
} from "./control.js";

/**
 * @typedef {{
 *   send: (text: string) => boolean,
 *   getCommittedSnapshot?: () => unknown,
 *   onControlError?: (err: XaiopControlError) => void,
 *   onSession?: (body: unknown) => void,
 *   onResume?: (body: unknown) => void,
 *   onAck?: (body: unknown) => void,
 *   onSnapshot?: (body: unknown) => void,
 *   onTypes?: (snapshot: unknown) => void,
 *   onSeq?: (body: unknown) => void,
 *   session?: boolean|{ sessionId?: string, role?: string, capabilities?: string[], epoch?: number },
 *   autoAck?: boolean,
 * }} ControlHostOptions
 */

export class ControlPlaneHost {
  /** @param {ControlHostOptions} options */
  constructor(options) {
    if (typeof options.send !== "function") {
      throw new TypeError("ControlPlaneHost requires send(text)");
    }
    this._send = options.send;
    this._getCommittedSnapshot =
      typeof options.getCommittedSnapshot === "function"
        ? options.getCommittedSnapshot
        : null;

    /** @type {((err: XaiopControlError) => void)|null} */
    this._onControlError =
      typeof options.onControlError === "function"
        ? options.onControlError
        : null;
    /** @type {((body: unknown) => void)|null} */
    this._onSession =
      typeof options.onSession === "function" ? options.onSession : null;
    /** @type {((body: unknown) => void)|null} */
    this._onResume =
      typeof options.onResume === "function" ? options.onResume : null;
    /** @type {((body: unknown) => void)|null} */
    this._onAck = typeof options.onAck === "function" ? options.onAck : null;
    /** @type {((body: unknown) => void)|null} */
    this._onSnapshot =
      typeof options.onSnapshot === "function" ? options.onSnapshot : null;
    /** @type {((snapshot: unknown) => void)|null} */
    this._onTypes =
      typeof options.onTypes === "function" ? options.onTypes : null;
    /** @type {((body: unknown) => void)|null} */
    this._onSeq = typeof options.onSeq === "function" ? options.onSeq : null;

    this._autoAck = options.autoAck === true;

    /**
     * Bound checkpoint for `#!xaiop/seq/v1` → `noteLogSeq`.
     * @type {{ noteLogSeq: (seq: number) => void }|null}
     */
    this._checkpoint = null;
    /** @type {number[]} */
    this._pendingLogSeqs = [];

    /** @type {ControlSessionState|null} */
    this._session = null;
    if (options.session) {
      const init =
        options.session === true
          ? {}
          : typeof options.session === "object"
            ? options.session
            : {};
      this._session = new ControlSessionState(init);
      this._session.ensureSessionId();
    }

    this._ingest = new ControlIngest({
      onTypes: (snapshot, frame) => {
        if (this._onTypes) this._onTypes(snapshot, frame);
      },
      onSession: (body, frame) => {
        if (this._session) this._session.applyPeerSession(body);
        if (this._onSession) this._onSession(body, frame);
      },
      onResume: (body, frame) => {
        if (this._onResume) this._onResume(body, frame);
      },
      onAck: (body, frame) => {
        if (this._session && body && typeof body === "object") {
          this._session.noteAck(body.seq);
        }
        if (this._onAck) this._onAck(body, frame);
      },
      onSnapshot: (body, frame) => {
        if (this._onSnapshot) this._onSnapshot(body, frame);
      },
      onSeq: (body, frame) => {
        const n = Number(body && body.seq);
        if (Number.isInteger(n) && n >= 1) this._queueLogSeq(n);
        if (this._onSeq) this._onSeq(body, frame);
      },
      onControlError: (err) => this._reportControlError(err),
    });

    /** Last snapshot delivered via control (optional seed). */
    this.lastSnapshot = undefined;
  }

  /**
   * Bind DotCheckpointEngine so seq stamps land before phases in the same push.
   * @param {{ noteLogSeq: (seq: number) => void }|null} engine
   */
  bindCheckpoint(engine) {
    this._checkpoint = engine && typeof engine.noteLogSeq === "function" ? engine : null;
    if (this._checkpoint && this._pendingLogSeqs.length) {
      for (let i = 0; i < this._pendingLogSeqs.length; i++) {
        this._checkpoint.noteLogSeq(this._pendingLogSeqs[i]);
      }
      this._pendingLogSeqs.length = 0;
    }
    return this;
  }

  /** @param {number} seq */
  _queueLogSeq(seq) {
    if (this._checkpoint) {
      this._checkpoint.noteLogSeq(seq);
      return;
    }
    this._pendingLogSeqs.push(seq);
  }

  get session() {
    return this._session;
  }

  get sessionId() {
    return this._session ? this._session.sessionId : null;
  }

  get phaseSeq() {
    return this._session ? this._session.phaseSeq : 0;
  }

  get ackedSeq() {
    return this._session ? this._session.ackedSeq : 0;
  }

  /** @param {(body: unknown, frame?: object) => void} fn */
  onResume(fn) {
    this._onResume = typeof fn === "function" ? fn : null;
    return this;
  }

  /** @param {(body: unknown, frame?: object) => void} fn */
  onSession(fn) {
    this._onSession = typeof fn === "function" ? fn : null;
    return this;
  }

  /** @param {(body: unknown, frame?: object) => void} fn */
  onAck(fn) {
    this._onAck = typeof fn === "function" ? fn : null;
    return this;
  }

  /** @param {(body: unknown, frame?: object) => void} fn */
  onSnapshot(fn) {
    this._onSnapshot = typeof fn === "function" ? fn : null;
    return this;
  }

  /** @param {(err: XaiopControlError) => void} fn */
  onControlError(fn) {
    this._onControlError = typeof fn === "function" ? fn : null;
    return this;
  }

  /**
   * @param {string} text
   * @returns {string} wire remainder
   */
  push(text) {
    return this._ingest.push(text);
  }

  /** @returns {string} */
  flush() {
    return this._ingest.flush();
  }

  /**
   * Sync session resume cursor from onChunk meta; optional auto-ack.
   * Prefers **session-log** `meta.logSeq` when present; else connection-local `meta.seq`.
   * @param {{ seq?: number, seqs?: number[], logSeq?: number, logSeqs?: number[] }|undefined} meta
   */
  notePhaseMeta(meta) {
    if (!meta || !this._session) return;
    const cursor = Number.isInteger(meta.logSeq)
      ? meta.logSeq
      : Number.isInteger(meta.seq)
        ? meta.seq
        : undefined;
    if (Number.isInteger(cursor) && cursor > this._session.phaseSeq) {
      this._session.phaseSeq = cursor;
    }
    if (this._autoAck && Number.isInteger(cursor) && cursor > 0) {
      this.sendAck(cursor);
    }
  }

  /** @returns {boolean} */
  sendSession(extra = {}) {
    if (!this._session) {
      this._session = new ControlSessionState();
    }
    const body = { ...this._session.toSessionBody(), ...extra };
    return this._send(encodeSessionFrame(body));
  }

  /**
   * @param {number} [seq]
   * @returns {boolean}
   */
  sendAck(seq) {
    if (!this._session) {
      throw new TypeError("sendAck requires session: true (or prior sendSession)");
    }
    const n =
      seq === undefined || seq === null ? this._session.phaseSeq : Number(seq);
    if (!Number.isInteger(n) || n < 0) {
      throw new TypeError("sendAck requires a non-negative integer seq");
    }
    return this._send(
      encodeAckFrame({
        sessionId: this._session.ensureSessionId(),
        seq: n,
      }),
    );
  }

  /**
   * @param {{ sessionId?: string, fromSeq: number, epoch?: number }} body
   * @returns {boolean}
   */
  sendResume(body) {
    if (!body || typeof body !== "object") {
      throw new TypeError("sendResume requires { sessionId?, fromSeq }");
    }
    const fromSeq = Number(body.fromSeq);
    if (!Number.isInteger(fromSeq) || fromSeq < 0) {
      throw new TypeError("sendResume.fromSeq must be a non-negative integer");
    }
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId
        ? body.sessionId
        : this._session
          ? this._session.ensureSessionId()
          : null;
    if (!sessionId) {
      throw new TypeError("sendResume requires sessionId");
    }
    const payload = { sessionId, fromSeq };
    if (Number.isInteger(body.epoch) && body.epoch >= 0) {
      payload.epoch = body.epoch;
    }
    return this._send(encodeResumeFrame(payload));
  }

  /**
   * @param {unknown} [json]
   * @returns {boolean}
   */
  sendSnapshot(json) {
    if (!this._session) {
      throw new TypeError("sendSnapshot requires session: true");
    }
    const tree =
      json !== undefined
        ? json
        : this._getCommittedSnapshot
          ? this._getCommittedSnapshot()
          : undefined;
    return this._send(
      encodeSnapshotFrame({
        sessionId: this._session.ensureSessionId(),
        seq: this._session.phaseSeq,
        tree: tree === undefined ? null : tree,
      }),
    );
  }

  /**
   * @param {unknown} [committedSnapshot]
   */
  getResumeState(committedSnapshot) {
    if (!this._session) return null;
    const snap =
      committedSnapshot !== undefined
        ? committedSnapshot
        : this._getCommittedSnapshot
          ? this._getCommittedSnapshot()
          : undefined;
    return this._session.toResumeState(snap);
  }

  /** @param {XaiopControlError} err */
  _reportControlError(err) {
    if (this._onControlError) {
      this._onControlError(err);
      return;
    }
    // Soft default: do not abort the stream; surface via Error for hosts that
    // only wired onError as a soft reporter.
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("[xaiop control]", err.message);
    }
  }
}

export { XaiopControlError };
