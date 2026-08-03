package io.xaiop;

import io.xaiop.compat.Compat;
import io.xaiop.compat.CompatFixId;
import io.xaiop.stream.Materialize;

import java.util.Map;

/**
 * JSON &harr; XAIOP merge / inject (pre/post-processing -- not streaming). Faithful port of the
 * Node.js SDK's {@code merge.js}.
 *
 * <p>Conflict policy applies only to <b>conflicting keys</b> (deep object walk). Arrays and
 * scalars are atomic at their key.
 */
public final class Merge {
  private Merge() {}

  /** Deep-merges {@code overlay} into a clone of {@code base} ({@link MergeConflict#OVERWRITE}). */
  public static Object mergeJson(Object base, Object overlay) {
    return mergeJson(base, overlay, MergeConflict.OVERWRITE);
  }

  /**
   * Deep-merges {@code overlay} into a clone of {@code base}. Object keys recurse; array and
   * scalar values conflict as a whole at that key.
   */
  public static Object mergeJson(Object base, Object overlay, MergeConflict conflict) {
    MergeConflict policy = requireConflict(conflict);
    return mergeInto(Json.deepClone(base), Json.deepClone(overlay), policy);
  }

  /** Normalizes a parse / store value into a plain JSON tree for merging. */
  public static Object toMergeableJson(Object value) {
    if (value instanceof XaiopFragment) {
      return Materialize.materializeSnapshot(value);
    }
    return Json.deepClone(value);
  }

  /** Merges base JSON with an XAIOP document &rarr; JSON. */
  public static Object mergeToJson(Object baseJson, String xaiopSource) {
    return mergeToJson(baseJson, xaiopSource, MergeOptions.defaults());
  }

  public static Object mergeToJson(Object baseJson, String xaiopSource, MergeOptions options) {
    if (xaiopSource == null) {
      throw new NullPointerException("xaiopSource must be a string");
    }
    MergeOptions opt = options == null ? MergeOptions.defaults() : options;
    Object overlay =
        Materialize.materializeSnapshot(Parse.parse(xaiopSource, compatOf(opt)));
    return mergeJson(baseJson, overlay, opt.conflict());
  }

  /**
   * Merges base JSON with an XAIOP document &rarr; XAIOP wire (post-process encode). The default
   * encode is single-phase ({@link DotPolicy#NONE}) -- not a streaming phase layout.
   */
  public static String mergeToXaiop(Object baseJson, String xaiopSource) {
    return mergeToXaiop(baseJson, xaiopSource, MergeOptions.defaults());
  }

  public static String mergeToXaiop(Object baseJson, String xaiopSource, MergeOptions options) {
    MergeOptions opt = options == null ? MergeOptions.defaults() : options;
    Object json = mergeToJson(baseJson, xaiopSource, opt);
    return Encode.encode(json, encodeOptionsOf(opt));
  }

  /** Shapes an inject result as JSON (deep clone) or XAIOP wire text. */
  public static Object formatInjectResult(Object value, MergeOptions options) {
    MergeOptions opt = options == null ? MergeOptions.defaults() : options;
    if (opt.as() == MergeOptions.As.XAIOP) {
      return Encode.encode(value, encodeOptionsOf(opt));
    }
    return Json.deepClone(value);
  }

  private static EncodeOptions encodeOptionsOf(MergeOptions options) {
    return options.encodeOptions() != null ? options.encodeOptions() : EncodeOptions.singlePhase();
  }

  private static Map<CompatFixId, Boolean> compatOf(MergeOptions options) {
    return Compat.resolveCompatOptions(options.compat());
  }

  private static MergeConflict requireConflict(MergeConflict conflict) {
    if (conflict == null) {
      throw new IllegalArgumentException("merge conflict must be \"overwrite\" or \"keep\"");
    }
    return conflict;
  }

  /** Mutating merge: writes overlay keys into {@code target} (already owned). */
  @SuppressWarnings("unchecked")
  private static Object mergeInto(Object target, Object overlay, MergeConflict conflict) {
    if (!(target instanceof Map) || !(overlay instanceof Map)) {
      // Root (or nested atomic) conflict: the whole value.
      return conflict == MergeConflict.OVERWRITE ? overlay : target;
    }

    Map<String, Object> tgt = (Map<String, Object>) target;
    Map<String, Object> ovl = (Map<String, Object>) overlay;
    for (Map.Entry<String, Object> e : ovl.entrySet()) {
      String key = e.getKey();
      Object ov = e.getValue();
      if (!tgt.containsKey(key)) {
        tgt.put(key, ov);
        continue;
      }
      Object tv = tgt.get(key);
      if (tv instanceof Map && ov instanceof Map) {
        mergeInto(tv, ov, conflict);
        continue;
      }
      // Conflicting key (type mismatch, array, or scalar): overwrite or keep.
      if (conflict == MergeConflict.OVERWRITE) {
        tgt.put(key, ov);
      }
    }
    return tgt;
  }
}
