package io.xaiop;

import io.xaiop.compat.CompatFixId;
import io.xaiop.compat.CompatPolicy;
import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.XaiopStream;
import io.xaiop.ws.XaiopWs;
import io.xaiop.ws.XaiopWsConnection;
import io.xaiop.ws.XaiopWsHub;

import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

/**
 * XAIOP Java SDK entry (artifact 0.16.0 · protocol wire 0.7.0 Draft).
 *
 * <p>Convenience facade over {@link Parse}, {@link Encode}, {@link Merge},
 * {@link DotCheckpointEngine}, and {@link XaiopStream}. Every method here is a thin delegate —
 * use the underlying classes directly when you need their full option surface.
 */
public final class Xaiop {
  /** Wire protocol package implemented by this artifact. */
  public static final String PROTOCOL_VERSION = "0.7.0";
  /** Maven / JAR artifact version. */
  public static final String SDK_VERSION = "0.16.0";

  private Xaiop() {}

  /**
   * Parses XAIOP source text into a tree of {@link java.util.LinkedHashMap},
   * {@link java.util.ArrayList}, {@link String}, {@link Integer}/{@link Long}/{@link Double},
   * {@link Boolean}, {@code null}, or an {@link XaiopFragment} for Root fragment bindings.
   *
   * @param source XAIOP text
   * @return parsed value (object / array / scalar tree), or an {@link XaiopFragment}
   */
  public static Object parse(String source) {
    return Parse.parse(source);
  }

  /** @param compat {@code false} = strict; {@code true} = all compatibility fixes on */
  public static Object parse(String source, boolean compat) {
    return Parse.parse(source, compat);
  }

  /** @param policy fine-grained compatibility policy */
  public static Object parse(String source, CompatPolicy policy) {
    return Parse.parse(source, policy);
  }

  /** @param overrides per-fix overrides on top of the compatibility defaults */
  public static Object parse(String source, Map<CompatFixId, Boolean> overrides) {
    return Parse.parse(source, overrides);
  }

  /**
   * Encodes a JSON-compatible tree ({@link Map} / {@link java.util.List} / scalars) as strict
   * XAIOP wire text, one {@code .} phase per top-level key.
   */
  public static String encode(Object value) {
    return Encode.encode(value);
  }

  public static String encode(Object value, EncodeOptions options) {
    return Encode.encode(value, options);
  }

  /** Deep-merges {@code overlay} into a clone of {@code base} (overlay wins on conflicts). */
  public static Object mergeJson(Object base, Object overlay) {
    return Merge.mergeJson(base, overlay);
  }

  public static Object mergeJson(Object base, Object overlay, MergeConflict conflict) {
    return Merge.mergeJson(base, overlay, conflict);
  }

  /** Merges base JSON with an XAIOP document &rarr; JSON. */
  public static Object mergeToJson(Object baseJson, String xaiopSource) {
    return Merge.mergeToJson(baseJson, xaiopSource);
  }

  public static Object mergeToJson(Object baseJson, String xaiopSource, MergeOptions options) {
    return Merge.mergeToJson(baseJson, xaiopSource, options);
  }

  /** Merges base JSON with an XAIOP document &rarr; XAIOP wire (single phase by default). */
  public static String mergeToXaiop(Object baseJson, String xaiopSource) {
    return Merge.mergeToXaiop(baseJson, xaiopSource);
  }

  public static String mergeToXaiop(Object baseJson, String xaiopSource, MergeOptions options) {
    return Merge.mergeToXaiop(baseJson, xaiopSource, options);
  }

  /**
   * Opens a dot-checkpoint stream parser with default hooks; {@code onChunk} receives one Diff
   * per {@code .} phase (batched per buffer window).
   */
  public static DotCheckpointEngine checkpoint(Consumer<Object> onChunk) {
    return DotCheckpointEngine.Options.of(onChunk).build();
  }

  /** Fully configured variant -- see {@link DotCheckpointEngine.Options}. */
  public static DotCheckpointEngine checkpoint(DotCheckpointEngine.Options options) {
    return options.build();
  }

  /** Opens a streaming consumer (HTTP / SSE / RAW). See {@link XaiopStream}. */
  public static XaiopStream stream(String url) {
    return new XaiopStream(url);
  }

  public static XaiopStream stream(String url, XaiopStream.Options options) {
    return new XaiopStream(url, options);
  }

  /** WebSocket session entry — see {@link XaiopWs}. */
  public static CompletableFuture<XaiopWsHub> wsListen(XaiopWsHub.ListenOptions options) {
    return XaiopWs.listen(options);
  }

  public static CompletableFuture<XaiopWsHub> wsListen() {
    return XaiopWs.listen();
  }

  public static CompletableFuture<XaiopWsConnection> wsConnect(String url) {
    return XaiopWs.connect(url);
  }

  public static CompletableFuture<XaiopWsConnection> wsConnect(
      String url, XaiopWs.ConnectOptions options) {
    return XaiopWs.connect(url, options);
  }
}
