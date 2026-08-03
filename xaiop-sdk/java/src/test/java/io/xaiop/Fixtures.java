package io.xaiop;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Shared builders and the repo-level {@code docs/examples/complex.*} fixture. */
final class Fixtures {
  private Fixtures() {}

  /** Insertion-ordered map from alternating key/value arguments. */
  static Map<String, Object> map(Object... keyValues) {
    LinkedHashMap<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) {
      m.put((String) keyValues[i], keyValues[i + 1]);
    }
    return m;
  }

  /** Mutable list allowing {@code null} elements (unlike {@code List.of}). */
  static List<Object> list(Object... values) {
    return new ArrayList<>(Arrays.asList(values));
  }

  /** The {@code docs/examples/complex.xaiop} wire text. */
  static String complexWire() {
    try {
      return Files.readString(examples().resolve("complex.xaiop"), StandardCharsets.UTF_8);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /**
   * The tree {@code docs/examples/complex.expected.json} describes, spelled out in Java so the
   * suite needs no JSON parser. {@code parse(complexWire())} is asserted against it.
   */
  static Map<String, Object> complexJson() {
    return map(
        "meta",
        map(
            "name", "XAIOP-Complex-Fixture",
            "version", 1,
            "enabled", true,
            "count", "2",
            "author", map("name", "xuan", "role", "maintainer")),
        "application",
        map(
            "config",
            map(
                "host", "localhost",
                "port", 8080,
                "debug", false,
                "flags", list("alpha", "beta")),
            "users",
            list(
                map("id", 1, "name", "alice", "active", true, "score", "10"),
                map("id", 2, "name", "bob", "tags", list("dev", "ops"))),
            "payload",
            map(
                "items",
                list(
                    map("title", "first", "nested", true),
                    map("title", "second", "count", 3),
                    "plain",
                    map("a", "solo"),
                    list("x", "y"))),
            "note",
            map("text", "end")));
  }

  /**
   * Structural equality that treats numeric leaves by value, so a wire round-trip narrowing
   * {@code 3.0} to {@code Integer 3} still matches (JavaScript has a single number type).
   */
  static boolean deepEquals(Object a, Object b) {
    if (a instanceof Number x && b instanceof Number y) {
      return x.doubleValue() == y.doubleValue();
    }
    if (a instanceof Map<?, ?> x && b instanceof Map<?, ?> y) {
      if (x.size() != y.size()) return false;
      for (Map.Entry<?, ?> e : x.entrySet()) {
        if (!y.containsKey(e.getKey())) return false;
        if (!deepEquals(e.getValue(), y.get(e.getKey()))) return false;
      }
      return true;
    }
    if (a instanceof List<?> x && b instanceof List<?> y) {
      if (x.size() != y.size()) return false;
      for (int i = 0; i < x.size(); i++) {
        if (!deepEquals(x.get(i), y.get(i))) return false;
      }
      return true;
    }
    return a == null ? b == null : a.equals(b);
  }

  /** {@link #deepEquals} as an assertion with a JSON rendering of both trees on failure. */
  static void assertTree(Object expected, Object actual, String message) {
    if (!deepEquals(expected, actual)) {
      throw new AssertionError(
          message + "\nexpected: " + Json.stringify(expected) + "\nactual:   " + Json.stringify(actual));
    }
  }

  /** Walks up from the working directory to the repo root holding {@code docs/examples}. */
  private static Path examples() {
    Path dir = Paths.get("").toAbsolutePath();
    for (Path p = dir; p != null; p = p.getParent()) {
      Path candidate = p.resolve("docs").resolve("examples");
      if (Files.isDirectory(candidate)) return candidate;
    }
    throw new IllegalStateException("docs/examples not found above " + dir);
  }
}
