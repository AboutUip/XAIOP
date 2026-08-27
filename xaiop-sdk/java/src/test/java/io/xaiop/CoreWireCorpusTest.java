package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import io.xaiop.stream.Materialize;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Shared STRICT corpus {@code xaiop-sdk/conformance/core-wire/cases.json} — same cases as Node /
 * Python / Go. Encode {@code root: fragment} is skipped (Java has no fragment encode root).
 */
class CoreWireCorpusTest {

  @Test
  @SuppressWarnings("unchecked")
  void coreWireCorpus() throws Exception {
    Path dir = coreWireDir();
    Map<String, Object> doc =
        (Map<String, Object>)
            Json.parse(Files.readString(dir.resolve("cases.json"), StandardCharsets.UTF_8));
    List<Map<String, Object>> cases = (List<Map<String, Object>>) doc.get("cases");
    for (Map<String, Object> c : cases) {
      String id = String.valueOf(c.get("id"));
      if ("encode".equals(c.get("kind")) && "fragment".equals(c.get("root"))) {
        continue;
      }
      try {
        runCase(dir, c);
      } catch (AssertionError | RuntimeException e) {
        fail(id + ": " + e.getMessage(), e);
      }
    }
  }

  @SuppressWarnings("unchecked")
  private static void runCase(Path dir, Map<String, Object> c) throws Exception {
    String kind = String.valueOf(c.get("kind"));
    switch (kind) {
      case "parse" -> {
        Object parsed = Parse.parse(str(c, "wire"));
        boolean wantFrag = Boolean.TRUE.equals(c.get("fragment"));
        assertTrue((parsed instanceof XaiopFragment) == wantFrag, "fragment flag");
        Fixtures.assertTree(c.get("expect"), Materialize.materializeSnapshot(parsed), str(c, "id"));
      }
      case "parse_file" -> {
        String wire = Files.readString(dir.resolve(str(c, "file")), StandardCharsets.UTF_8);
        Object expect =
            Json.parse(Files.readString(dir.resolve(str(c, "expect_file")), StandardCharsets.UTF_8));
        Fixtures.assertTree(
            expect, Materialize.materializeSnapshot(Parse.parse(wire)), str(c, "id"));
      }
      case "parse_error" -> assertThrows(XaiopSyntaxError.class, () -> Parse.parse(str(c, "wire")));
      case "live" -> {
        Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
        for (Object chunk : (List<?>) c.get("chunks")) {
          live.feedText(String.valueOf(chunk));
        }
        Fixtures.assertTree(
            c.get("expect"), Materialize.materializeSnapshot(live.value()), str(c, "id"));
      }
      case "encode" -> {
        String wire = Encode.encode(c.get("value"), encodeOpts(c));
        if (!wire.equals(str(c, "expect_wire"))) {
          fail(
              "wire mismatch\ngot "
                  + Json.stringify(wire)
                  + "\nwant "
                  + Json.stringify(str(c, "expect_wire")));
        }
      }
      case "encode_error" ->
          assertThrows(XaiopEncodeError.class, () -> Encode.encode(c.get("value"), encodeOpts(c)));
      case "roundtrip" -> {
        String wire = Encode.encode(c.get("value"), encodeOpts(c));
        Fixtures.assertTree(
            c.get("value"), Materialize.materializeSnapshot(Parse.parse(wire)), str(c, "id"));
      }
      default -> fail("unknown kind " + kind);
    }
  }

  private static EncodeOptions encodeOpts(Map<String, Object> c) {
    EncodeOptions.Builder b =
        EncodeOptions.builder().dotPolicy(DotPolicy.NONE).style(EncodeOptions.Style.RELATIVE);
    String keyOrder = str(c, "key_order");
    if ("sorted".equals(keyOrder) || keyOrder.isEmpty()) {
      b.keyOrder(EncodeOptions.KeyOrder.SORTED);
    }
    String root = str(c, "root");
    if ("object".equals(root)) b.root(EncodeOptions.Root.OBJECT);
    else if ("array".equals(root)) b.root(EncodeOptions.Root.ARRAY);
    return b.build();
  }

  private static String str(Map<String, Object> c, String key) {
    Object v = c.get(key);
    return v == null ? "" : String.valueOf(v);
  }

  private static Path coreWireDir() {
    Path dir = Paths.get("").toAbsolutePath();
    for (Path p = dir; p != null; p = p.getParent()) {
      Path a = p.resolve("conformance").resolve("core-wire");
      Path b = p.resolve("xaiop-sdk").resolve("conformance").resolve("core-wire");
      if (Files.isRegularFile(a.resolve("cases.json"))) return a;
      if (Files.isRegularFile(b.resolve("cases.json"))) return b;
    }
    throw new IllegalStateException("conformance/core-wire/cases.json not found above " + dir);
  }
}
