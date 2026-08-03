package io.xaiop.compat;

import java.util.EnumMap;
import java.util.Map;

/**
 * Normalizes parse / upload second-arg style options into a policy snapshot, or {@code null}
 * (strict).
 *
 * <p>Faithful port of {@code resolveCompatOptions} from the Node.js SDK's {@code compat.js}:
 *
 * <ul>
 *   <li>{@code false} / {@code null} / omitted &rarr; strict ({@code null})
 *   <li>{@code true} &rarr; all fixes enabled
 *   <li>{@link CompatPolicy} &rarr; its snapshot
 *   <li>{@code Map<CompatFixId,Boolean>} &rarr; treated as overrides on defaults
 * </ul>
 */
public final class Compat {
  private Compat() {}

  /** Strict (no compatibility fixes). */
  public static Map<CompatFixId, Boolean> resolveCompatOptions() {
    return null;
  }

  public static Map<CompatFixId, Boolean> resolveCompatOptions(boolean compat) {
    return compat ? new CompatPolicy().snapshot() : null;
  }

  public static Map<CompatFixId, Boolean> resolveCompatOptions(CompatPolicy policy) {
    return policy == null ? null : policy.snapshot();
  }

  public static Map<CompatFixId, Boolean> resolveCompatOptions(Map<CompatFixId, Boolean> overrides) {
    return overrides == null ? null : new CompatPolicy(overrides).snapshot();
  }

  /**
   * Dynamic entry point mirroring the JS function's single flexible argument. Prefer the typed
   * overloads above from Java call sites; this exists for generic dispatch (e.g. from
   * {@code Parse}'s reflection-free overload forwarding).
   *
   * @param arg {@code null}, {@link Boolean}, {@link CompatPolicy}, or
   *     {@code Map<CompatFixId,Boolean>}
   */
  @SuppressWarnings("unchecked")
  public static Map<CompatFixId, Boolean> resolveCompatOptions(Object arg) {
    if (arg == null) return null;
    if (arg instanceof Boolean b) return resolveCompatOptions(b.booleanValue());
    if (arg instanceof CompatPolicy p) return resolveCompatOptions(p);
    if (arg instanceof Map<?, ?> m) {
      EnumMap<CompatFixId, Boolean> overrides = new EnumMap<>(CompatFixId.class);
      for (Map.Entry<?, ?> e : m.entrySet()) {
        CompatFixId id = toFixId(e.getKey());
        if (id != null && e.getValue() instanceof Boolean b2) {
          overrides.put(id, b2);
        }
      }
      return resolveCompatOptions(overrides);
    }
    return null;
  }

  private static CompatFixId toFixId(Object key) {
    if (key instanceof CompatFixId f) return f;
    if (key instanceof String s) {
      try {
        return CompatFixId.valueOf(s);
      } catch (IllegalArgumentException e) {
        return null;
      }
    }
    return null;
  }
}
