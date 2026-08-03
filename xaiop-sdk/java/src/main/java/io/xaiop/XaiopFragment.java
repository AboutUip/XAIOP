package io.xaiop;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Root fragment: named bindings at Root <b>without</b> an entered anonymous outer object.
 * Semantic notation is {@code "a":{}} (not a standalone JSON document {@code {"a":{}}}).
 *
 * <p>Faithful port of {@code XaiopFragment} from the Node.js SDK's {@code parse.js}.
 */
public final class XaiopFragment {
  private final Map<String, Object> entries;

  public XaiopFragment(Map<String, Object> entries) {
    this.entries = new LinkedHashMap<>(entries);
  }

  public boolean isFragment() {
    return true;
  }

  /** @return the fragment's top-level bindings (insertion-ordered, live copy taken at construction). */
  public Map<String, Object> getEntries() {
    return entries;
  }

  /** @return e.g. {@code "a":{}} or {@code "a":{},"b":1} */
  public String notation() {
    StringBuilder sb = new StringBuilder();
    boolean first = true;
    for (Map.Entry<String, Object> e : entries.entrySet()) {
      if (!first) sb.append(',');
      first = false;
      sb.append(Json.stringify(e.getKey())).append(':').append(Json.stringify(e.getValue()));
    }
    return sb.toString();
  }

  @Override
  public String toString() {
    return notation();
  }
}
