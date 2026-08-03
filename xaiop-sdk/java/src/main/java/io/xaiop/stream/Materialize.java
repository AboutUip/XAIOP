package io.xaiop.stream;

import io.xaiop.Json;
import io.xaiop.XaiopFragment;

/**
 * Materializes parser output into a JSON-facing snapshot value, faithful port of the Node.js
 * SDK's {@code stream/materialize.js}.
 *
 * <p>Root fragments ({@link XaiopFragment}) become their entries object for Snapshot / Diff
 * surfaces (PROT-STREAM JSON-facing). The wire fragment notation stays available through
 * {@link io.xaiop.Parse} when not streaming.
 */
public final class Materialize {
  private Materialize() {}

  /** Deep-cloned JSON snapshot (safe to retain / mutate independently of the parser). */
  public static Object materializeSnapshot(Object parsed) {
    if (parsed instanceof XaiopFragment fragment) {
      return Json.deepClone(fragment.getEntries());
    }
    return Json.deepClone(parsed);
  }

  /**
   * Transfers parser output into a JSON-facing value <b>without</b> cloning a plain document
   * root (ownership moves to the caller). Fragments still deep-clone their entries because the
   * live parser may retain nested references.
   *
   * <p>Use only when the parse result will not be reused by the parser.
   */
  public static Object materializeOwned(Object parsed) {
    if (parsed instanceof XaiopFragment fragment) {
      return Json.deepClone(fragment.getEntries());
    }
    return parsed;
  }
}
