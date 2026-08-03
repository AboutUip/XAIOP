/**
 * XAIOP Node.js SDK (protocol v0.4.0 Frozen)
 */

export const PROTOCOL_VERSION: "0.4.0";
export const SDK_VERSION: "0.7.0";

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
  /**
   * Phase policy:
   * - `DotPolicy` name — frequency at top-level object keys (default `perTopLevelKey`)
   * - `string[]` — JSON paths (`a.b[2]`) where `.` is inserted **after** each node;
   *   mutually exclusive with `phaseEvery` / `maxPhases` / `shouldPhase`;
   *   requires `style:'reset'` (default). Index segments must be **final**
   *   (no cut inside an array element object).
   */
  dotPolicy?: DotPolicy | string[];
  /** Keys per phase when `dotPolicy` is `perNKeys`. Default `1`. */
  phaseEvery?: number;
  /** Cap the number of `.`-separated phases (merges the tail). */
  maxPhases?: number;
  /** Append a trailing `.` line. Default `false`. */
  finalDot?: boolean;
  keyOrder?: "insertion" | "sorted";
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

/** Incremental parser — feed lines/text; equivalent to parseSync on the concatenation. */
export class LiveXaiopParser {
  constructor(
    compat?: boolean | CompatPolicy | Partial<Record<CompatFixId, boolean>>,
  );
  feedLine(line: string): this;
  feedText(text: string): this;
  /** Live document reference; clone before exposing to callers. */
  value(): unknown | XaiopFragment;
}

export function encodeSync(value: unknown, options?: EncodeOptions): string;
export function encode(value: unknown, options?: EncodeOptions): Promise<string>;

/** Parse a JSON-style path (`a.b[0].c`) into segments. */
export function parseJsonPath(path: string): Array<string | number>;
/** Format path segments back to `a.b[0].c`. */
export function formatJsonPath(segs: Array<string | number>): string;

/** Conflict policy for merge/inject: conflicting keys only. */
export type MergeConflict = "overwrite" | "keep";

export const MERGE_CONFLICT: {
  readonly OVERWRITE: "overwrite";
  readonly KEEP: "keep";
};

export interface MergeOptions {
  /** Default `overwrite`. Only conflicting keys; deep objects recurse. */
  conflict?: MergeConflict;
  /** Parse compat for the XAIOP operand. Free fn default strict. */
  compat?: boolean | CompatPolicy | Partial<Record<CompatFixId, boolean>>;
}

export interface MergeToXaiopOptions extends MergeOptions {
  /** Encode of merged JSON. Default `{ dotPolicy: "none" }`. */
  encodeOptions?: EncodeOptions;
}

export interface InjectOptions extends MergeOptions {
  /** Return shape after mutating the store. Default `json`. */
  as?: "json" | "xaiop";
  encodeOptions?: EncodeOptions;
}

/**
 * Deep-merge two JSON trees. Arrays/scalars conflict as a whole at that key.
 * Pre/post-processing only — not a streaming API.
 */
export function mergeJson(
  base: unknown,
  overlay: unknown,
  conflict?: MergeConflict,
): unknown;

/** Merge base JSON + XAIOP wire → JSON. */
export function mergeToJson(
  baseJson: unknown,
  xaiopSource: string,
  options?: MergeOptions,
): unknown;

/** Merge base JSON + XAIOP wire → XAIOP wire. */
export function mergeToXaiop(
  baseJson: unknown,
  xaiopSource: string,
  options?: MergeToXaiopOptions,
): string;

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

  /** Merge base JSON + XAIOP → JSON (instance compat for parse). */
  mergeToJson(
    baseJson: unknown,
    xaiopSource: string,
    options?: MergeOptions,
  ): Promise<unknown>;
  mergeToJsonSync(
    baseJson: unknown,
    xaiopSource: string,
    options?: MergeOptions,
  ): unknown;

  /** Merge base JSON + XAIOP → XAIOP wire. */
  mergeToXaiop(
    baseJson: unknown,
    xaiopSource: string,
    options?: MergeToXaiopOptions,
  ): Promise<string>;
  mergeToXaiopSync(
    baseJson: unknown,
    xaiopSource: string,
    options?: MergeToXaiopOptions,
  ): string;

  /**
   * Inject XAIOP into stored `dataId` (mutates store).
   * Default return JSON; `as: "xaiop"` returns wire after merge.
   */
  injectXaiop(
    dataId: string,
    xaiopSource: string,
    options?: InjectOptions,
  ): Promise<unknown | string>;
  injectXaiopSync(
    dataId: string,
    xaiopSource: string,
    options?: InjectOptions,
  ): unknown | string;

  /** Inject JSON into stored `dataId` (mutates store). */
  injectJson(
    dataId: string,
    jsonValue: unknown,
    options?: InjectOptions,
  ): Promise<unknown | string>;
  injectJsonSync(
    dataId: string,
    jsonValue: unknown,
    options?: InjectOptions,
  ): unknown | string;

  /** @param compatibilityMode omitted / false = strict; true = all fixes on */
  static parse(source: string, compatibilityMode?: boolean): Promise<unknown>;
  static parseSync(source: string, compatibilityMode?: boolean): unknown;
  static encode(value: unknown, options?: EncodeOptions): Promise<string>;
  static encodeSync(value: unknown, options?: EncodeOptions): string;
  static mergeToJson(
    baseJson: unknown,
    xaiopSource: string,
    options?: MergeOptions,
  ): unknown;
  static mergeToXaiop(
    baseJson: unknown,
    xaiopSource: string,
    options?: MergeToXaiopOptions,
  ): string;
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

export type HistoryNodeKind = "dot" | "tail";

export const HISTORY_NODE_KIND: {
  readonly DOT: "dot";
  readonly TAIL: "tail";
};

export interface HistoryNode {
  index: number;
  kind: HistoryNodeKind;
  bufferStart: number;
  bufferEnd: number;
  wire: string | null;
  before: unknown;
  after: unknown;
  diff: unknown;
}

export interface HistoryInfo {
  snapshot: boolean;
  realtime: boolean;
  length: number;
  liveCursor: number;
  sourceKey: string | null;
  hasRangeView: boolean;
  rangeView: { from: number; to: number } | null;
}

/**
 * Opt-in parse-chain history. Constructed by DotCheckpointEngine when
 * `historySnapshot` and/or `historyRealtime` is true.
 */
export class ParseHistory {
  readonly enabled: boolean;
  readonly snapshotEnabled: boolean;
  readonly realtimeEnabled: boolean;
  readonly length: number;
  readonly liveCursor: number;
  readonly sourceKey: string | null;
  info(): HistoryInfo;
  exportTimeRoot(): HistoryNode[];
  getNode(index: number): HistoryNode;
  getDiff(index: number): unknown;
  getBefore(index: number): unknown;
  getAfter(index: number): unknown;
  compare(
    indexA: number,
    indexB: number,
  ): { indexA: number; indexB: number; a: unknown; b: unknown };
  viewRange(
    from: number,
    to: number,
  ): { from: number; to: number; nodes: HistoryNode[]; json: unknown };
  setSource(key: string | null | undefined): {
    released: boolean;
    previous: string | null;
  };
  release(): void;
  jumpTo(index: number): {
    index: number;
    kept: number;
    discarded: number;
    after: unknown;
    bufferEnd: number;
    wirePrefix: string | null;
  };
  canJumpTo(index: number): boolean;
}

export class DotCheckpointEngine {
  constructor(hooks: {
    compat?: boolean | object | false;
    streamProcessing: boolean;
    onChunk: (diff: unknown) => void;
    /** When false, skip phase-local Diff parses (Commit/final unchanged). Default true. */
    emitDiff?: boolean;
    /**
     * When true (default), batch all complete `.` in the buffer window into one
     * feed + one Commit + one onChunk (multi-phase Diff = committed tree).
     * When false, emit stepwise per `.`.
     */
    mergeChunkWindow?: boolean;
    /** Opt-in read-only history (git-like). Default false. */
    historySnapshot?: boolean;
    /** Opt-in realtime forward-jump history. Default false. */
    historyRealtime?: boolean;
    /** Retain per-node wire slices when history is on. Default true. */
    retainWireHistory?: boolean;
  });
  readonly buffer: string;
  readonly snapshot: unknown | undefined;
  /** Latest committed phase parse (stream processing). */
  readonly committedSnapshot?: unknown;
  readonly mergeChunkWindow: boolean;
  /** `null` when both history modes are off. */
  readonly history: ParseHistory | null;
  historyInfo(): HistoryInfo;
  /**
   * Realtime: jump live head forward; discard nodes after the positioning index.
   * Rebuilds buffer / Commit from the retained prefix.
   */
  jumpTo(index: number): {
    index: number;
    kept: number;
    discarded: number;
    after: unknown;
    bufferEnd: number;
    wirePrefix: string | null;
  };
  /** Sync ingest — scans immediately. */
  push(chunk: string): void;
  /** Async ingest — coalesce scan on setImmediate; rapid calls share one drain. */
  pushAsync(chunk: string): Promise<void>;
  finish(): void;
  finishAsync(): Promise<void>;
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
      /** Default true — batch complete `.` in the buffer window. */
      mergeChunkWindow?: boolean;
      /** When true, transport uses coalesced `pushAsync`. Default false. */
      asyncParse?: boolean;
      /** Opt-in read-only parse history. Default false. */
      historySnapshot?: boolean;
      /** Opt-in realtime forward-jump history. Default false. */
      historyRealtime?: boolean;
      /** Retain per-node wire when history is on. Default true. */
      retainWireHistory?: boolean;
    },
  );

  readonly url: string;
  readonly status: StreamStatus;
  readonly streamProcessing: boolean;
  readonly compatibilityMode: boolean;
  readonly mergeChunkWindow: boolean;
  readonly asyncParse: boolean;
  readonly historySnapshot: boolean;
  readonly historyRealtime: boolean;
  /** Active engine history during/after send, else null. */
  readonly history: ParseHistory | null;
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
  /** Realtime jump on the active engine (requires historyRealtime). */
  jumpTo(index: number): {
    index: number;
    kept: number;
    discarded: number;
    after: unknown;
    bufferEnd: number;
    wirePrefix: string | null;
  };
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
