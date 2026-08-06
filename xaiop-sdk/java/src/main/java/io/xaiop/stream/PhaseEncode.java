package io.xaiop.stream;

import io.xaiop.DotPolicy;
import io.xaiop.Encode;
import io.xaiop.EncodeOptions;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Encode one skeleton/module phase for WebSocket push.
 *
 * <p>Faithful port of the Node.js SDK's {@code phase-encode.js}. Always forces {@link
 * DotPolicy#NONE}. Non-final phases append {@code .\n} after ensuring a trailing newline.
 */
public final class PhaseEncode {
  private PhaseEncode() {}

  /** Options for {@link #encodePhaseJson} / {@link #encodePhaseObject}. */
  public static final class Options {
    private boolean finalPhase;
    private EncodeOptions encodeOptions;

    public static Options defaults() {
      return new Options();
    }

    public static Options builder() {
      return new Options();
    }

    /**
     * When {@code true}, omit the trailing phase {@code .} (document may continue without a close).
     * Default {@code false} (append {@code .\n}).
     */
    public Options finalPhase(boolean value) {
      this.finalPhase = value;
      return this;
    }

    /** Extra {@link Encode} options; {@code dotPolicy} is always forced to {@link DotPolicy#NONE}. */
    public Options encodeOptions(EncodeOptions value) {
      this.encodeOptions = value;
      return this;
    }

    boolean finalPhase() {
      return finalPhase;
    }

    EncodeOptions encodeOptions() {
      return encodeOptions;
    }
  }

  /**
   * Encodes {@code { key: value }} as a single phase.
   *
   * @throws IllegalArgumentException if {@code key} is null or empty
   */
  public static String encodePhaseJson(String key, Object value) {
    return encodePhaseJson(key, value, Options.defaults());
  }

  /**
   * Encodes {@code { key: value }} as a single phase.
   *
   * @throws IllegalArgumentException if {@code key} is null or empty
   */
  public static String encodePhaseJson(String key, Object value, Options options) {
    if (key == null || key.isEmpty()) {
      throw new IllegalArgumentException("phase key must be a non-empty string");
    }
    Options opts = options == null ? Options.defaults() : options;
    LinkedHashMap<String, Object> doc = new LinkedHashMap<>(1);
    doc.put(key, value);
    return finishPhase(Encode.encode(doc, withForcedNone(opts.encodeOptions())), opts.finalPhase());
  }

  /**
   * Encodes a plain object (map) as a single phase.
   *
   * @throws IllegalArgumentException if {@code object} is null, a {@link List}, or not a {@link Map}
   */
  public static String encodePhaseObject(Object object) {
    return encodePhaseObject(object, Options.defaults());
  }

  /**
   * Encodes a plain object (map) as a single phase.
   *
   * @throws IllegalArgumentException if {@code object} is null, a {@link List}, or not a {@link Map}
   */
  public static String encodePhaseObject(Object object, Options options) {
    if (object == null || object instanceof List || !(object instanceof Map<?, ?>)) {
      throw new IllegalArgumentException("phase object must be a plain object");
    }
    Options opts = options == null ? Options.defaults() : options;
    return finishPhase(
        Encode.encode(object, withForcedNone(opts.encodeOptions())), opts.finalPhase());
  }

  private static String finishPhase(String wire, boolean finalPhase) {
    if (finalPhase) {
      return wire;
    }
    return ensureTrailingNewline(wire) + ".\n";
  }

  private static String ensureTrailingNewline(String wire) {
    return wire.endsWith("\n") ? wire : wire + "\n";
  }

  /** Spread caller encode options then force {@link DotPolicy#NONE} (clears path-array form). */
  private static EncodeOptions withForcedNone(EncodeOptions options) {
    if (options == null) {
      return EncodeOptions.singlePhase();
    }
    if (DotPolicy.NONE.equals(options.dotPolicy()) && options.dotPolicyPaths() == null) {
      return options;
    }
    EncodeOptions.Builder b =
        EncodeOptions.builder()
            .root(options.root())
            .style(options.style())
            .dotPolicy(DotPolicy.NONE)
            .finalDot(options.finalDot())
            .keyOrder(options.keyOrder())
            .nullPolicy(options.nullPolicy())
            .undefinedPolicy(options.undefinedPolicy())
            .symbolKeys(options.symbolKeys());
    if (options.phaseEvery() != null) {
      b.phaseEvery(options.phaseEvery());
    }
    if (options.maxPhases() != null) {
      b.maxPhases(options.maxPhases());
    }
    if (options.shouldPhase() != null) {
      b.shouldPhase(options.shouldPhase());
    }
    return b.build();
  }
}
