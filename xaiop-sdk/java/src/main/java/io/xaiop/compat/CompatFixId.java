package io.xaiop.compat;

/**
 * Identifiers for independent, deterministic compatibility-mode corrections
 * (SDK ingest only; wire protocol unchanged).
 *
 * <p>Faithful port of the {@code CompatFixId} keys defined in the Node.js SDK's
 * {@code compat.js} ({@code COMPAT_FIX_DEFAULTS}). Constant names intentionally mirror
 * the JS fix ids verbatim (lowerCamelCase) so documentation and cross-SDK references
 * stay in lockstep.
 */
public enum CompatFixId {
  forcedRoot,
  rewriteBareNameArray,
  rewriteEnterLine,
  ignoreBareLeaveAtRoot,
  popAndRetry,
  locatePathTrim,
  locatePathStripSpaces,
  locatePathArraySuffix
}
