package io.xaiop;

import static io.xaiop.Fixtures.list;
import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * {@code @path} (exact locate-or-create), {@code !path} (broadcast) and {@code =path} (fuzzy
 * locate) semantics, ported from the Node reference suite {@code bang.at.test.js}.
 */
class BangAtTest {

  private static XaiopSyntaxError syntaxError(String source) {
    return assertThrows(XaiopSyntaxError.class, () -> Parse.parse(source));
  }

  // --- @path -----------------------------------------------------------------

  @Test
  void atPathResolvesExactlyFromRootAndLeavesSiblingBranchUntouched() {
    Object v = Parse.parse(">\n>a\n>b\nx:1\n.\n>c\n>b\ny:2\n.\n@a>b\nz:3\n");
    assertEquals(
        map("a", map("b", map("x", 1, "z", 3)), "c", map("b", map("y", 2))),
        v,
        "@a>b must address the Root-anchored a>b only");
  }

  @Test
  void atPathDoesNotFuzzyFindNestedPathAndCreatesRootPathInstead() {
    Object v = Parse.parse(">\n>wrap\n>a\n>b\nx:1\n.\n@a>b\nz:1\n");
    assertEquals(
        map("wrap", map("a", map("b", map("x", 1))), "a", map("b", map("z", 1))),
        v,
        "@ is exact: wrap.a.b must not be reused");
  }

  @Test
  void atPathCreatesMissingSegments() {
    assertEquals(map("a", map("b", map("z", 1))), Parse.parse(">\n@a>b\nz:1\n"));
  }

  @Test
  void atPathWithNoPriorRootCreatesDocumentObjectRoot() {
    assertEquals(
        map("meta", map("title", map("text", "hi"))), Parse.parse("@meta>title\ntext:hi\n"));
  }

  @Test
  void atPathIntoArrayThenAppendsElement() {
    assertEquals(map("items", list(1, 2, 3)), Parse.parse(">\n>items-\n:1\n:2\n.\n@items\n:3\n"));
  }

  @Test
  void emptyAtPathIsRejected() {
    assertTrue(
        syntaxError(">\n>a\nx:1\n.\n@\n").getMessage().contains("empty @ path"),
        "bare @ must report an empty path");
  }

  // --- !path (broadcast) -----------------------------------------------------

  @Test
  void bangPathUpdatesAllSiblingMatches() {
    Object v = Parse.parse(">\n>left\n>test\nx:1\n.\n>right\n>test\ny:2\n.\n!test\nz:9\n");
    assertEquals(
        map("left", map("test", map("x", 1, "z", 9)), "right", map("test", map("y", 2, "z", 9))),
        v);
  }

  @Test
  void bangOuterMatchPrunesNestedSameFragment() {
    Object v = Parse.parse(">\n>test\nk:1\n>test\ninner:1\n.\n!test\nz:9\n");
    assertEquals(map("test", map("k", 1, "test", map("inner", 1), "z", 9)), v);
  }

  @Test
  void bangMultiSegmentPathMatchesEveryCompleteFragment() {
    Object v = Parse.parse(">\n>p\n>a\n>b\nx:1\n.\n>q\n>a\n>b\ny:2\n.\n!a>b\nz:3\n");
    assertEquals(
        map("p", map("a", map("b", map("x", 1, "z", 3))),
            "q", map("a", map("b", map("y", 2, "z", 3)))),
        v);
  }

  @Test
  void bangMultiSegmentPathPrunesNestedMatchUnderAnOuterMatch() {
    Object v =
        Parse.parse(
            ">\n>p\n>a\n>b\nx:1\n<\n>nest\n>a\n>b\ninner:1\n.\n>q\n>a\n>b\ny:2\n.\n!a>b\nz:9\n");
    assertEquals(
        map(
            "p",
            map("a", map("b", map("x", 1, "z", 9), "nest", map("a", map("b", map("inner", 1))))),
            "q",
            map("a", map("b", map("y", 2, "z", 9)))),
        v,
        "a match under p prunes the nested p.a.nest.a.b");
  }

  @Test
  void bangPathIntoArraysAppendsOnEachMatch() {
    Object v = Parse.parse(">\n>left\n>items-\n:1\n.\n>right\n>items-\n:2\n.\n!items\n:9\n");
    assertEquals(map("left", map("items", list(1, 9)), "right", map("items", list(2, 9))), v);
  }

  @Test
  void bangTypeConflictEntersANamedArrayUnderEveryMatch() {
    Object v = Parse.parse(">\n>left\n>box\nk:1\n.\n>right\n>box\nk:2\n.\n!box\n>tags-\n:a\n");
    assertEquals(
        map("left", map("box", map("k", 1, "tags", list("a"))),
            "right", map("box", map("k", 2, "tags", list("a")))),
        v);
  }

  @Test
  void bangWithNoMatchIsRejected() {
    assertTrue(
        syntaxError(">\n>a\nx:1\n.\n!missing\nz:1\n").getMessage().contains("!path no match"));
  }

  @Test
  void bangPartialLabelDoesNotMatch() {
    assertTrue(
        syntaxError(">\n>test\nx:1\n.\n!te\nz:1\n").getMessage().contains("!path no match"),
        "!te must not prefix-match test");
  }

  @Test
  void emptyBangPathIsRejected() {
    assertTrue(syntaxError(">\n>a\nx:1\n.\n!\n").getMessage().contains("empty ! path"));
  }

  @Test
  void bangWorksInTheSamePhaseAfterBuildingSiblings() {
    Object v =
        Parse.parse(
            ">\n>left\n>test\nx:1\n<\n<\n>right\n>test\ny:2\n<\n<\n!test\nz:9\n.\n>only\nv:1\n");
    assertEquals(
        map(
            "left", map("test", map("x", 1, "z", 9)),
            "right", map("test", map("y", 2, "z", 9)),
            "only", map("v", 1)),
        v);
  }

  // --- broadcast mode guards -------------------------------------------------

  private static final String TWO_MATCHES = ">\n>a\nx:1\n.\n>b\n>a\ny:2\n.\n!a\n";

  @Test
  void broadcastRejectsAtBeforeAPhaseReset() {
    assertTrue(
        syntaxError(TWO_MATCHES + "@a\nz:1\n").getMessage().contains("broadcast mode is active"));
  }

  @Test
  void broadcastRejectsEqualsBeforeAPhaseReset() {
    assertTrue(
        syntaxError(TWO_MATCHES + "=a\nz:1\n").getMessage().contains("broadcast mode is active"));
  }

  @Test
  void broadcastRejectsASecondBangBeforeAPhaseReset() {
    assertTrue(
        syntaxError(TWO_MATCHES + "!a\nz:1\n").getMessage().contains("broadcast mode is active"));
  }

  @Test
  void phaseResetClearsBroadcastAndLaterWritesUseASingleCursor() {
    Object v =
        Parse.parse(
            ">\n>left\n>test\nx:1\n.\n>right\n>test\ny:2\n.\n!test\nz:9\n.\n>only\nv:1\n");
    assertEquals(
        map(
            "left", map("test", map("x", 1, "z", 9)),
            "right", map("test", map("y", 2, "z", 9)),
            "only", map("v", 1)),
        v);
  }

  @Test
  void broadcastLeaveAtRootFailsEveryCursor() {
    String source = ">\n>left\n>test\nx:1\n.\n>right\n>test\ny:2\n.\n!test\n<\n<\n<\n";
    assertTrue(
        syntaxError(source).getMessage().contains("< at Root is illegal"),
        "the third pop hits the Root frame of the left/right cursors");
  }

  // --- contrast with = -------------------------------------------------------

  @Test
  void equalsPathStillFuzzyFindsANestedPath() {
    Object v = Parse.parse(">\n>wrap\n>a\n>b\nx:1\n.\n=a>b\nz:3\n");
    assertEquals(map("wrap", map("a", map("b", map("x", 1, "z", 3)))), v);
  }

  // --- fragment roots --------------------------------------------------------

  @Test
  void fragmentRootSupportsAtPath() {
    Object v = Parse.parse(">a\n>b\nx:1\n.\n@a>b\nz:2\n");
    XaiopFragment fragment = assertInstanceOf(XaiopFragment.class, v);
    assertEquals(map("a", map("b", map("x", 1, "z", 2))), fragment.getEntries());
  }

  @Test
  void fragmentRootSupportsBangPath() {
    Object v = Parse.parse(">left\n>t\nx:1\n.\n>right\n>t\ny:2\n.\n!t\nz:3\n");
    XaiopFragment fragment = assertInstanceOf(XaiopFragment.class, v);
    assertEquals(
        map("left", map("t", map("x", 1, "z", 3)), "right", map("t", map("y", 2, "z", 3))),
        fragment.getEntries());
  }
}
