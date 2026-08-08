package io.xaiop.stream;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Package-private cover-mode helpers for {@link DotCheckpointEngine} ({@code &} tombstones, wire
 * join).
 */
final class CheckpointCover {
  private CheckpointCover() {}

  static boolean isAmpLine(String line) {
    return line != null && !line.isEmpty() && line.charAt(0) == '&';
  }

  @SuppressWarnings("unchecked")
  static Map<String, Object> buildDeleteTombstone(List<String> amps) {
    Map<String, Object> root = new LinkedHashMap<>();
    for (String line : amps) {
      String path = line.substring(1);
      List<String> segs = new ArrayList<>();
      int start = 0;
      int n = path.length();
      for (int i = 0; i < n; i++) {
        if (path.charAt(i) == '>') {
          if (i > start) segs.add(path.substring(start, i));
          start = i + 1;
        }
      }
      if (start < n) segs.add(path.substring(start));
      if (segs.isEmpty()) continue;
      Map<String, Object> cur = root;
      for (int i = 0; i < segs.size() - 1; i++) {
        String seg = segs.get(i);
        Object existing = cur.get(seg);
        if (!(existing instanceof Map<?, ?>)) {
          Map<String, Object> next = new LinkedHashMap<>();
          cur.put(seg, next);
          cur = next;
        } else {
          cur = (Map<String, Object>) existing;
        }
      }
      cur.put(segs.get(segs.size() - 1), null);
    }
    return root;
  }

  static String linesToWire(List<String> lines) {
    if (lines.isEmpty()) return "";
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < lines.size(); i++) {
      if (i > 0) sb.append('\n');
      sb.append(lines.get(i));
    }
    sb.append('\n');
    return sb.toString();
  }
}
