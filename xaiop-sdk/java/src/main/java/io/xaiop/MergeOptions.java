package io.xaiop;

import io.xaiop.compat.CompatFixId;
import io.xaiop.compat.CompatPolicy;

import java.util.Map;

/**
 * Options for {@link Merge} (and the {@code inject*} engine methods).
 *
 * <p>Java folds the JS {@code MergeOptions} / {@code MergeToXaiopOptions} / {@code InjectOptions}
 * into one immutable type; {@link #as()} is only consulted by the inject entry points.
 */
public final class MergeOptions {
  /** Return shape of {@code inject*} / {@link Merge#formatInjectResult}. */
  public enum As {
    /** Deep-cloned JSON tree (default). */
    JSON,
    /** Encoded XAIOP wire text. */
    XAIOP
  }

  private static final MergeOptions DEFAULTS = new Builder().build();

  private final MergeConflict conflict;
  private final Object compat;
  private final boolean compatSet;
  private final EncodeOptions encodeOptions;
  private final As as;

  private MergeOptions(Builder b) {
    this.conflict = b.conflict;
    this.compat = b.compat;
    this.compatSet = b.compatSet;
    this.encodeOptions = b.encodeOptions;
    this.as = b.as;
  }

  public static MergeOptions defaults() {
    return DEFAULTS;
  }

  public static Builder builder() {
    return new Builder();
  }

  /** Shorthand for {@code builder().conflict(c).build()}. */
  public static MergeOptions of(MergeConflict conflict) {
    return builder().conflict(conflict).build();
  }

  public MergeConflict conflict() {
    return conflict;
  }

  /** Whether the caller pinned a compatibility setting (engines fall back to their own). */
  public boolean hasCompat() {
    return compatSet;
  }

  /** {@code null}, {@link Boolean}, {@link CompatPolicy} or a fix-override map. */
  public Object compat() {
    return compat;
  }

  /** Encode options for {@code as = XAIOP}; {@code null} means single-phase (no {@code .}). */
  public EncodeOptions encodeOptions() {
    return encodeOptions;
  }

  public As as() {
    return as;
  }

  /** Copy with the compatibility setting replaced (used by {@link XaiopEngine}). */
  MergeOptions withCompat(Object value) {
    Builder b = new Builder();
    b.conflict = conflict;
    b.compat = value;
    b.compatSet = true;
    b.encodeOptions = encodeOptions;
    b.as = as;
    return new MergeOptions(b);
  }

  public static final class Builder {
    private MergeConflict conflict = MergeConflict.OVERWRITE;
    private Object compat;
    private boolean compatSet;
    private EncodeOptions encodeOptions;
    private As as = As.JSON;

    private Builder() {}

    public Builder conflict(MergeConflict value) {
      if (value == null) {
        throw new IllegalArgumentException("merge conflict must be \"overwrite\" or \"keep\"");
      }
      this.conflict = value;
      return this;
    }

    /** @param enabled {@code false} = strict parse; {@code true} = all compatibility fixes. */
    public Builder compat(boolean enabled) {
      this.compat = enabled;
      this.compatSet = true;
      return this;
    }

    public Builder compat(CompatPolicy policy) {
      this.compat = policy;
      this.compatSet = true;
      return this;
    }

    public Builder compat(Map<CompatFixId, Boolean> overrides) {
      this.compat = overrides;
      this.compatSet = true;
      return this;
    }

    public Builder encodeOptions(EncodeOptions value) {
      this.encodeOptions = value;
      return this;
    }

    public Builder as(As value) {
      if (value == null) {
        throw new IllegalArgumentException("inject as must be \"json\" or \"xaiop\"");
      }
      this.as = value;
      return this;
    }

    public MergeOptions build() {
      return new MergeOptions(this);
    }
  }
}
