/**
 * Isomorphic XAIOP core — parse / encode / merge / checkpoint (no Node I/O).
 */

export { cloneJson } from "./clone.js";
export {
  COMPAT_FIX_DEFAULTS,
  COMPAT_FIX_IDS,
  CompatPolicy,
  resolveCompatOptions,
} from "./compat.js";
export {
  DOT_POLICY,
  encode,
  encodeSync,
  formatJsonPath,
  parseJsonPath,
  XaiopEncodeError,
} from "./encode.js";
export {
  PROTOCOL_VERSION,
  SDK_VERSION,
  XaiopEngine,
} from "./engine.js";
export {
  formatInjectResult,
  MERGE_CONFLICT,
  mergeJson,
  mergeToJson,
  mergeToXaiop,
  toMergeableJson,
} from "./merge.js";
export {
  LiveXaiopParser,
  parseAsync,
  parseSync,
  XaiopFragment,
  XaiopSyntaxError,
} from "./parse.js";
export { materializeOwned, materializeSnapshot } from "./materialize.js";
export {
  ALL_STREAM_MODES,
  normalizeModes,
  STREAM_MODES,
} from "./modes.js";
export {
  isStreamBusy,
  STREAM_IDLE_LIKE,
  STREAM_STATUS,
} from "./states.js";
export { HISTORY_NODE_KIND, ParseHistory } from "./history.js";
export { DotCheckpointEngine } from "./checkpoint.js";
export {
  LINE_KIND,
  classifyLine,
  emptyLineView,
  runLineInterceptChain,
} from "./line-intercept.js";
export {
  applyAnnotationSpans,
  encodeAsSiblingLines,
  pathEscapesTypeCheck,
} from "./annotation-span.js";
export { encodePhaseJson, encodePhaseObject } from "./phase-encode.js";
export { scheduleImmediate } from "./schedule.js";
export {
  TYPE,
  TYPE_SCHEMA_FRAME_PREFIX,
  TypeChecker,
  TypeFreezeSession,
  TypeRegistry,
  XaiopTypeError,
  arrayType,
  canonicalizeType,
  classifyValue,
  encodeTypeSchemaFrame,
  objectType,
  parseTypeSurface,
  tryParseTypeSchemaFrame,
  typeCompatible,
  typeToString,
  valueMatchesType,
} from "./types.js";
