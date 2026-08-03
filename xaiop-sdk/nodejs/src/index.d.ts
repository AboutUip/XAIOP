/**
 * XAIOP Node.js SDK (protocol v0.2.0 Frozen)
 */

export const PROTOCOL_VERSION: "0.2.1";

export type CompatFixId =
  | "forcedRoot"
  | "rewriteBareNameArray"
  | "rewriteEnterLine"
  | "ignoreBareLeaveAtRoot"
  | "popAndRetry"
  | "locatePathTrim"
  | "locatePathStripSpaces"
  | "locatePathArraySuffix";

export const COMPAT_FIX_DEFAULTS: Readonly<Record<CompatFixId, true>>;
export const COMPAT_FIX_IDS: ReadonlyArray<CompatFixId>;

export class CompatPolicy {
  forcedRoot: boolean;
  rewriteBareNameArray: boolean;
  rewriteEnterLine: boolean;
  ignoreBareLeaveAtRoot: boolean;
  popAndRetry: boolean;
  locatePathTrim: boolean;
  locatePathStripSpaces: boolean;
  locatePathArraySuffix: boolean;
  constructor(overrides?: Partial<Record<CompatFixId, boolean>>);
  resetToDefaults(): this;
  snapshot(): Readonly<Record<CompatFixId, boolean>>;
  set(id: CompatFixId, enabled: boolean): boolean;
}

export class XaiopSyntaxError extends Error {
  line?: number;
  constructor(message: string, meta?: { line?: number });
}

export class XaiopEncodeError extends Error {
  path?: string;
  constructor(message: string, meta?: { path?: string });
}

export class XaiopFragment {
  entries: Record<string, unknown>;
  readonly isFragment: true;
  constructor(entries: Record<string, unknown>);
  notation(): string;
}

export type DotPolicy = "none" | "perTopLevelKey" | "perNKeys" | "custom";

export const DOT_POLICY: {
  readonly NONE: "none";
  readonly PER_TOP_LEVEL_KEY: "perTopLevelKey";
  readonly PER_N_KEYS: "perNKeys";
  readonly CUSTOM: "custom";
};

export interface PhaseContext {
  key: string;
  index: number;
  total: number;
  keysInPhase: number;
  phaseIndex: number;
}

export interface EncodeOptions {
  /** Document root shape. Default `auto`. */
  root?: "auto" | "object" | "array";
  /**
   * Wire style. `reset` inserts `.` between phases (default).
   * `relative` only applies when `dotPolicy` is `none`.
   */
  style?: "reset" | "relative";
  /** How often to emit `.` between top-level keys. Default `perTopLevelKey`. */
  dotPolicy?: DotPolicy;
  /** Keys per phase when `dotPolicy` is `perNKeys`. Default `1`. */
  phaseEvery?: number;
  /** Cap the number of `.`-separated phases (merges the tail). */
  maxPhases?: number;
  /** Append a trailing `.` line. Default `false`. */
  finalDot?: boolean;
  keyOrder?: "insertion" | "sorted";
  /** Object `null` values: omit key or throw. Default `omit`. */
  /**
   * Object / array `null` values.
   * - `encode` (default): emit typed `null` Content (`PROT-CONTENT` 0.2.1+)
   * - `omit`: drop object keys that are null (array null still encodes — length-preserving)
   * - `error`: throw on any null
   */
  nullPolicy?: "encode" | "omit" | "error";
  /** Object `undefined` values: omit key or throw. Default `omit`. */
  undefinedPolicy?: "omit" | "error";
  /**
   * Required when `dotPolicy` is `custom`. Return true to end the phase after this key.
   */
  shouldPhase?: (ctx: PhaseContext) => boolean;
}

/**
 * Encode rejects keys that are empty, contain whitespace/`:`, end with `-`
 * (array postfix), or contain `>` `<` `=` `!`.
 */

/** @param compat false = strict; true = all fixes; policy / partial = fine-grained */
export function parseSync(
  source: string,
  compat?: boolean | CompatPolicy | Partial<Record<CompatFixId, boolean>>,
): unknown | XaiopFragment;
export function parseAsync(
  source: string,
  compat?: boolean | CompatPolicy | Partial<Record<CompatFixId, boolean>>,
): Promise<unknown | XaiopFragment>;

export function encodeSync(value: unknown, options?: EncodeOptions): string;
export function encode(value: unknown, options?: EncodeOptions): Promise<string>;

export class XaiopEngine {
  constructor(options?: { compatibilityMode?: boolean });

  readonly compatibilityMode: boolean;
  setCompatibilityMode(enabled: boolean): this;

  /** Defaults `true`. Active only while compatibility mode is on. */
  readonly compatForcedRoot: boolean;
  setCompatForcedRoot(enabled: boolean): boolean;

  readonly compatRewriteBareNameArray: boolean;
  setCompatRewriteBareNameArray(enabled: boolean): boolean;

  readonly compatRewriteEnterLine: boolean;
  setCompatRewriteEnterLine(enabled: boolean): boolean;

  readonly compatIgnoreBareLeaveAtRoot: boolean;
  setCompatIgnoreBareLeaveAtRoot(enabled: boolean): boolean;

  readonly compatPopAndRetry: boolean;
  setCompatPopAndRetry(enabled: boolean): boolean;

  readonly compatLocatePathTrim: boolean;
  setCompatLocatePathTrim(enabled: boolean): boolean;

  readonly compatLocatePathStripSpaces: boolean;
  setCompatLocatePathStripSpaces(enabled: boolean): boolean;

  readonly compatLocatePathArraySuffix: boolean;
  setCompatLocatePathArraySuffix(enabled: boolean): boolean;

  upload(source: string): Promise<string>;
  uploadSync(source: string): string;
  /** Encode JSON → XAIOP (strict), then upload. */
  uploadJson(value: unknown, encodeOptions?: EncodeOptions): Promise<string>;
  uploadJsonSync(value: unknown, encodeOptions?: EncodeOptions): string;
  get(dataId: string): Promise<unknown>;
  getSync(dataId: string): unknown;
  has(dataId: string): boolean;
  delete(dataId: string): boolean;
  clear(): void;

  encode(value: unknown, options?: EncodeOptions): Promise<string>;
  encodeSync(value: unknown, options?: EncodeOptions): string;

  /** @param compatibilityMode omitted / false = strict; true = all fixes on */
  static parse(source: string, compatibilityMode?: boolean): Promise<unknown>;
  static parseSync(source: string, compatibilityMode?: boolean): unknown;
  static encode(value: unknown, options?: EncodeOptions): Promise<string>;
  static encodeSync(value: unknown, options?: EncodeOptions): string;
}

export type StreamMode = "callback" | "promise" | "asyncIterator" | "events";
export type StreamStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "completing"
  | "completed"
  | "aborted"
  | "error";
export type TransportKind = "http" | "sse" | "websocket" | "raw";

export const STREAM_MODES: {
  readonly CALLBACK: "callback";
  readonly PROMISE: "promise";
  readonly ASYNC_ITERATOR: "asyncIterator";
  readonly EVENTS: "events";
};
export const STREAM_STATUS: {
  readonly IDLE: "idle";
  readonly CONNECTING: "connecting";
  readonly STREAMING: "streaming";
  readonly COMPLETING: "completing";
  readonly COMPLETED: "completed";
  readonly ABORTED: "aborted";
  readonly ERROR: "error";
};
export const TRANSPORT_KIND: {
  readonly HTTP: "http";
  readonly SSE: "sse";
  readonly WEBSOCKET: "websocket";
  readonly RAW: "raw";
};

export function isStreamBusy(status: StreamStatus): boolean;

export function materializeSnapshot(parsed: unknown): unknown;

export class DotCheckpointEngine {
  constructor(hooks: {
    compat?: boolean | object | false;
    streamProcessing: boolean;
    onChunk: (diff: unknown) => void;
  });
  readonly buffer: string;
  readonly snapshot: unknown | undefined;
  /** Latest committed phase parse (stream processing). */
  readonly committedSnapshot?: unknown;
  push(chunk: string): void;
  finish(): void;
}

export interface TransportRequestOptions {
  url?: string;
  transport?: TransportKind;
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | Uint8Array | ReadableStream | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  protocols?: string | string[];
  sseEvents?: string[];
  source?: AsyncIterable<string | Uint8Array> | ReadableStream;
  fetch?: typeof fetch;
}

export interface StreamStatusInfo {
  status: StreamStatus;
  url: string;
  streamProcessing: boolean;
  compatibilityMode: boolean;
  modes: StreamMode[];
  busy: boolean;
  hasSnapshot: boolean;
  /** True once at least one phase/EOF commit produced JSON. */
  hasCommittedSnapshot: boolean;
  bufferLength: number;
  lastError: string | null;
}

/**
 * Independent streaming client. Dot phases: parse each `.`-bounded segment
 * (PROT-HIER reset); `done` parses the full buffer. Not cumulative JSON diffs.
 */
export class XaiopStream implements AsyncIterable<unknown> {
  constructor(
    url: string,
    options?: {
      streamProcessing?: boolean;
      compatibilityMode?: boolean;
      modes?: StreamMode[] | Iterable<StreamMode>;
    },
  );

  readonly url: string;
  readonly status: StreamStatus;
  readonly streamProcessing: boolean;
  readonly compatibilityMode: boolean;
  readonly lastError: Error | null;

  getModes(): StreamMode[];
  getSnapshot(): unknown | undefined;
  /**
   * Cumulative JSON through last `.` / EOF commit. Available mid-stream.
   * Does not change `getSnapshot()` (final after finish).
   */
  getCommittedSnapshot(): unknown | undefined;
  getBufferedText(): string;
  isBusy(): boolean;
  getStatus(): StreamStatusInfo;

  setUrl(url: string): boolean;
  setStreamProcessing(enabled: boolean): boolean;
  setCompatibilityMode(enabled: boolean): this;

  readonly compatForcedRoot: boolean;
  setCompatForcedRoot(enabled: boolean): boolean;
  readonly compatRewriteBareNameArray: boolean;
  setCompatRewriteBareNameArray(enabled: boolean): boolean;
  readonly compatRewriteEnterLine: boolean;
  setCompatRewriteEnterLine(enabled: boolean): boolean;
  readonly compatIgnoreBareLeaveAtRoot: boolean;
  setCompatIgnoreBareLeaveAtRoot(enabled: boolean): boolean;
  readonly compatPopAndRetry: boolean;
  setCompatPopAndRetry(enabled: boolean): boolean;
  readonly compatLocatePathTrim: boolean;
  setCompatLocatePathTrim(enabled: boolean): boolean;
  readonly compatLocatePathStripSpaces: boolean;
  setCompatLocatePathStripSpaces(enabled: boolean): boolean;
  readonly compatLocatePathArraySuffix: boolean;
  setCompatLocatePathArraySuffix(enabled: boolean): boolean;

  setModes(modes: StreamMode[] | Iterable<StreamMode>): boolean;
  enableMode(mode: StreamMode): boolean;
  disableMode(mode: StreamMode): boolean;

  onChunk(fn: (diff: unknown) => void): this;
  onDone(fn: (json: unknown) => void): this;
  onError(fn: (err: Error) => void): this;
  offChunk(): this;
  offDone(): this;
  offError(): this;

  on(
    event: "chunk" | "done" | "error" | "status",
    listener: (...args: any[]) => void,
  ): this;
  off(
    event: "chunk" | "done" | "error" | "status",
    listener: (...args: any[]) => void,
  ): this;
  once(
    event: "chunk" | "done" | "error" | "status",
    listener: (...args: any[]) => void,
  ): this;

  chunks(): AsyncGenerator<unknown, void, void>;
  [Symbol.asyncIterator](): AsyncGenerator<unknown, void, void>;

  send(options?: TransportRequestOptions): Promise<unknown> | undefined;
  abort(): boolean;
}

/** Options shared by WS connect / listen connection wrappers. */
export interface WsConnectionOptions {
  streamProcessing?: boolean;
  compatibilityMode?: boolean;
}

export interface WsConnectOptions extends WsConnectionOptions {
  protocols?: string | string[];
  handshakeTimeoutMs?: number;
  headers?: Record<string, string>;
  onPhase?: (diff: unknown) => void;
  onChunk?: (diff: unknown) => void;
  onDone?: (json: unknown) => void;
  onError?: (err: Error) => void;
}

export interface WsListenOptions extends WsConnectionOptions {
  port?: number;
  host?: string;
  path?: string;
  server?: import("node:http").Server | import("node:https").Server;
  backlog?: number;
  perMessageDeflate?: boolean | object;
  maxPayload?: number;
}

export interface PhaseEncodeOptions {
  final?: boolean;
  encodeOptions?: EncodeOptions;
}

export function encodePhaseJson(
  key: string,
  value: unknown,
  options?: PhaseEncodeOptions,
): string;
export function encodePhaseObject(
  object: Record<string, unknown>,
  options?: PhaseEncodeOptions,
): string;

/**
 * One WebSocket carrying XAIOP phases (push and/or consume).
 * Same type for listen-accept and connect.
 */
export class XaiopWsConnection {
  constructor(
    socket: unknown,
    options?: WsConnectionOptions & {
      onPhase?: (diff: unknown) => void;
      onChunk?: (diff: unknown) => void;
      onDone?: (json: unknown) => void;
      onError?: (err: Error) => void;
    },
  );

  readonly readyState: number;
  readonly closed: Promise<void>;
  /** Final Snapshot when peer closes. */
  readonly done: Promise<unknown>;
  readonly lastError: Error | null;

  getBufferedText(): string;
  getSnapshot(): unknown | undefined;
  getCommittedSnapshot(): unknown | undefined;

  onPhase(fn: ((diff: unknown) => void) | null): this;
  /** Alias of `onPhase`. */
  onChunk(fn: ((diff: unknown) => void) | null): this;
  onDone(fn: ((json: unknown) => void) | null): this;
  onError(fn: ((err: Error) => void) | null): this;

  pushJson(
    key: string,
    value: unknown,
    options?: PhaseEncodeOptions,
  ): boolean;
  pushObject(
    object: Record<string, unknown>,
    options?: PhaseEncodeOptions,
  ): boolean;
  pushWire(text: string): boolean;
  end(opts?: { code?: number; reason?: string }): Promise<void>;
  abort(): boolean;
}

/** Accepting hub for skeleton / phase push. */
export class XaiopWsHub {
  readonly server: unknown;
  readonly port: number | null;
  readonly connections: XaiopWsConnection[];

  url(host?: string): string;
  onConnection(
    fn:
      | ((
          conn: XaiopWsConnection,
          req: import("node:http").IncomingMessage,
        ) => void)
      | null,
  ): this;
  onError(fn: ((err: Error) => void) | null): this;
  close(): Promise<void>;
}

/**
 * First-class WebSocket session API (listen/push + connect/consume).
 * Preferred path for long-lived skeleton streams.
 */
export class XaiopWs {
  static connect(
    url: string,
    options?: WsConnectOptions,
  ): Promise<XaiopWsConnection>;
  static listen(options?: WsListenOptions): Promise<XaiopWsHub>;
  static encodePhaseJson: typeof encodePhaseJson;
  static encodePhaseObject: typeof encodePhaseObject;
}
