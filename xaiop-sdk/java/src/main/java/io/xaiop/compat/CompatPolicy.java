package io.xaiop.compat;

import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;

/**
 * Mutable per-engine (or per-parse) compatibility fix flags.
 * Constructing with no overrides yields every fix enabled.
 *
 * <p>Faithful port of {@code CompatPolicy} from the Node.js SDK's {@code compat.js}.
 */
public final class CompatPolicy {
  /** All fixes enabled (mirrors {@code COMPAT_FIX_DEFAULTS}). */
  public static final Map<CompatFixId, Boolean> DEFAULTS;

  static {
    EnumMap<CompatFixId, Boolean> d = new EnumMap<>(CompatFixId.class);
    for (CompatFixId id : CompatFixId.values()) {
      d.put(id, Boolean.TRUE);
    }
    DEFAULTS = Collections.unmodifiableMap(d);
  }

  private final EnumMap<CompatFixId, Boolean> flags = new EnumMap<>(CompatFixId.class);

  public CompatPolicy() {
    this(null);
  }

  /** @param overrides per-fix overrides; unspecified fixes default to enabled. */
  public CompatPolicy(Map<CompatFixId, Boolean> overrides) {
    for (CompatFixId id : CompatFixId.values()) {
      Boolean v = overrides != null ? overrides.get(id) : null;
      flags.put(id, v != null ? v : DEFAULTS.get(id));
    }
  }

  /** Reset every fix to the default (all enabled). */
  public CompatPolicy resetToDefaults() {
    for (CompatFixId id : CompatFixId.values()) {
      flags.put(id, DEFAULTS.get(id));
    }
    return this;
  }

  /** @return an immutable snapshot for the parser. */
  public Map<CompatFixId, Boolean> snapshot() {
    return Collections.unmodifiableMap(new EnumMap<>(flags));
  }

  /**
   * @param id fix to change
   * @param enabled new state
   * @return whether the assignment was applied
   */
  public boolean set(CompatFixId id, boolean enabled) {
    if (id == null) return false;
    flags.put(id, enabled);
    return true;
  }

  public boolean get(CompatFixId id) {
    Boolean v = flags.get(id);
    return v != null && v;
  }
}
