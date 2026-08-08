package io.xaiop.stream;

import java.util.List;

/**
 * Package-private line-scan primitives for {@link DotCheckpointEngine} (newline reader + closed
 * phase window records).
 */
final class CheckpointScan {
  private CheckpointScan() {}

  record Line(String text, int end, boolean consumedNewline) {}

  record ClosedPhase(int start, int end, List<String> lines) {}

  static Line readLine(CharSequence text, int from, boolean atEof) {
    int length = text.length();
    if (from >= length) return null;
    for (int i = from; i < length; i++) {
      if (text.charAt(i) == '\n') {
        int end = i;
        if (end > from && text.charAt(end - 1) == '\r') end--;
        return new Line(text.subSequence(from, end).toString(), i + 1, true);
      }
    }
    if (!atEof) return null;
    return new Line(text.subSequence(from, length).toString(), length, false);
  }
}
