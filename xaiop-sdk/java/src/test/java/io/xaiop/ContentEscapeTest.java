package io.xaiop;

import static io.xaiop.Fixtures.list;
import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;

/** Protocol 0.7.0 Draft — always-on Content {@code \\} {@code \n} {@code \r}. */
class ContentEscapeTest {

  private static final EncodeOptions NONE = EncodeOptions.singlePhase();

  private static Object roundTrip(Object value) {
    return Parse.parse(Encode.encode(value, NONE));
  }

  @Test
  void roundTripsLfCrCrlfAndBackslash() {
    assertEquals(map("t", "hello\nworld"), roundTrip(map("t", "hello\nworld")));
    assertEquals(map("t", "a\rb"), roundTrip(map("t", "a\rb")));
    assertEquals(map("t", "a\r\nb"), roundTrip(map("t", "a\r\nb")));
    assertEquals(map("t", "a\\b"), roundTrip(map("t", "a\\b")));
    assertEquals(map("t", "a\\nb"), roundTrip(map("t", "a\\nb")));
  }

  @Test
  void literalBackslashNIsNotANewline() {
    String twoChar = "a" + "\\" + "n" + "b";
    @SuppressWarnings("unchecked")
    Map<String, Object> got = (Map<String, Object>) roundTrip(map("t", twoChar));
    assertEquals(twoChar, got.get("t"));
    assertNotEquals("a\nb", got.get("t"));
  }

  @Test
  void realNewlineAndTwoCharEscapeAreDistinctOnTheWire() {
    String nl = Encode.encode(map("t", "a\nb"), NONE);
    String lit = Encode.encode(map("t", "a\\nb"), NONE);
    assertTrue(nl.contains("t:a\\nb"));
    assertTrue(lit.contains("t:a\\\\nb"));
    assertNotEquals(nl, lit);
  }

  @Test
  void emptyOnlyNewlineConsecutiveAndUnicode() {
    assertEquals(map("t", ""), roundTrip(map("t", "")));
    assertEquals(map("t", "\n"), roundTrip(map("t", "\n")));
    assertEquals(map("t", "\n\n"), roundTrip(map("t", "\n\n")));
    assertEquals(map("t", "你好\n世界"), roundTrip(map("t", "你好\n世界")));
  }

  @Test
  void arrayScalarAndColonInValue() {
    assertEquals(list("line1\nline2"), roundTrip(list("line1\nline2")));
    assertEquals(map("t", "a:b\nc"), roundTrip(map("t", "a:b\nc")));
  }

  @Test
  void typingAfterUnescape() {
    assertEquals(map("n", 1), Parse.parse(">\nn:1\n"));
    assertEquals(map("f", true), Parse.parse(">\nf:true\n"));
    assertEquals(map("z", null), Parse.parse(">\nz:null\n"));
    Object s = ((Map<?, ?>) Parse.parse(">\ns:1\\n2\n")).get("s");
    assertInstanceOf(String.class, s);
    assertEquals("1\n2", s);
  }

  @Test
  void forcedStringThenUnescape() {
    assertEquals("hello\nworld", ((Map<?, ?>) Parse.parse(">\ns: hello\\nworld\n")).get("s"));
    assertEquals("true\n", ((Map<?, ?>) Parse.parse(">\ns: true\\n\n")).get("s"));
    assertEquals(true, ((Map<?, ?>) Parse.parse(">\ns:true\n")).get("s"));
  }

  @Test
  void tabLiteralLeadingSpaceStillRejected() {
    assertEquals(map("t", "a\tb"), roundTrip(map("t", "a\tb")));
    XaiopEncodeError err =
        assertThrows(XaiopEncodeError.class, () -> Encode.encode(map("t", " spaced"), NONE));
    assertTrue(err.getMessage().contains("U+0020 SPACE"));
  }

  @Test
  void unknownEscapeAndTrailingBackslashAreSyntaxErrors() {
    for (String wire : new String[] {">\na:x\\ty\n", ">\na:x\\xy\n", ">\na:x\\Ny\n", ">\na:x\\0y\n"}) {
      XaiopSyntaxError err = assertThrows(XaiopSyntaxError.class, () -> Parse.parse(wire));
      assertTrue(err.getMessage().contains("unknown Content escape"), err.getMessage());
    }
    XaiopSyntaxError dangling = assertThrows(XaiopSyntaxError.class, () -> Parse.parse(">\na:end\\\n"));
    assertTrue(dangling.getMessage().contains("incomplete Content escape"), dangling.getMessage());
  }

  @Test
  void physicalLfStillStartsANewLine() {
    assertThrows(XaiopSyntaxError.class, () -> Parse.parse(">\na:hello\nworld\n"));
  }

  @Test
  void completeTrailingBackslashAndDoubled() {
    assertEquals("end\\", ((Map<?, ?>) Parse.parse(">\na:end\\\\\n")).get("a"));
    assertEquals(map("t", "\\"), roundTrip(map("t", "\\")));
    assertEquals(map("t", "\\\\"), roundTrip(map("t", "\\\\")));
  }

  @Test
  void escapesAtEdgesAndMixed() {
    assertEquals(map("t", "\nstart"), roundTrip(map("t", "\nstart")));
    assertEquals(map("t", "end\n"), roundTrip(map("t", "end\n")));
    assertEquals(map("t", "a\\\nb"), roundTrip(map("t", "a\\\nb")));
  }

  @Test
  void encodeKeepsLfInsideTheContentToken() {
    String wire = Encode.encode(map("t", "a\nb"), NONE);
    String content = null;
    for (String line : wire.split("\\r?\\n", -1)) {
      if (line.startsWith("t:")) content = line;
    }
    assertEquals("t:a\\nb", content);
  }

  @Test
  void liveParserConcat() {
    assertEquals("\nhey", ((Map<?, ?>) Parse.parse(">\na:\\nhey\n")).get("a"));
    Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
    live.feedText(Encode.encode(map("t", "p1\np2"), NONE));
    assertEquals("p1\np2", ((Map<?, ?>) live.value()).get("t"));
  }

  @Test
  void feedLineEscapedContent() {
    Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
    live.feedLine(">");
    live.feedLine("t:a\\nb");
    assertEquals("a\nb", ((Map<?, ?>) live.value()).get("t"));
  }

  @Test
  void emojiConsecutiveAndUnknownQuote() {
    assertEquals(map("t", "🙂\n🎉"), roundTrip(map("t", "🙂\n🎉")));
    assertEquals("a\n\nb", ((Map<?, ?>) Parse.parse(">\ns:a\\n\\nb\n")).get("s"));
    assertThrows(XaiopSyntaxError.class, () -> Parse.parse(">\na:x\\\"y\n"));
  }

  @Test
  void mergeOverlayUnescapesContent() {
    assertEquals(
        map("a", 1, "s", "hello\nworld"), Merge.mergeToJson(map("a", 1), ">\ns:hello\\nworld\n"));
  }
}
