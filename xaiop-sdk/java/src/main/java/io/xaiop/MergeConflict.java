package io.xaiop;

/**
 * Conflict policy for {@link Merge}. Applies to <b>conflicting keys only</b>: object keys
 * recurse, arrays and scalars are atomic at their key.
 *
 * <p>Wire names match the Node.js SDK's {@code MERGE_CONFLICT}.
 */
public enum MergeConflict {
  /** Overlay wins (default). */
  OVERWRITE("overwrite"),
  /** Base wins. */
  KEEP("keep");

  private final String wireName;

  MergeConflict(String wireName) {
    this.wireName = wireName;
  }

  /** @return {@code "overwrite"} / {@code "keep"} -- the value used by the other SDKs. */
  public String wireName() {
    return wireName;
  }

  @Override
  public String toString() {
    return wireName;
  }
}
