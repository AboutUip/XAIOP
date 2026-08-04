package io.xaiop;

import static io.xaiop.Fixtures.list;
import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.internal.LabelEscape;
import io.xaiop.stream.DotCheckpointEngine;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Expanded U+001F symbol-key label-escape coverage (parity with Node). */
class SymbolKeysTest {

  private static final String ESC = LabelEscape.INTRODUCER;
  private static final EncodeOptions ENC =
      EncodeOptions.builder().dotPolicy(DotPolicy.NONE).symbolKeys(true).build();
  private static final ParseOptions PARSE = ParseOptions.builder().symbolKeys(true).build();

  private static Object roundTrip(Object value) {
    return Parse.parse(Encode.encode(value, ENC), PARSE);
  }

  private static Object roundTrip(Object value, EncodeOptions enc) {
    return Parse.parse(Encode.encode(value, enc), PARSE);
  }

  @Test
  void helpersKeyNeedsAndWireLabels() {
    assertTrue(LabelEscape.keyNeedsSymbolEscape("#k"));
    assertTrue(LabelEscape.keyNeedsSymbolEscape("@k"));
    assertTrue(LabelEscape.keyNeedsSymbolEscape(">t"));
    assertTrue(LabelEscape.keyNeedsSymbolEscape(ESC + "x"));
    assertFalse(LabelEscape.keyNeedsSymbolEscape(".k"));
    assertFalse(LabelEscape.keyNeedsSymbolEscape("a#b"));
    assertFalse(LabelEscape.keyNeedsSymbolEscape("normal"));

    assertEquals("#k", LabelEscape.encodeWireLabel("#k", false));
    assertEquals(ESC + "#k", LabelEscape.encodeWireLabel("#k", true));
    assertEquals(ESC + ESC + "h", LabelEscape.encodeWireLabel(ESC + "h", true));
    assertEquals("#k", LabelEscape.decodeWireLabel(ESC + "#k", true));
    assertEquals(ESC + "#k", LabelEscape.decodeWireLabel(ESC + "#k", false));
  }

  @Test
  void defaultEncodeRejectsAllOperatorHeads() {
    for (String key : List.of("#k", "@k", ">test", "<x", "=y", "!z", "&a", ESC + "h")) {
      XaiopEncodeError err =
          assertThrows(
              XaiopEncodeError.class,
              () -> Encode.encode(map(key, 1), EncodeOptions.singlePhase()),
              key);
      assertTrue(err.getMessage().contains("symbolKeys"), key);
      assertTrue(err.getMessage().contains("U+001F"), key);
    }
  }

  @Test
  void eachOperatorHeadRoundtripsAlone() {
    assertEquals(map("#k", 1), roundTrip(map("#k", 1)));
    assertEquals(map("@m", 2), roundTrip(map("@m", 2)));
    assertEquals(map(">test", "test"), roundTrip(map(">test", "test")));
    assertEquals(map("<pop", true), roundTrip(map("<pop", true)));
    assertEquals(map("=eq", null), roundTrip(map("=eq", null)));
    assertEquals(map("!bang", 0), roundTrip(map("!bang", 0)));
    assertEquals(map("&amp", "x"), roundTrip(map("&amp", "x")));
    assertEquals(map(ESC + "hello", 3), roundTrip(map(ESC + "hello", 3)));
  }

  @Test
  void wireNeverEmitsBareHashContentLine() {
    String wire = Encode.encode(map("#k", 1, "a", 2), ENC);
    for (String line : wire.split("\n", -1)) {
      if (line.isEmpty()) continue;
      assertFalse(line.startsWith("#"), "bare #: " + line);
    }
    assertTrue(wire.contains(ESC + "#k:1"));
    assertEquals(map("#k", 1, "a", 2), Parse.parse(wire, PARSE));
  }

  @Test
  void nestedNamedEnterWithSymbolKeys() {
    Map<String, Object> value = map("#root", map("@child", map("x", 1), "ok", 2));
    String wire = Encode.encode(value, ENC);
    assertTrue(wire.contains(">" + ESC + "#root"));
    assertEquals(value, roundTrip(value));
  }

  @Test
  void arrayOfObjectsWithSymbolKeys() {
    Map<String, Object> value =
        map("items", list(map("#id", 1), map("@id", 2), map(">id", 3)));
    assertEquals(value, roundTrip(value));
  }

  @Test
  void namedArrayWithSymbolKey() {
    Map<String, Object> value = map("#tags", list("a", "b"));
    String wire = Encode.encode(value, ENC);
    assertTrue(wire.contains(">" + ESC + "#tags-"));
    assertEquals(value, roundTrip(value));
  }

  @Test
  void perTopLevelKeyPhasesRoundtrip() {
    Map<String, Object> value = map("#a", 1, "@b", 2, "c", 3);
    EncodeOptions phased = EncodeOptions.builder().symbolKeys(true).build();
    assertEquals(value, roundTrip(value, phased));
  }

  @Test
  void bodyStillRejectsCursorCharsWithSymbolKeys() {
    assertThrows(XaiopEncodeError.class, () -> Encode.encode(map("a>b", 1), ENC));
    assertThrows(XaiopEncodeError.class, () -> Encode.encode(map("#a>b", 1), ENC));
    assertThrows(XaiopEncodeError.class, () -> Encode.encode(map("@a&b", 1), ENC));
  }

  @Test
  void encodeOnParseOffKeepsIntroducer() {
    String wire = Encode.encode(map("#k", 1), ENC);
    assertEquals(map(ESC + "#k", 1), Parse.parse(wire));
  }

  @Test
  void midKeyHashAndDotKeyWithoutSymbolKeys() {
    assertEquals(
        map("a#b", 1),
        Parse.parse(Encode.encode(map("a#b", 1), EncodeOptions.singlePhase())));
    assertEquals(
        map(".k", 1),
        Parse.parse(Encode.encode(map(".k", 1), EncodeOptions.singlePhase())));
  }

  @Test
  void escapedContentWithoutBareHashLine() {
    // Java wire package predates protocol 0.6.0 `#` annotation lines; only assert escape.
    String wire = ">\n" + ESC + "#k:1\na:2\n";
    assertEquals(map("#k", 1, "a", 2), Parse.parse(wire, PARSE));
    assertEquals(map(ESC + "#k", 1, "a", 2), Parse.parse(wire));
  }

  @Test
  void liveParserSymbolKeys() {
    Parse.LiveXaiopParser live = new Parse.LiveXaiopParser(PARSE);
    live.feedText(Encode.encode(map("#k", 1, "@m", 2), ENC));
    assertEquals(map("#k", 1, "@m", 2), live.value());
  }

  @Test
  void checkpointEngineSymbolKeys() {
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine eng =
        new DotCheckpointEngine(
            DotCheckpointEngine.Options.of(chunks::add)
                .streamProcessing(true)
                .mergeChunkWindow(false)
                .symbolKeys(true));
    eng.push(Encode.encode(map("#a", 1, "b", 2), EncodeOptions.builder().symbolKeys(true).build()));
    eng.finish();
    assertEquals(map("#a", 1, "b", 2), eng.committedSnapshot());
    assertFalse(chunks.isEmpty());
    assertEquals(map("#a", 1), chunks.get(0));
  }

  @Test
  void manualAtAndEqualsPathsWithEscapedSegments() {
    String wire =
        ">\n>"
            + ESC
            + "#box\n"
            + "x:1\n"
            + ".\n"
            + "@"
            + ESC
            + "#box\n"
            + "y:2\n"
            + ".\n"
            + "="
            + ESC
            + "#box\n"
            + "z:3\n";
    assertEquals(map("#box", map("x", 1, "y", 2, "z", 3)), Parse.parse(wire, PARSE));
  }

  @Test
  void leaveAndReenterEscapedNames() {
    String wire =
        ">\n>"
            + ESC
            + "#a\nv:1\n<\n>"
            + ESC
            + "@b\nw:2\n";
    assertEquals(map("#a", map("v", 1), "@b", map("w", 2)), Parse.parse(wire, PARSE));
  }

  @Test
  void doubleEscapeOnlyOneLayerPerDecode() {
    String key = ESC + "#k";
    String wire = Encode.encode(map(key, 1), ENC);
    assertTrue(wire.contains(ESC + ESC + "#k:1"));
    assertEquals(map(key, 1), Parse.parse(wire, PARSE));
    assertFalse(Parse.parse(wire, PARSE).equals(map("#k", 1)));
  }

  @Test
  void greaterThanHeadKeyRejectsByDefaultAndRoundTripsWithSymbolKeys() {
    var value = map(">test", "test");
    assertThrows(
        XaiopEncodeError.class, () -> Encode.encode(value, EncodeOptions.singlePhase()));
    assertEquals(value, roundTrip(value));
  }
}
