package io.xaiop;

import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.DotCheckpointEngine;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Port of Node {@code hash.annotation.test.js} — protocol 0.6.0 {@code #} ignore. */
class HashAnnotationTest {

  @Test
  void versions() {
    assertEquals("0.6.0", Xaiop.PROTOCOL_VERSION);
    assertEquals("0.15.1", Xaiop.SDK_VERSION);
  }

  @Test
  void standaloneHashLinesAreIgnoredAnywhere() {
    Object v =
        Parse.parse(
            """
            # meta: run=1
            >
            # before field
            x:1
            # mid
            y:2
            #
            # trailing
            """);
    assertEquals(map("x", 1, "y", 2), v);
  }

  @Test
  void hashDoesNotMoveCursorOrEndBlock() {
    Object v =
        Parse.parse(
            """
            >
            >a
            # still inside a
            b:1
            <
            c:2
            """);
    assertEquals(map("a", map("b", 1), "c", 2), v);
  }

  @Test
  void hashWithArbitraryPayload() {
    Object v =
        Parse.parse(
            """
            >
            #@!$%^&*() <> : = path
            #{"json":true}
            #  spaces and 中文
            k:ok
            """);
    assertEquals(map("k", "ok"), v);
  }

  @Test
  void contentValueMayContainHash() {
    assertEquals(
        map("note", "#not-an-annotation-line"),
        Parse.parse(">\nnote:#not-an-annotation-line\n"));
  }

  @Test
  void fragmentPlusHashLines() {
    Object frag =
        Parse.parse(
            """
            # header
            >meta
            name:demo
            """);
    assertInstanceOf(XaiopFragment.class, frag);
    assertEquals(map("meta", map("name", "demo")), ((XaiopFragment) frag).getEntries());
  }

  @Test
  void phasesWithHashBetweenDots() {
    List<Object> diffs = new ArrayList<>();
    try (DotCheckpointEngine eng =
        DotCheckpointEngine.Options.of(diffs::add).streamProcessing(true).compat(false).build()) {
      eng.push(
          """
          >
          a:1
          #
          .
          # between phases
          >
          b:2
          .
          """);
      eng.finish();
      assertEquals(map("a", 1, "b", 2), eng.snapshot());
      assertTrue(diffs.size() >= 1);
    }
  }

  @Test
  void engineUploadIgnoresHash() {
    XaiopEngine e = new XaiopEngine();
    String id =
        e.uploadSync(
            """
            # ann
            >
            z:9
            """);
    assertEquals(map("z", 9), e.getSync(id));
  }

  @Test
  void leadingWhitespaceBeforeHashIsNotAnnotation() {
    assertThrows(XaiopSyntaxError.class, () -> Parse.parse(">\n #\n"));
  }
}
