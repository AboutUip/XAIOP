package io.xaiop;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

/**
 * Immutable options for {@link Encode}. Defaults match the Node.js SDK's {@code encode.js}:
 * {@code root=auto}, {@code style=reset}, {@code dotPolicy=perTopLevelKey}, {@code phaseEvery=1},
 * {@code finalDot=false}, {@code keyOrder=insertion}, {@code nullPolicy=encode},
 * {@code undefinedPolicy=omit}.
 *
 * <p>Java idiom: the string unions of the JS API become enums, except {@code dotPolicy}, which
 * stays a {@link DotPolicy} string because it doubles as a path-array overload.
 *
 * <pre>{@code
 * String wire = Encode.encode(value, EncodeOptions.builder()
 *     .dotPolicy(DotPolicy.PER_N_KEYS)
 *     .phaseEvery(2)
 *     .build());
 * }</pre>
 */
public final class EncodeOptions {
  /** Document root shape. */
  public enum Root {
    AUTO,
    OBJECT,
    ARRAY
  }

  /** Cursor style between top-level phases. */
  public enum Style {
    /** Every phase re-opens the root (`.` resets Cursor). */
    RESET,
    /** Single root open, no phase resets (only valid with {@link DotPolicy#NONE}). */
    RELATIVE
  }

  /** Object key emission order. */
  public enum KeyOrder {
    INSERTION,
    SORTED
  }

  /** How {@code null} object values are treated. Array elements always emit typed null. */
  public enum NullPolicy {
    ENCODE,
    OMIT,
    ERROR
  }

  /**
   * Node parity only: Java maps cannot hold {@code undefined}, so this never triggers.
   * Kept so cross-SDK option tables line up.
   */
  public enum UndefinedPolicy {
    OMIT,
    ERROR
  }

  /** Context handed to {@code shouldPhase} for {@link DotPolicy#CUSTOM}. */
  public record PhaseContext(String key, int index, int total, int keysInPhase, int phaseIndex) {}

  private static final EncodeOptions DEFAULTS = new Builder().build();

  private final Root root;
  private final Style style;
  private final String dotPolicy;
  private final List<String> dotPolicyPaths;
  private final Integer phaseEvery;
  private final Integer maxPhases;
  private final boolean finalDot;
  private final KeyOrder keyOrder;
  private final NullPolicy nullPolicy;
  private final UndefinedPolicy undefinedPolicy;
  private final Predicate<PhaseContext> shouldPhase;
  private final boolean symbolKeys;

  private EncodeOptions(Builder b) {
    this.root = b.root;
    this.style = b.style;
    this.dotPolicy = b.dotPolicy;
    this.dotPolicyPaths = b.dotPolicyPaths == null ? null : List.copyOf(b.dotPolicyPaths);
    this.phaseEvery = b.phaseEvery;
    this.maxPhases = b.maxPhases;
    this.finalDot = b.finalDot;
    this.keyOrder = b.keyOrder;
    this.nullPolicy = b.nullPolicy;
    this.undefinedPolicy = b.undefinedPolicy;
    this.shouldPhase = b.shouldPhase;
    this.symbolKeys = b.symbolKeys;
  }

  /** All-defaults options (shared instance). */
  public static EncodeOptions defaults() {
    return DEFAULTS;
  }

  public static Builder builder() {
    return new Builder();
  }

  /** Shorthand for a single-phase document ({@code dotPolicy: none}). */
  public static EncodeOptions singlePhase() {
    return builder().dotPolicy(DotPolicy.NONE).build();
  }

  public Root root() {
    return root;
  }

  public Style style() {
    return style;
  }

  /** Policy name, or {@code null} when {@link #dotPolicyPaths()} is set. */
  public String dotPolicy() {
    return dotPolicy;
  }

  /** Explicit cut paths (JSON paths like {@code a.b[0]}), or {@code null}. */
  public List<String> dotPolicyPaths() {
    return dotPolicyPaths;
  }

  /** {@code null} when unset (the distinction matters for the path-array mutex). */
  public Integer phaseEvery() {
    return phaseEvery;
  }

  public Integer maxPhases() {
    return maxPhases;
  }

  public boolean finalDot() {
    return finalDot;
  }

  public KeyOrder keyOrder() {
    return keyOrder;
  }

  public NullPolicy nullPolicy() {
    return nullPolicy;
  }

  public UndefinedPolicy undefinedPolicy() {
    return undefinedPolicy;
  }

  public Predicate<PhaseContext> shouldPhase() {
    return shouldPhase;
  }

  /** U+001F label escape dialect for operator-head keys (default {@code false}). */
  public boolean symbolKeys() {
    return symbolKeys;
  }

  /** Mutable builder; unset fields keep the Node defaults. */
  public static final class Builder {
    private Root root = Root.AUTO;
    private Style style = Style.RESET;
    private String dotPolicy = DotPolicy.PER_TOP_LEVEL_KEY;
    private List<String> dotPolicyPaths;
    private Integer phaseEvery;
    private Integer maxPhases;
    private boolean finalDot;
    private KeyOrder keyOrder = KeyOrder.INSERTION;
    private NullPolicy nullPolicy = NullPolicy.ENCODE;
    private UndefinedPolicy undefinedPolicy = UndefinedPolicy.OMIT;
    private Predicate<PhaseContext> shouldPhase;
    private boolean symbolKeys;

    private Builder() {}

    public Builder root(Root value) {
      this.root = require(value, "root");
      return this;
    }

    public Builder style(Style value) {
      this.style = require(value, "style");
      return this;
    }

    /** @param value one of the {@link DotPolicy} constants; clears any path array. */
    public Builder dotPolicy(String value) {
      if (!DotPolicy.isKnown(value)) {
        throw new XaiopEncodeError("unknown dotPolicy: " + value);
      }
      this.dotPolicy = value;
      this.dotPolicyPaths = null;
      return this;
    }

    /**
     * Cut exactly after the listed JSON paths (mutually exclusive with {@code phaseEvery},
     * {@code maxPhases} and {@code shouldPhase}; requires {@link Style#RESET}).
     */
    public Builder dotPolicyPaths(List<String> paths) {
      if (paths == null) {
        throw new XaiopEncodeError("dotPolicy path array must not be null");
      }
      this.dotPolicyPaths = new ArrayList<>(paths);
      this.dotPolicy = null;
      return this;
    }

    public Builder phaseEvery(int value) {
      this.phaseEvery = value;
      return this;
    }

    public Builder maxPhases(int value) {
      this.maxPhases = value;
      return this;
    }

    public Builder finalDot(boolean value) {
      this.finalDot = value;
      return this;
    }

    public Builder keyOrder(KeyOrder value) {
      this.keyOrder = require(value, "keyOrder");
      return this;
    }

    public Builder nullPolicy(NullPolicy value) {
      this.nullPolicy = require(value, "nullPolicy");
      return this;
    }

    public Builder undefinedPolicy(UndefinedPolicy value) {
      this.undefinedPolicy = require(value, "undefinedPolicy");
      return this;
    }

    /** Required by {@link DotPolicy#CUSTOM}; called per top-level key. */
    public Builder shouldPhase(Predicate<PhaseContext> value) {
      this.shouldPhase = value;
      return this;
    }

    /** Escape operator-head keys with U+001F on the wire (default {@code false}). */
    public Builder symbolKeys(boolean value) {
      this.symbolKeys = value;
      return this;
    }

    public EncodeOptions build() {
      return new EncodeOptions(this);
    }

    private static <T> T require(T value, String name) {
      if (value == null) throw new XaiopEncodeError("unknown " + name + ": null");
      return value;
    }
  }
}
