package io.xaiop.stream;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * Multi-select consumption modes (Node {@code STREAM_MODES}). Floor is always {@link #CALLBACK}
 * when the set would otherwise be empty.
 */
public enum StreamMode {
  CALLBACK("callback"),
  PROMISE("promise"),
  EVENTS("events"),
  ASYNC_ITERATOR("asyncIterator");

  private final String wire;

  StreamMode(String wire) {
    this.wire = wire;
  }

  public String wire() {
    return wire;
  }

  public static Set<StreamMode> normalize(Iterable<StreamMode> modes) {
    EnumSet<StreamMode> set = EnumSet.noneOf(StreamMode.class);
    if (modes != null) {
      for (StreamMode m : modes) {
        if (m != null) set.add(m);
      }
    }
    if (set.isEmpty()) set.add(CALLBACK);
    return Collections.unmodifiableSet(set);
  }

  public static Set<StreamMode> callbackOnly() {
    return normalize(EnumSet.of(CALLBACK));
  }
}
