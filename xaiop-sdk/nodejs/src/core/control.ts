// @ts-nocheck
/**
 * SDK Control Root (`#!`) — demux, frame codec, and session/resume helpers.
 *
 * Product convention (not Frozen 0.6.0 grammar rewrite):
 * - A logical line whose first two characters are `#` `!` is control plane.
 * - Control frames never enter LiveXaiopParser / Annotation Span.
 * - Official capabilities live under `ns=xaiop`. Other `#!…` still enter the
 *   control plane: discard + report (never treat as wire annotation).
 *
 * Frame shape:
 *   #!<ns>/<name>/v<major>\n
 *   <body-line>\n
 *
 * Body is exactly one logical line (JSON text or empty). Encoders always
 * terminate the body with `\n`. Receivers also finalize a pending body at
 * flush / when a complete JSON object is held without a trailing LF (compat
 * with historical `#!xaiop/types/v1\n{…}` whole messages).
 */

/** Official control namespace. */
export const CONTROL_NS = "xaiop";

/** Known capability names under `CONTROL_NS`. */
export const CONTROL_NAME = Object.freeze({
  TYPES: "types",
  SESSION: "session",
  RESUME: "resume",
  ACK: "ack",
  SNAPSHOT: "snapshot",
});

/** Capability ids `ns/name/vN`. */
export const CONTROL_CAPABILITY = Object.freeze({
  TYPES_V1: "xaiop/types/v1",
  SESSION_V1: "xaiop/session/v1",
  RESUME_V1: "xaiop/resume/v1",
  ACK_V1: "xaiop/ack/v1",
  SNAPSHOT_V1: "xaiop/snapshot/v1",
});

const HEADER_RE = /^#!([A-Za-z][A-Za-z0-9_-]*)\/([A-Za-z][A-Za-z0-9_-]*)\/v(\d+)$/;

/**
 * @typedef {{
 *   ns: string,
 *   name: string,
 *   version: number,
 *   id: string,
 *   header: string,
 *   body: string,
 *   raw: string,
 * }} ControlFrame
 */

export class XaiopControlError extends Error {
  /**
   * @param {string} message
   * @param {{
   *   code?: string,
   *   header?: string,
   *   frame?: ControlFrame|null,
   *   cause?: unknown,
   * }} [detail]
   */
  constructor(message, detail = {}) {
    super(message);
    this.name = "XaiopControlError";
    /** @type {string} */
    this.code = detail.code || "CONTROL_ERROR";
    /** @type {string|undefined} */
    this.header = detail.header;
    /** @type {ControlFrame|null|undefined} */
    this.frame = detail.frame;
    if (detail.cause !== undefined) {
      /** @type {unknown} */
      this.cause = detail.cause;
    }
  }
}

/** @param {string} line */
export function isSdkControlLine(line) {
  return typeof line === "string" && line.length >= 2 && line[0] === "#" && line[1] === "!";
}

/**
 * Parse a control header line (no trailing newline).
 * @param {string} line
 * @returns {{ ns: string, name: string, version: number, id: string, header: string }|null}
 */
export function parseControlHeader(line) {
  if (!isSdkControlLine(line)) return null;
  const m = HEADER_RE.exec(line);
  if (!m) return null;
  return {
    ns: m[1],
    name: m[2],
    version: Number(m[3]),
    id: `${m[1]}/${m[2]}/v${m[3]}`,
    header: line,
  };
}

/**
 * @param {string} ns
 * @param {string} name
 * @param {number} version
 * @param {string|object|null|undefined} [body]
 * @returns {string}
 */
export function encodeControlFrame(ns, name, version, body) {
  if (typeof ns !== "string" || !ns || typeof name !== "string" || !name) {
    throw new TypeError("encodeControlFrame requires ns and name");
  }
  const ver = Number(version);
  if (!Number.isInteger(ver) || ver < 1) {
    throw new TypeError("encodeControlFrame version must be a positive integer");
  }
  const header = `#!${ns}/${name}/v${ver}`;
  let bodyText = "";
  if (body === undefined || body === null) {
    bodyText = "";
  } else if (typeof body === "string") {
    bodyText = body;
  } else {
    bodyText = JSON.stringify(body);
  }
  if (bodyText.includes("\n") || bodyText.includes("\r")) {
    throw new XaiopControlError(
      "control frame body must be a single logical line (no CR/LF)",
      { code: "CONTROL_BODY_MULTILINE", header },
    );
  }
  return `${header}\n${bodyText}\n`;
}

/** @param {string|object} body */
export function encodeSessionFrame(body) {
  return encodeControlFrame(CONTROL_NS, CONTROL_NAME.SESSION, 1, body);
}

/** @param {string|object} body */
export function encodeResumeFrame(body) {
  return encodeControlFrame(CONTROL_NS, CONTROL_NAME.RESUME, 1, body);
}

/** @param {string|object} body */
export function encodeAckFrame(body) {
  return encodeControlFrame(CONTROL_NS, CONTROL_NAME.ACK, 1, body);
}

/** @param {string|object} body */
export function encodeSnapshotFrame(body) {
  return encodeControlFrame(CONTROL_NS, CONTROL_NAME.SNAPSHOT, 1, body);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function looksCompleteJson(text) {
  const t = text.trim();
  if (!t) return true;
  const open = t[0];
  if (open !== "{" && open !== "[" && open !== '"' && open !== "n" && open !== "t" && open !== "f" && open !== "-" && !(open >= "0" && open <= "9")) {
    return false;
  }
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/**
 * Streaming demux: peel `#!` control frames; remainder is document wire text.
 */
export class ControlDemux {
  constructor() {
    /** Incomplete trailing text (no newline yet). */
    this._carry = "";
    /**
     * When non-null, we have a parsed header and are collecting the body line.
     * @type {{ ns: string, name: string, version: number, id: string, header: string }|null}
     */
    this._pendingHeader = null;
    /**
     * Malformed `#!…` header waiting for its discarded body line.
     * @type {string|null}
     */
    this._skipBodyAfterBadHeader = null;
    /**
     * After compat JSON finalize (body without trailing LF), the next empty
     * logical line is the deferred terminator — do not emit as wire.
     * @type {boolean}
     */
    this._skipNextEmptyWireLine = false;
  }

  /**
   * @param {string} text
   * @param {{ finalizeBodies?: boolean }} [opts]
   *   `finalizeBodies` — end-of-chunk / EOF: complete a pending body if present
   *   (or if it already looks like complete JSON without trailing LF).
   * @returns {{ wireText: string, frames: ControlFrame[], errors: XaiopControlError[] }}
   */
  push(text, opts = {}) {
    const finalizeBodies = opts.finalizeBodies === true;
    /** @type {ControlFrame[]} */
    const frames = [];
    /** @type {XaiopControlError[]} */
    const errors = [];
    /** @type {string[]} */
    const wireParts = [];

    if (typeof text === "string" && text.length > 0) {
      this._carry += text;
    }

    // Preserve original terminators (LF / CRLF) for document wire lines.
    let start = 0;
    while (start < this._carry.length) {
      const nl = this._carry.indexOf("\n", start);
      if (nl < 0) break;
      let line = this._carry.slice(start, nl);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const rawLineWithNl = this._carry.slice(start, nl + 1);
      start = nl + 1;
      this._handleCompleteLine(line, rawLineWithNl, wireParts, frames, errors);
    }
    this._carry = this._carry.slice(start);

    if (finalizeBodies) {
      this._finalizePending(wireParts, frames, errors, true);
    } else if (this._pendingHeader && this._carry.length > 0) {
      // Compat: whole WS message `#!…\n{json}` without trailing LF after body.
      if (looksCompleteJson(this._carry)) {
        this._completeFrame(this._carry, frames);
        this._pendingHeader = null;
        this._carry = "";
        this._skipNextEmptyWireLine = true;
      }
    } else if (this._skipBodyAfterBadHeader && this._carry.length > 0) {
      // Discard one body line for malformed header (compat without LF).
      if (looksCompleteJson(this._carry) || this._carry.length > 0) {
        this._skipBodyAfterBadHeader = null;
        this._carry = "";
        this._skipNextEmptyWireLine = true;
      }
    }

    return {
      wireText: wireParts.join(""),
      frames,
      errors,
    };
  }

  /**
   * End of stream / peer close: flush carry into pending body or wire.
   * @returns {{ wireText: string, frames: ControlFrame[], errors: XaiopControlError[] }}
   */
  flush() {
    return this.push("", { finalizeBodies: true });
  }

  get hasPending() {
    return (
      this._carry.length > 0 ||
      this._pendingHeader != null ||
      this._skipBodyAfterBadHeader != null
    );
  }

  /**
   * @param {string} line logical line without terminator
   * @param {string} rawLineWithNl original slice including LF (and CR if CRLF)
   * @param {string[]} wireParts
   * @param {ControlFrame[]} frames
   * @param {XaiopControlError[]} errors
   */
  _handleCompleteLine(line, rawLineWithNl, wireParts, frames, errors) {
    if (this._skipBodyAfterBadHeader) {
      // One body line discarded after malformed #! header.
      this._skipBodyAfterBadHeader = null;
      return;
    }

    if (this._pendingHeader) {
      this._completeFrame(line, frames);
      this._pendingHeader = null;
      return;
    }

    if (isSdkControlLine(line)) {
      const header = parseControlHeader(line);
      if (!header) {
        errors.push(
          new XaiopControlError(`malformed control header: ${line}`, {
            code: "CONTROL_HEADER_MALFORMED",
            header: line,
          }),
        );
        this._skipBodyAfterBadHeader = line;
        return;
      }
      this._pendingHeader = header;
      return;
    }

    if (line === "" && this._skipNextEmptyWireLine) {
      this._skipNextEmptyWireLine = false;
      return;
    }
    this._skipNextEmptyWireLine = false;

    // Document wire: keep original terminator bytes.
    wireParts.push(rawLineWithNl);
  }

  /**
   * @param {string[]} wireParts
   * @param {ControlFrame[]} frames
   * @param {XaiopControlError[]} errors
   * @param {boolean} eof
   */
  _finalizePending(wireParts, frames, errors, eof) {
    if (!eof) return;

    if (this._carry.length > 0) {
      const rem = this._carry;
      this._carry = "";
      if (this._pendingHeader) {
        this._completeFrame(rem, frames);
        this._pendingHeader = null;
        return;
      }
      if (this._skipBodyAfterBadHeader) {
        this._skipBodyAfterBadHeader = null;
        return;
      }
      if (isSdkControlLine(rem)) {
        const header = parseControlHeader(rem);
        if (!header) {
          errors.push(
            new XaiopControlError(`malformed control header: ${rem}`, {
              code: "CONTROL_HEADER_MALFORMED",
              header: rem,
            }),
          );
        } else {
          this._pendingHeader = header;
          this._completeFrame("", frames);
          this._pendingHeader = null;
        }
        return;
      }
      wireParts.push(rem);
      return;
    }

    if (this._skipBodyAfterBadHeader) {
      this._skipBodyAfterBadHeader = null;
      return;
    }

    if (this._pendingHeader) {
      this._completeFrame("", frames);
      this._pendingHeader = null;
    }
  }

  /**
   * @param {string} body
   * @param {ControlFrame[]} frames
   */
  _completeFrame(body, frames) {
    const h = this._pendingHeader;
    if (!h) return;
    const bodyText = typeof body === "string" ? body : "";
    frames.push({
      ns: h.ns,
      name: h.name,
      version: h.version,
      id: h.id,
      header: h.header,
      body: bodyText,
      raw: `${h.header}\n${bodyText}`,
    });
  }
}

/**
 * @param {ControlFrame} frame
 * @returns {unknown}
 */
export function parseControlBodyJson(frame) {
  const t = (frame.body || "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch (err) {
    throw new XaiopControlError(`invalid control JSON for ${frame.id}`, {
      code: "CONTROL_BODY_JSON",
      header: frame.header,
      frame,
      cause: err,
    });
  }
}

/**
 * Dispatch a control frame. Unknown / non-official capabilities → error + discard.
 *
 * @param {ControlFrame} frame
 * @param {{
 *   onTypes?: (snapshot: unknown, frame: ControlFrame) => void,
 *   onSession?: (body: unknown, frame: ControlFrame) => void,
 *   onResume?: (body: unknown, frame: ControlFrame) => void,
 *   onAck?: (body: unknown, frame: ControlFrame) => void,
 *   onSnapshot?: (body: unknown, frame: ControlFrame) => void,
 *   onControlError?: (err: XaiopControlError) => void,
 * }} handlers
 */
export function dispatchControlFrame(frame, handlers = {}) {
  const report = (err) => {
    if (typeof handlers.onControlError === "function") {
      handlers.onControlError(err);
    }
  };

  if (frame.ns !== CONTROL_NS) {
    report(
      new XaiopControlError(`unknown control namespace: ${frame.ns}`, {
        code: "CONTROL_UNKNOWN_NS",
        header: frame.header,
        frame,
      }),
    );
    return;
  }

  try {
    switch (frame.name) {
      case CONTROL_NAME.TYPES: {
        if (frame.version !== 1) {
          report(
            new XaiopControlError(`unsupported types version: v${frame.version}`, {
              code: "CONTROL_UNKNOWN_CAPABILITY",
              header: frame.header,
              frame,
            }),
          );
          return;
        }
        const body = parseControlBodyJson(frame);
        if (!body || body.version !== 1 || !Array.isArray(body.entries)) {
          throw new XaiopControlError("invalid type schema frame payload", {
            code: "CONTROL_TYPES_PAYLOAD",
            header: frame.header,
            frame,
          });
        }
        if (typeof handlers.onTypes === "function") handlers.onTypes(body, frame);
        return;
      }
      case CONTROL_NAME.SESSION: {
        if (frame.version !== 1) {
          report(
            new XaiopControlError(`unsupported session version: v${frame.version}`, {
              code: "CONTROL_UNKNOWN_CAPABILITY",
              header: frame.header,
              frame,
            }),
          );
          return;
        }
        const body = parseControlBodyJson(frame) ?? {};
        if (typeof handlers.onSession === "function") handlers.onSession(body, frame);
        return;
      }
      case CONTROL_NAME.RESUME: {
        if (frame.version !== 1) {
          report(
            new XaiopControlError(`unsupported resume version: v${frame.version}`, {
              code: "CONTROL_UNKNOWN_CAPABILITY",
              header: frame.header,
              frame,
            }),
          );
          return;
        }
        const body = parseControlBodyJson(frame) ?? {};
        if (typeof handlers.onResume === "function") handlers.onResume(body, frame);
        return;
      }
      case CONTROL_NAME.ACK: {
        if (frame.version !== 1) {
          report(
            new XaiopControlError(`unsupported ack version: v${frame.version}`, {
              code: "CONTROL_UNKNOWN_CAPABILITY",
              header: frame.header,
              frame,
            }),
          );
          return;
        }
        const body = parseControlBodyJson(frame) ?? {};
        if (typeof handlers.onAck === "function") handlers.onAck(body, frame);
        return;
      }
      case CONTROL_NAME.SNAPSHOT: {
        if (frame.version !== 1) {
          report(
            new XaiopControlError(`unsupported snapshot version: v${frame.version}`, {
              code: "CONTROL_UNKNOWN_CAPABILITY",
              header: frame.header,
              frame,
            }),
          );
          return;
        }
        const body = parseControlBodyJson(frame);
        if (typeof handlers.onSnapshot === "function") handlers.onSnapshot(body, frame);
        return;
      }
      default:
        report(
          new XaiopControlError(`unknown control capability: ${frame.id}`, {
            code: "CONTROL_UNKNOWN_CAPABILITY",
            header: frame.header,
            frame,
          }),
        );
    }
  } catch (err) {
    if (err instanceof XaiopControlError) {
      report(err);
      return;
    }
    report(
      new XaiopControlError(
        err instanceof Error ? err.message : String(err),
        { code: "CONTROL_DISPATCH", header: frame.header, frame, cause: err },
      ),
    );
  }
}

/**
 * Ingest pipeline: demux + dispatch; returns wire text for the document engine.
 */
export class ControlIngest {
  /**
   * @param {{
   *   onTypes?: (snapshot: unknown, frame: ControlFrame) => void,
   *   onSession?: (body: unknown, frame: ControlFrame) => void,
   *   onResume?: (body: unknown, frame: ControlFrame) => void,
   *   onAck?: (body: unknown, frame: ControlFrame) => void,
   *   onSnapshot?: (body: unknown, frame: ControlFrame) => void,
   *   onControlError?: (err: XaiopControlError) => void,
   * }} [handlers]
   */
  constructor(handlers = {}) {
    this._demux = new ControlDemux();
    this._handlers = handlers;
  }

  /** @param {typeof this._handlers} handlers */
  setHandlers(handlers) {
    this._handlers = handlers || {};
  }

  /**
   * Patch individual callbacks without replacing the whole handler map.
   * @param {Partial<typeof this._handlers>} patch
   */
  patchHandlers(patch) {
    this._handlers = { ...this._handlers, ...patch };
  }

  /**
   * @param {string} text
   * @returns {string} wire text to feed DotCheckpointEngine (may be empty)
   */
  push(text) {
    const { wireText, frames, errors } = this._demux.push(text);
    this._emitErrors(errors);
    for (let i = 0; i < frames.length; i++) {
      dispatchControlFrame(frames[i], this._handlers);
    }
    return wireText;
  }

  /** @returns {string} */
  flush() {
    const { wireText, frames, errors } = this._demux.flush();
    this._emitErrors(errors);
    for (let i = 0; i < frames.length; i++) {
      dispatchControlFrame(frames[i], this._handlers);
    }
    return wireText;
  }

  /** @param {XaiopControlError[]} errors */
  _emitErrors(errors) {
    if (!errors || !errors.length) return;
    const fn = this._handlers.onControlError;
    if (typeof fn !== "function") return;
    for (let i = 0; i < errors.length; i++) fn(errors[i]);
  }
}

/**
 * Session / phase-seq cursor for resume.
 *
 * Seq granularity (best practice): one monotonic seq per completed **physical**
 * `.` phase (and one for a non-empty finish tail). Window-merged `onChunk` may
 * carry `meta.seqs` for all phases in the batch; `meta.seq` is the highest.
 * Reconnect continues from `fromSeq + 1`; historical Diffs are **not** replayed.
 * Optional `snapshot` control frame may seed the committed tree.
 */
export class ControlSessionState {
  /**
   * @param {{
   *   sessionId?: string,
   *   role?: string,
   *   capabilities?: string[],
   *   epoch?: number,
   * }} [init]
   */
  constructor(init = {}) {
    /** @type {string|null} */
    this.sessionId =
      typeof init.sessionId === "string" && init.sessionId
        ? init.sessionId
        : null;
    /** @type {string} */
    this.role = typeof init.role === "string" ? init.role : "duplex";
    /** @type {string[]} */
    this.capabilities = Array.isArray(init.capabilities)
      ? init.capabilities.slice()
      : defaultCapabilities();
    /** @type {number} */
    this.epoch = Number.isInteger(init.epoch) && init.epoch >= 0 ? init.epoch : 0;
    /** Highest completed phase seq (0 = none yet). */
    this.phaseSeq = 0;
    /** Highest contiguous ack received/applied. */
    this.ackedSeq = 0;
    /** Peer session id if different. */
    this.peerSessionId = null;
  }

  ensureSessionId() {
    if (!this.sessionId) this.sessionId = createSessionId();
    return this.sessionId;
  }

  /**
   * Allocate the next phase seq (call once per physical `.` / tail unit).
   * @returns {number}
   */
  nextPhaseSeq() {
    this.phaseSeq += 1;
    return this.phaseSeq;
  }

  /**
   * @param {number} seq
   * @returns {boolean} true if advanced
   */
  noteAck(seq) {
    const n = Number(seq);
    if (!Number.isInteger(n) || n < 0) return false;
    if (n > this.ackedSeq) {
      this.ackedSeq = n;
      return true;
    }
    return false;
  }

  /**
   * Apply peer session hello.
   * @param {any} body
   */
  applyPeerSession(body) {
    if (!body || typeof body !== "object") return;
    if (typeof body.sessionId === "string" && body.sessionId) {
      this.peerSessionId = body.sessionId;
      if (!this.sessionId) this.sessionId = body.sessionId;
    }
    if (Number.isInteger(body.epoch) && body.epoch >= 0) {
      this.epoch = body.epoch;
    }
    if (Array.isArray(body.capabilities)) {
      // Intersection not required for foundation; keep peer list for apps.
      this.peerCapabilities = body.capabilities.slice();
    }
  }

  /** @returns {object} */
  toSessionBody() {
    return {
      sessionId: this.ensureSessionId(),
      role: this.role,
      capabilities: this.capabilities.slice(),
      epoch: this.epoch,
    };
  }

  /**
   * @param {unknown} [committedSnapshot]
   * @returns {{ sessionId: string, seq: number, epoch: number, committedSnapshot?: unknown }}
   */
  toResumeState(committedSnapshot) {
    const out = {
      sessionId: this.ensureSessionId(),
      seq: this.phaseSeq,
      epoch: this.epoch,
    };
    if (committedSnapshot !== undefined) {
      out.committedSnapshot = committedSnapshot;
    }
    return out;
  }
}

function defaultCapabilities() {
  return [
    CONTROL_CAPABILITY.TYPES_V1,
    CONTROL_CAPABILITY.SESSION_V1,
    CONTROL_CAPABILITY.RESUME_V1,
    CONTROL_CAPABILITY.ACK_V1,
    CONTROL_CAPABILITY.SNAPSHOT_V1,
  ];
}

/** @returns {string} */
export function createSessionId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `xaiop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
