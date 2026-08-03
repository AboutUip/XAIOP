package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ParseTest {

  @Test
  void emptySourceYieldsEmptyMap() {
    Object result = Parse.parse("");
    assertInstanceOf(Map.class, result);
    assertTrue(((Map<?, ?>) result).isEmpty());
  }

  @Test
  void anonymousRootObjectWithContent() {
    Object result = Parse.parse(">\na:1\n");
    assertInstanceOf(Map.class, result);
    @SuppressWarnings("unchecked")
    Map<String, Object> map = (Map<String, Object>) result;
    assertEquals(1, map.size());
    assertEquals(Integer.valueOf(1), map.get("a"));
  }

  @Test
  void arrayRoot() {
    Object result = Parse.parse("-\n:1\n:2\n");
    assertInstanceOf(List.class, result);
    List<?> list = (List<?>) result;
    assertEquals(List.of(1, 2), list);
  }

  @Test
  void emptyMidLineThrows() {
    // splitLines only drops *trailing* empty lines; a blank line in the middle
    // of the document remains and must fail as a Content syntax error.
    XaiopSyntaxError err =
        assertThrows(XaiopSyntaxError.class, () -> Parse.parse(">\na:1\n\nb:2\n"));
    assertTrue(err.getMessage().contains("empty line is a Content syntax error"));
    assertEquals(Integer.valueOf(3), err.getLine());
  }

  @Test
  void namedObjectFragmentWithoutOuterAngle() {
    // No leading bare `>` before `>name` -> Root fragment mode, not a standalone `{}` document.
    Object result = Parse.parse(">name\na:1\n");
    assertInstanceOf(XaiopFragment.class, result);
    XaiopFragment fragment = (XaiopFragment) result;
    assertEquals("\"name\":{\"a\":1}", fragment.notation());
    @SuppressWarnings("unchecked")
    Map<String, Object> nameEntry = (Map<String, Object>) fragment.getEntries().get("name");
    assertEquals(Integer.valueOf(1), nameEntry.get("a"));
  }

  // --- typing (engine.test.js golden scenarios) -------------------------------

  @Test
  void scalarTypingAndTheForcedStringMarker() {
    assertEquals(
        Fixtures.map("n", 5, "s", "5", "flag", true, "text", "hi"),
        Parse.parse(">\nn:5\ns: 5\nflag:true\ntext:hi"));
  }

  @Test
  void floatTypingAndForcedStrings() {
    Map<?, ?> v =
        (Map<?, ?>)
            Parse.parse(
                ">\na:1.5\nb:-2.25\nc:.5\nd:5.\ne:1e3\nf:-2.5E-2\ng: 1.5\nh:1e3x\ni:NaN\nj:Infinity");
    assertInstanceOf(Double.class, v.get("a"), "1.5 is a float token");
    assertEquals(1.5, ((Number) v.get("a")).doubleValue());
    assertEquals(-2.25, ((Number) v.get("b")).doubleValue());
    assertEquals(0.5, ((Number) v.get("c")).doubleValue(), ".5 is a float token");
    assertEquals(5.0, ((Number) v.get("d")).doubleValue(), "5. is a float token");
    assertEquals(1000.0, ((Number) v.get("e")).doubleValue());
    assertEquals(-0.025, ((Number) v.get("f")).doubleValue());
    assertEquals("1.5", v.get("g"), "a leading space forces a string");
    assertEquals("1e3x", v.get("h"), "not a token → string");
    assertEquals("NaN", v.get("i"), "NaN is not a number token");
    assertEquals("Infinity", v.get("j"), "Infinity is not a number token");
  }

  @Test
  void floatsUseBinary64Precision() {
    Map<?, ?> v = (Map<?, ?>) Parse.parse(">\nx:0.1\ny:0.2\nz:0.30000000000000004");
    assertEquals(
        ((Number) v.get("z")).doubleValue(),
        ((Number) v.get("x")).doubleValue() + ((Number) v.get("y")).doubleValue());
  }

  @Test
  void nullTypingAndForcedStrings() {
    Map<?, ?> v = (Map<?, ?>) Parse.parse(">\na:null\nb: null\nc:true\n>arr-\n:null\n:1\n<");
    assertNull(v.get("a"));
    assertEquals("null", v.get("b"), "a leading space forces a string");
    assertEquals(Boolean.TRUE, v.get("c"));
    assertEquals(Fixtures.list(null, 1), v.get("arr"));
  }

  // --- structure (engine.test.js golden scenarios) ----------------------------

  @Test
  void namedArrayReEntersAndAppendsAcrossAPhase() {
    assertEquals(
        Fixtures.map("tags", Fixtures.list("a", "b")),
        Parse.parse(">\n>tags-\n:a\n.\n>\n>tags-\n:b\n"));
  }

  @Test
  void namedArrayReEntersAndAppendsAfterALeave() {
    assertEquals(
        Fixtures.map("tags", Fixtures.list("a", "b")),
        Parse.parse(">\n>tags-\n:a\n<\n>tags-\n:b\n"));
  }

  @Test
  void namedArrayReplacesAnObjectAtTheSameKey() {
    assertEquals(
        Fixtures.map("tags", Fixtures.list("a")), Parse.parse(">\n>tags\nx:1\n<\n>tags-\n:a\n"));
  }

  @Test
  void namedArraysMustUseTheEnterDashForm() {
    assertThrows(XaiopSyntaxError.class, () -> Parse.parse(">\ntags:\n-\n:a"));
  }

  @Test
  void bareLabelsAreRejected() {
    assertThrows(XaiopSyntaxError.class, () -> Parse.parse("data"));
  }

  @Test
  void anonymousRootWithANamedChildIsAPlainObject() {
    assertEquals(Fixtures.map("a", Fixtures.map()), Parse.parse(">\n>a"));
  }

  @Test
  void aNamedChildWithoutAnAnonymousRootIsAFragment() {
    XaiopFragment fragment = assertInstanceOf(XaiopFragment.class, Parse.parse(">a"));
    assertEquals(Fixtures.map("a", Fixtures.map()), fragment.getEntries());
    assertEquals("\"a\":{}", fragment.notation());
  }

  @Test
  void bareEnterOnAnObjectCursorReEntersAndOverwrites() {
    assertEquals(
        Fixtures.map("id", 2, "name", "b"), Parse.parse(">\nid:1\nname:a\n.\n>\nid:2\nname:b\n"));
  }

  @Test
  void bareEnterInsideAnArrayCreatesANewElement() {
    assertEquals(
        Fixtures.map("items", Fixtures.list(Fixtures.map("i", 1), Fixtures.map("i", 2))),
        Parse.parse(">\n>items-\n>\ni:1\n<\n>\ni:2\n<\n"));
  }

  @Test
  void underPoppingBeforeABareEnterReEntersTheCurrentElement() {
    Map<?, ?> v =
        (Map<?, ?>)
            Parse.parse(
                ">\n>siblings-\n>\ni:1\n>nested\na:1\n>b\nc:1\n<\n<\n>\ni:2\nlabel:S-2\n<\n");
    assertEquals(
        Fixtures.list(
            Fixtures.map(
                "i", 2, "nested", Fixtures.map("a", 1, "b", Fixtures.map("c", 1)), "label", "S-2")),
        v.get("siblings"),
        "two pops land back on element 0, so bare > modifies it");
  }

  @Test
  void aBareEnterAfterCorrectLeavesCreatesTheNextArraySibling() {
    Map<?, ?> v =
        (Map<?, ?>)
            Parse.parse(">\n>siblings-\n>\ni:1\n>nested\na:1\n<\n<\n>\ni:2\nlabel:S-2\n<\n");
    assertEquals(
        Fixtures.list(
            Fixtures.map("i", 1, "nested", Fixtures.map("a", 1)),
            Fixtures.map("i", 2, "label", "S-2")),
        v.get("siblings"));
  }

  @Test
  void complexFixtureParsesToTheExpectedTree() {
    assertEquals(Fixtures.complexJson(), Parse.parse(Fixtures.complexWire()));
  }

  @Test
  void compatTrueForcesRoot() {
    // Without compat, bare Content at Root (`a:1`, no leading `>`) yields a Fragment.
    Object strict = Parse.parse("a:1\n");
    assertInstanceOf(XaiopFragment.class, strict);

    // With compat=true (forcedRoot fix), the same source is coerced into an anonymous
    // root object instead of Fragment mode.
    Object compatResult = Parse.parse("a:1\n", true);
    assertInstanceOf(Map.class, compatResult);
    @SuppressWarnings("unchecked")
    Map<String, Object> map = (Map<String, Object>) compatResult;
    assertEquals(Integer.valueOf(1), map.get("a"));
  }
}
