package io.xaiop;

import io.xaiop.compat.Compat;
import io.xaiop.compat.CompatFixId;
import io.xaiop.compat.CompatPolicy;
import io.xaiop.internal.Parser;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Public parse entry points, faithful port of the Node.js SDK's {@code parse.js}
 * ({@code parseSync} / {@code parseAsync} / {@code LiveXaiopParser}).
 *
 * <p>{@code compat}: omitted / {@code false} = strict; {@code true} = all fixes on;
 * a {@link CompatPolicy} or a {@code Map<CompatFixId,Boolean>} override map = fine-grained
 * policy.
 */
public final class Parse {
  private Parse() {}

  /** Strict parse (no compatibility fixes). @return parsed tree, or an {@link XaiopFragment}. */
  public static Object parse(String source) {
    return parseWith(source, (Object) null);
  }

  public static Object parse(String source, boolean compat) {
    return parseWith(source, (Object) compat);
  }

  public static Object parse(String source, CompatPolicy policy) {
    return parseWith(source, (Object) policy);
  }

  public static Object parse(String source, Map<CompatFixId, Boolean> overrides) {
    return parseWith(source, (Object) overrides);
  }

  private static Object parseWith(String source, Object compatArg) {
    if (source == null) {
      throw new NullPointerException("XAIOP source must be a string");
    }
    return new Parser(source, Compat.resolveCompatOptions(compatArg)).parse();
  }

  /** Async mirror of {@link #parse(String)}; XAIOP parsing is CPU-bound/synchronous already. */
  public static CompletableFuture<Object> parseAsync(String source) {
    return CompletableFuture.completedFuture(parse(source));
  }

  public static CompletableFuture<Object> parseAsync(String source, boolean compat) {
    return CompletableFuture.completedFuture(parse(source, compat));
  }

  public static CompletableFuture<Object> parseAsync(String source, CompatPolicy policy) {
    return CompletableFuture.completedFuture(parse(source, policy));
  }

  public static CompletableFuture<Object> parseAsync(
      String source, Map<CompatFixId, Boolean> overrides) {
    return CompletableFuture.completedFuture(parse(source, overrides));
  }

  /**
   * Incremental parser: feed complete lines (or phase text) while keeping one live tree.
   * Semantically equivalent to {@link #parse(String)} over the concatenation of fed text.
   * Used by stream checkpoint to avoid re-parsing the growing prefix on every {@code .}.
   */
  public static final class LiveXaiopParser {
    private final Parser p;

    public LiveXaiopParser() {
      this(false);
    }

    public LiveXaiopParser(boolean compat) {
      this.p = Parser.createLive(Compat.resolveCompatOptions((Object) compat));
    }

    public LiveXaiopParser(CompatPolicy policy) {
      this.p = Parser.createLive(Compat.resolveCompatOptions((Object) policy));
    }

    public LiveXaiopParser(Map<CompatFixId, Boolean> overrides) {
      this.p = Parser.createLive(Compat.resolveCompatOptions((Object) overrides));
    }

    /**
     * @param line complete logical line (no trailing LF/CRLF)
     * @return this
     */
    public LiveXaiopParser feedLine(String line) {
      p.feedLine(line);
      return this;
    }

    /** Feed every logical line in {@code text} (same splitting as {@link #parse(String)}). */
    public LiveXaiopParser feedText(String text) {
      if (text == null) {
        throw new NullPointerException("XAIOP live feedText requires a string");
      }
      if (text.isEmpty()) return this;
      for (String line : Parser.publicSplitLines(text)) {
        p.feedLine(line);
      }
      return this;
    }

    /**
     * Current document value (live reference -- further feeds mutate it).
     * Callers that expose snapshots must clone (e.g. {@link Json#deepClone(Object)}).
     */
    public Object value() {
      return p.result();
    }
  }
}
