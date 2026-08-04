package io.xaiop;

import io.xaiop.compat.Compat;
import io.xaiop.compat.CompatFixId;
import io.xaiop.compat.CompatPolicy;

import java.util.Map;

/**
 * Options for {@link Parse}. Defaults match the Node.js SDK: strict compat, {@code symbolKeys}
 * off.
 */
public final class ParseOptions {
  private static final ParseOptions DEFAULTS = new ParseOptions(null, false);

  private final Map<CompatFixId, Boolean> compat;
  private final boolean symbolKeys;

  private ParseOptions(Map<CompatFixId, Boolean> compat, boolean symbolKeys) {
    this.compat = compat;
    this.symbolKeys = symbolKeys;
  }

  public static ParseOptions defaults() {
    return DEFAULTS;
  }

  public static ParseOptions of(Object compatArg) {
    return new ParseOptions(Compat.resolveCompatOptions(compatArg), false);
  }

  public static ParseOptions of(Object compatArg, boolean symbolKeys) {
    return new ParseOptions(Compat.resolveCompatOptions(compatArg), symbolKeys);
  }

  public static Builder builder() {
    return new Builder();
  }

  public Map<CompatFixId, Boolean> compat() {
    return compat;
  }

  public boolean symbolKeys() {
    return symbolKeys;
  }

  public static final class Builder {
    private Object compatArg;
    private boolean symbolKeys;

    public Builder compat(boolean enabled) {
      this.compatArg = enabled;
      return this;
    }

    public Builder compat(CompatPolicy policy) {
      this.compatArg = policy;
      return this;
    }

    public Builder compat(Map<CompatFixId, Boolean> overrides) {
      this.compatArg = overrides;
      return this;
    }

    public Builder symbolKeys(boolean enabled) {
      this.symbolKeys = enabled;
      return this;
    }

    public ParseOptions build() {
      return new ParseOptions(Compat.resolveCompatOptions(compatArg), symbolKeys);
    }
  }
}
