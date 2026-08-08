package io.xaiop.stream;

import io.xaiop.Parse;
import io.xaiop.ParseOptions;
import io.xaiop.compat.CompatFixId;

import java.util.List;
import java.util.Map;

/**
 * Package-private Diff construction helpers for {@link DotCheckpointEngine} (leading {@code .},
 * empty-phase normalization, owned phase parse).
 */
final class CheckpointDiffBuild {
  private CheckpointDiffBuild() {}

  record Diff(Object diff, Object committed, boolean fromLive) {}

  static Diff build(
      boolean emitDiff,
      boolean sawDot,
      String raw,
      Parse.LiveXaiopParser live,
      Map<CompatFixId, Boolean> compat,
      boolean symbolKeys) {
    if (!emitDiff) {
      return new Diff(null, null, true);
    }

    // First phase / locate / fallback: Diff is a clone of the live Commit tree.
    if (!sawDot || phaseNeedsPriorTree(raw)) {
      if (isEmptyPhaseWire(raw)) {
        return new Diff(null, null, true);
      }
      return new Diff(Materialize.materializeSnapshot(live.value()), null, true);
    }

    // Later ordinary phase: phase-local Diff with synthetic document root when needed.
    try {
      String text = withLeadingDot(ensureDiffDocumentRoot(raw, liveRootKind(live)));
      Object diff = normalizeEmptyPhase(raw, parseOwned(text, compat, symbolKeys));
      return new Diff(diff, null, true);
    } catch (RuntimeException e) {
      // Commit already applied; never abort the stream solely because Diff isolation failed.
      if (isEmptyPhaseWire(raw)) {
        return new Diff(null, null, true);
      }
      return new Diff(Materialize.materializeSnapshot(live.value()), null, true);
    }
  }

  /** Fresh parse; ownership transferred (plain roots are not cloned again). */
  static Object parseOwned(String text, Map<CompatFixId, Boolean> compat, boolean symbolKeys) {
    if (text == null || text.isEmpty()) return null;
    return Materialize.materializeOwned(
        Parse.parse(text, ParseOptions.of(compat, symbolKeys)));
  }

  static String liveRootKind(Parse.LiveXaiopParser live) {
    if (live == null) return null;
    String kind = live.docKind();
    if ("array".equals(kind) || "fragment".equals(kind) || "object".equals(kind)) {
      return kind;
    }
    try {
      Object v = live.value();
      if (v instanceof List) return "array";
    } catch (RuntimeException ignored) {
      /* ignore */
    }
    return "object";
  }

  static String withLeadingDot(String raw) {
    if (raw.equals(".") || raw.startsWith(".\n") || raw.startsWith(".\r\n")) {
      return raw;
    }
    return raw.startsWith("\n") ? "." + raw : ".\n" + raw;
  }

  static String firstPhaseLine(String raw) {
    int i = 0;
    int n = raw.length();
    while (i < n) {
      char c = raw.charAt(i);
      if (c == '\r' || c == '\n') {
        i++;
        continue;
      }
      int j = i;
      while (j < n) {
        char ch = raw.charAt(j);
        if (ch == '\n' || ch == '\r') break;
        j++;
      }
      String line = raw.substring(i, j);
      if (line.endsWith("\r")) line = line.substring(0, line.length() - 1);
      if (line.equals(".") || line.isEmpty()) {
        i = j + 1;
        continue;
      }
      return line;
    }
    return null;
  }

  static boolean phaseHasBareDocumentRoot(String raw) {
    String line = firstPhaseLine(raw);
    return ">".equals(line) || "-".equals(line);
  }

  static String ensureDiffDocumentRoot(String raw, String rootKind) {
    if (phaseHasBareDocumentRoot(raw)) return raw;
    if ("array".equals(rootKind)) return raw;
    return ">\n" + raw;
  }

  /** Whether the phase contains {@code =}/{@code !}/{@code &}/{@code @} (needs the prior tree). */
  static boolean phaseNeedsPriorTree(String raw) {
    int i = 0;
    int n = raw.length();
    while (i < n) {
      char c = raw.charAt(i);
      if (c == '\r' || c == '\n') {
        i++;
        continue;
      }
      if (c == '=' || c == '!' || c == '&' || c == '@') return true;
      while (i < n) {
        char ch = raw.charAt(i);
        if (ch == '\n') {
          i++;
          break;
        }
        if (ch == '\r') {
          i++;
          if (i < n && raw.charAt(i) == '\n') i++;
          break;
        }
        i++;
      }
    }
    return false;
  }

  static boolean isEmptyPhaseWire(String raw) {
    int start = 0;
    int end = raw.length();
    if (start < end && raw.charAt(start) == '.') {
      start++;
      if (start < end && raw.charAt(start) == '\r') start++;
      if (start < end && raw.charAt(start) == '\n') start++;
    }
    if (end > start) {
      int e = end;
      if (e > start && raw.charAt(e - 1) == '\n') e--;
      if (e > start && raw.charAt(e - 1) == '\r') e--;
      if (e > start && raw.charAt(e - 1) == '.') {
        e--;
        if (e > start && raw.charAt(e - 1) == '\n') e--;
        if (e > start && raw.charAt(e - 1) == '\r') e--;
        end = e;
      }
    }
    while (start < end) {
      char c = raw.charAt(start);
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
        start++;
        continue;
      }
      break;
    }
    while (end > start) {
      char c = raw.charAt(end - 1);
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
        end--;
        continue;
      }
      break;
    }
    return start >= end;
  }

  static Object normalizeEmptyPhase(String raw, Object value) {
    return isEmptyPhaseWire(raw) ? null : value;
  }
}
