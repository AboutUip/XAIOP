package io.xaiop;

/**
 * Phase (`.`) frequency policies for {@link Encode}.
 *
 * <p>Values are the verbatim strings used by the Node.js SDK's {@code DOT_POLICY} so wire
 * layout stays identical across SDKs. A <em>path array</em> may be used instead of a policy
 * name -- see {@link EncodeOptions.Builder#dotPolicyPaths(java.util.List)}.
 */
public final class DotPolicy {
  /** One single phase; no `.` at all (unless {@code finalDot}). */
  public static final String NONE = "none";

  /** One phase per top-level key (default). */
  public static final String PER_TOP_LEVEL_KEY = "perTopLevelKey";

  /** One phase per {@code phaseEvery} top-level keys. */
  public static final String PER_N_KEYS = "perNKeys";

  /** Caller decides each boundary via {@code shouldPhase}. */
  public static final String CUSTOM = "custom";

  private DotPolicy() {}

  /** @return whether {@code policy} is one of the four policy names. */
  public static boolean isKnown(String policy) {
    return NONE.equals(policy)
        || PER_TOP_LEVEL_KEY.equals(policy)
        || PER_N_KEYS.equals(policy)
        || CUSTOM.equals(policy);
  }
}
