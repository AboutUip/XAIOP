package io.xaiop;

import io.xaiop.internal.Encoder;

import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * JSON &rarr; XAIOP encoder (protocol v0.4.0 wire), faithful port of the Node.js SDK's
 * {@code encode.js}.
 *
 * <p>Accepts the tree shape produced by {@link Parse}: {@link java.util.Map} for objects,
 * {@link List} for arrays, {@link String} / {@link Number} / {@link Boolean} / {@code null}
 * for leaves. Emits strict wire only -- compatibility mode never changes output.
 *
 * <p>{@code .} frequency is controlled by {@link DotPolicy} / {@code phaseEvery} /
 * {@code shouldPhase}, or by an explicit path array, and aligns with
 * {@link io.xaiop.stream.DotCheckpointEngine} phase boundaries.
 */
public final class Encode {
  private Encode() {}

  /** Encodes with the defaults ({@link DotPolicy#PER_TOP_LEVEL_KEY}). */
  public static String encode(Object value) {
    return Encoder.encode(value, EncodeOptions.defaults());
  }

  public static String encode(Object value, EncodeOptions options) {
    return Encoder.encode(value, options);
  }

  /** Async mirror; encoding is CPU-bound/synchronous already. */
  public static CompletableFuture<String> encodeAsync(Object value) {
    return CompletableFuture.completedFuture(encode(value));
  }

  public static CompletableFuture<String> encodeAsync(Object value, EncodeOptions options) {
    return CompletableFuture.completedFuture(encode(value, options));
  }

  /**
   * Parses {@code a.b[0].c} into {@code ["a", "b", 0, "c"]} ({@link String} segments and
   * {@link Integer} indexes).
   */
  public static List<Object> parseJsonPath(String path) {
    return Encoder.parseJsonPath(path);
  }

  /** Inverse of {@link #parseJsonPath(String)}. */
  public static String formatJsonPath(List<Object> segments) {
    return Encoder.formatJsonPath(segments);
  }
}
