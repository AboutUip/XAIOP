package io.xaiop;

import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.ParseHistory;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Port of Node {@code amp.delete.test.js} — core {@code &} delete semantics (protocol 0.6.0). */
class AmpDeleteTest {

  private static String wire(String... lines) {
    return String.join("\n", lines);
  }

  @Test
  void versions() {
    assertEquals("0.7.0", Xaiop.PROTOCOL_VERSION);
    assertEquals("0.15.1", Xaiop.SDK_VERSION);
  }

  @Test
  void deletesKeyCursorUnchangedLaterWriteIsCreate() {
    assertEquals(
        map("b", map("y", 2, "z", 3)),
        Parse.parse(wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3")));
  }

  @Test
  void nestedDeepestKeyOnlySiblingsKept() {
    assertEquals(
        map("a", map(), "c", map("z", 1, "keep", 9)),
        Parse.parse(wire(">", ">a", ">b", "x:1", "y:2", ".", ">c", "z:1", "&a>b", "keep:9")));
  }

  @Test
  void deletingNestedLeavesParentEmptyButPresent() {
    assertEquals(
        map("a", map(), "keep", map("v", 1)),
        Parse.parse(wire(">", ">a", ">b", "x:1", ".", ">keep", "v:1", "&a>b")));
  }

  @Test
  void missingKeyIsSilentNoOp() {
    assertEquals(map("a", map("x", 1)), Parse.parse(wire(">", ">a", "x:1", "&missing")));
  }

  @Test
  void missingNestedMidSegmentIsNoOp() {
    assertEquals(map("a", map("x", 1)), Parse.parse(wire(">", ">a", "x:1", "&a>nope>z")));
  }

  @Test
  void ampBeforeAnyTreeIsNoOp() {
    assertEquals(map("x", 1), Parse.parse(wire("&ghost", ">", "x:1")));
  }

  @Test
  void deleteThenRecreateSameAddressIsFreshObject() {
    @SuppressWarnings("unchecked")
    Map<String, Object> json =
        (Map<String, Object>)
            Parse.parse(wire(">", ">a", "old:1", ".", ">b", "t:1", "&a", ".", ">a", "new:2"));
    assertEquals(map("b", map("t", 1), "a", map("new", 2)), json);
    assertFalse(((Map<?, ?>) json.get("a")).containsKey("old"));
  }

  @Test
  void doesNotMoveCursor() {
    @SuppressWarnings("unchecked")
    Map<String, Object> json =
        (Map<String, Object>)
            Parse.parse(wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3"));
    assertEquals(map("b", map("y", 2, "z", 3)), json);
    assertFalse(json.containsKey("z"));
  }

  @Test
  void multipleNonConsecutiveAmpAcrossPhases() {
    assertEquals(
        map("c", map("z", 1), "d", map("w", 1)),
        Parse.parse(
            wire(
                ">",
                ">a",
                "x:1",
                ".",
                ">b",
                "y:1",
                ".",
                ">c",
                "z:1",
                "&a",
                ".",
                ">d",
                "w:1",
                "&b")));
  }

  @Test
  void consecutiveAmpDeleteSeveralKeys() {
    assertEquals(
        map("c", map("z", 1)),
        Parse.parse(wire(">", ">a", "x:1", ".", ">b", "y:1", ".", ">c", "z:1", "&a", "&b")));
  }

  @Test
  void deletesWholeNamedArray() {
    assertEquals(
        map("keep", map("v", 1)),
        Parse.parse(wire(">", ">items-", ":1", ":2", ".", ">keep", "v:1", "&items")));
  }

  @Test
  void afterDeletingArrayNameCreatesNewEmptyArray() {
    assertEquals(
        map("k", map("v", 1), "items", List.of(9)),
        Parse.parse(wire(">", ">items-", ":1", ".", ">k", "v:1", "&items", ".", ">items-", ":9")));
  }

  @Test
  void arrayIndexLikePathIsNoOp() {
    assertEquals(
        map("items", List.of(1, 2), "k", map("v", 1)),
        Parse.parse(wire(">", ">items-", ":1", ":2", ".", ">k", "v:1", "&items>0")));
  }

  @Test
  void bareAmpIsSyntaxError() {
    XaiopSyntaxError e =
        assertThrows(XaiopSyntaxError.class, () -> Parse.parse(wire(">", "&")));
    assertTrue(
        e.getMessage().contains("empty & path")
            || e.getMessage().contains("not an array element"));
  }

  @Test
  void invalidPathFormsRejected() {
    for (String bad : List.of("&", "&>a", "&a>", "&a>>b", "&a> >b")) {
      assertThrows(XaiopSyntaxError.class, () -> Parse.parse(wire(">", "x:1", bad)), bad);
    }
  }

  @Test
  void fragmentRootRejectsAmp() {
    XaiopSyntaxError e =
        assertThrows(XaiopSyntaxError.class, () -> Parse.parse(wire(">a", "x:1", "&a")));
    assertTrue(e.getMessage().contains("object document root"));
  }

  @Test
  void arrayRootRejectsAmp() {
    XaiopSyntaxError e =
        assertThrows(XaiopSyntaxError.class, () -> Parse.parse(wire("-", ":1", "&a")));
    assertTrue(e.getMessage().contains("object document root"));
  }

  @Test
  void ampDoesNotCreateNodes() {
    @SuppressWarnings("unchecked")
    Map<String, Object> json =
        (Map<String, Object>) Parse.parse(wire(">", "x:1", "&new>child"));
    assertEquals(map("x", 1), json);
    assertFalse(json.containsKey("new"));
  }

  @Test
  void deletingCurrentCursorNodeErrors() {
    XaiopSyntaxError e =
        assertThrows(XaiopSyntaxError.class, () -> Parse.parse(wire(">", ">a", "x:1", "&a")));
    assertTrue(e.getMessage().contains("Cursor chain"));
  }

  @Test
  void deletingAncestorOnCursorChainErrors() {
    XaiopSyntaxError e =
        assertThrows(
            XaiopSyntaxError.class, () -> Parse.parse(wire(">", ">a", ">b", "x:1", "&a")));
    assertTrue(e.getMessage().contains("Cursor chain"));
  }

  @Test
  void deletingSiblingOfCursorIsOk() {
    assertEquals(map("b", map("y", 1)), Parse.parse(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a")));
  }

  @Test
  void deletingNestedKeyUnderSiblingIsOk() {
    assertEquals(
        map("a", map(), "c", map("y", 1)),
        Parse.parse(wire(">", ">a", ">b", "x:1", ".", ">c", "y:1", "&a>b")));
  }

  @Test
  void atThenAmpOfThatPathWhileStillInsideErrors() {
    XaiopSyntaxError e =
        assertThrows(
            XaiopSyntaxError.class, () -> Parse.parse(wire(">", "@a>b", "x:1", "&a>b")));
    assertTrue(e.getMessage().contains("Cursor chain"));
  }

  @Test
  void dotThenAmpOfPriorPathIsOk() {
    assertEquals(
        map("b", map("y", 1)), Parse.parse(wire(">", ">a", "x:1", ".", "&a", ">b", "y:1")));
  }

  @Test
  void relativeAmpDeletesUnderEachCursor() {
    assertEquals(
        map("box", map("a", map("meta", map("k", 1)), "b", map("meta", map("k", 2)))),
        Parse.parse(
            wire(
                ">",
                ">box",
                ">a",
                ">meta",
                "k:1",
                "drop:9",
                "<",
                "<",
                ">b",
                ">meta",
                "k:2",
                "drop:8",
                ".",
                "!meta",
                "&drop")));
  }

  @Test
  void perCursorMissingIsNoOpOthersStillDelete() {
    assertEquals(
        map("box", map("a", map("meta", map("k", 1)), "b", map("meta", map("k", 2)))),
        Parse.parse(
            wire(
                ">",
                ">box",
                ">a",
                ">meta",
                "k:1",
                "drop:9",
                "<",
                "<",
                ">b",
                ">meta",
                "k:2",
                ".",
                "!meta",
                "&drop")));
  }

  @Test
  void ampAllowedInBroadcast() {
    assertEquals(
        map("a", map("meta", map("k", 1, "extra", 3)), "b", map("meta", map("k", 2, "extra", 3))),
        Parse.parse(
            wire(
                ">",
                ">a",
                ">meta",
                "drop:1",
                "k:1",
                ".",
                ">b",
                ">meta",
                "drop:2",
                "k:2",
                ".",
                "!meta",
                "&drop",
                "extra:3")));
  }

  @Test
  void relativeAmpDoesNotUseRootAbsolutePath() {
    assertEquals(
        map("box", map("a", map("meta", map("k", 1)))),
        Parse.parse(wire(">", ">box", ">a", ">meta", "k:1", ".", "!meta", "&box")));
  }

  @Test
  void dotExitsBroadcastFollowingAmpIsAbsolute() {
    assertEquals(
        map("b", map("meta", map("drop", 2, "k", 2))),
        Parse.parse(
            wire(
                ">",
                ">a",
                ">meta",
                "drop:1",
                "k:1",
                ".",
                ">b",
                ">meta",
                "drop:2",
                "k:2",
                ".",
                "!meta",
                ".",
                "&a")));
  }

  @Test
  void locateThenAmpAbsoluteWhileCursorElsewhere() {
    assertEquals(
        map("b", map("y", 1, "z", 3)),
        Parse.parse(wire(">", ">a", "x:1", ".", ">b", "y:1", ".", "=b", "&a", "z:3")));
  }

  @Test
  void ampThenLocateStillFindsRemaining() {
    assertEquals(
        map("b", map("y", 1, "z", 2)),
        Parse.parse(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", ".", "=b", "z:2")));
  }

  @Test
  void ampThenBangNoLongerMatchesDeleted() {
    XaiopSyntaxError e =
        assertThrows(
            XaiopSyntaxError.class,
            () ->
                Parse.parse(
                    wire(">", ">a", ">t", "x:1", ".", ">b", "y:1", "&a", ".", "!t", "z:9")));
    assertTrue(e.getMessage().contains("no match"));
  }

  @Test
  void atAfterAmpRecreatesPath() {
    assertEquals(
        map("b", map("y", 1), "a", map("z", 2)),
        Parse.parse(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", ".", "@a", "z:2")));
  }

  @Test
  void dotDoesNotUndoAmp() {
    assertEquals(
        map("b", map("y", 1), "z", 9),
        Parse.parse(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", ".", "z:9")));
  }

  @Test
  void mustNotDeleteSiblingKeysWhenDeletingNested() {
    assertEquals(
        map("a", map("keep", 1), "c", map("y", 1)),
        Parse.parse(wire(">", ">a", "keep:1", ">b", "x:1", ".", ">c", "y:1", "&a>b")));
  }

  @Test
  void mustNotLeaveTypedNullInPlaceOfDeletedKey() {
    @SuppressWarnings("unchecked")
    Map<String, Object> json =
        (Map<String, Object>) Parse.parse(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a"));
    assertFalse(json.containsKey("a"));
  }

  @Test
  void mustNotTreatContentNullAsDelete() {
    assertEquals(map("a", null, "b", 1), Parse.parse(wire(">", "a:null", "b:1")));
  }

  @Test
  void mustNotMoveCursorToRootOnAmp() {
    Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
    live.feedText(wire(">", ">a", "x:1", ".", ">b", "y:1"));
    List<String> before = live.cursorRestoreLines();
    live.feedLine("&a");
    assertEquals(before, live.cursorRestoreLines());
    assertEquals(List.of(">b"), live.cursorRestoreLines());
  }

  @Test
  void mustNotAllowAmpWithOperatorCharsInName() {
    assertThrows(XaiopSyntaxError.class, () -> Parse.parse(wire(">", "x:1", "&a@b")));
  }

  @Test
  void encodeMustNotEmitKeysWithAmp() {
    assertThrows(XaiopEncodeError.class, () -> Encode.encode(map("a&b", 1)));
  }

  @Test
  void liveEqualsParseSync() {
    String[] corpus = {
      wire(">", ">a", "x:1", ".", ">b", "y:2", "&a"),
      wire(">", ">a", ">b", "x:1", ".", ">c", "z:1", "&a>b", "w:2"),
      wire(">", ">items-", ":1", ":2", ".", ">k", "v:1", "&items"),
      wire(">", ">a", "x:1", ".", ">b", "y:1", "&missing", "z:2"),
      wire(">", ">a", "x:1", ".", ">b", "y:1", ".", ">c", "z:1", "&a", "&b"),
    };
    for (String text : corpus) {
      Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
      live.feedText(text);
      assertEquals(Parse.parse(text), live.value(), text);
    }
  }

  @Test
  void fragmentPlusHashStillFragment() {
    Object frag = Parse.parse("# header\n>meta\nname:demo\n");
    assertInstanceOf(XaiopFragment.class, frag);
  }

  // --- stream non-cover / cover (DotCheckpointEngine) -------------------------

  @Test
  void streamNonCoverPriorDiffUnchangedAfterLaterAmp() {
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(false)
            .onChunk(chunks::add)
            .build();
    eng.push(wire(">", ">a", "x:1", ".") + "\n");
    assertEquals(1, chunks.size());
    Object first = Json.deepClone(chunks.get(0));
    eng.push(wire(">", ">b", "y:2", "&a", ".") + "\n");
    eng.finish();
    assertEquals(first, chunks.get(0));
    assertEquals(map("a", map("x", 1)), first);
    assertEquals(map("b", map("y", 2)), eng.snapshot());
  }

  @Test
  void streamNonCoverPhaseWithAmpUsesCumulativeDiff() {
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(false)
            .onChunk(chunks::add)
            .build();
    eng.push(wire(">", ">a", "x:1", ".") + "\n");
    eng.push(wire(">", ">b", "y:1", "&a", ".") + "\n");
    eng.finish();
    assertEquals(map("b", map("y", 1)), chunks.get(1));
    assertFalse(((Map<?, ?>) chunks.get(1)).containsKey("a"));
  }

  @Test
  void streamCoverTombstoneThenContent() {
    List<Object> chunks = new ArrayList<>();
    String text = wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", "z:2", ".") + "\n";
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(true)
            .historySnapshot(true)
            .onChunk(chunks::add)
            .build();
    eng.push(text);
    eng.finish();
    assertEquals(Parse.parse(text), eng.snapshot());
    assertTrue(
        chunks.stream()
            .anyMatch(
                c -> c instanceof Map<?, ?> m && m.get("a") == null && m.containsKey("a")));
    ParseHistory hist = eng.history();
    assertNotNull(hist);
    assertTrue(hist.length() >= 2);
    StringBuilder allWire = new StringBuilder();
    for (int i = 0; i < hist.length(); i++) {
      String w = hist.getNode(i).wire;
      if (w != null) allWire.append(w);
    }
    assertTrue(allWire.toString().contains("&a"));
  }

  @Test
  void streamCoverConsecutiveAmpsMergeTombstone() {
    List<Object> chunks = new ArrayList<>();
    String text =
        wire(">", ">a", "x:1", ".", ">b", "y:1", ".", ">c", "z:1", "&a", "&b", "w:9", ".") + "\n";
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(true)
            .onChunk(chunks::add)
            .build();
    eng.push(text);
    eng.finish();
    assertEquals(Parse.parse(text), eng.snapshot());
    boolean found =
        chunks.stream()
            .anyMatch(
                c ->
                    c instanceof Map<?, ?> m
                        && m.get("a") == null
                        && m.get("b") == null
                        && m.containsKey("a")
                        && m.containsKey("b"));
    assertTrue(found, "expected one merged tombstone with a:null and b:null");
  }

  @Test
  void streamCoverNestedTombstoneDeepestNullOnly() {
    List<Object> chunks = new ArrayList<>();
    String text = wire(">", ">a", ">b", "x:1", ".", ">c", "y:1", "&a>b", "z:2", ".") + "\n";
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(true)
            .onChunk(chunks::add)
            .build();
    eng.push(text);
    eng.finish();
    Object tomb =
        chunks.stream()
            .filter(
                c ->
                    c instanceof Map<?, ?> m
                        && m.get("a") instanceof Map<?, ?> a
                        && a.get("b") == null)
            .findFirst()
            .orElse(null);
    assertNotNull(tomb);
    assertEquals(map("a", map("b", null)), tomb);
    assertEquals(Parse.parse(text), eng.snapshot());
  }

  @Test
  void streamCoverRestoreKeepsPostAmpContentOnPriorCursor() {
    String text = wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", "z:2", ".") + "\n";
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(true)
            .onChunk(d -> {})
            .build();
    eng.push(text);
    eng.finish();
    assertEquals(map("b", map("y", 1, "z", 2)), eng.snapshot());
  }

  @Test
  void streamCoverHistoryNodesNotRewrittenByLaterAmp() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(true)
            .historySnapshot(true)
            .onChunk(d -> {})
            .build();
    eng.push(wire(">", ">a", "x:1", ".") + "\n");
    ParseHistory h = eng.history();
    assertNotNull(h);
    Object firstAfter = Json.deepClone(h.getAfter(0));
    eng.push(wire(">", ">b", "y:1", "&a", ".") + "\n");
    eng.finish();
    assertEquals(firstAfter, h.getAfter(0));
    assertEquals(map("a", map("x", 1)), firstAfter);
  }

  @Test
  void streamCoverAndNonCoverFinalsMatch() {
    String text =
        wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", "&missing", "z:2", ".") + "\n";
    Object nonCover = runCover(text, false);
    Object cover = runCover(text, true);
    assertEquals(nonCover, cover);
    assertEquals(Parse.parse(text), nonCover);
  }

  @Test
  void broadcastStillForbidsAtLocateBangWithoutDot() {
    XaiopSyntaxError e =
        assertThrows(
            XaiopSyntaxError.class,
            () ->
                Parse.parse(
                    wire(
                        ">",
                        ">a",
                        ">meta",
                        "x:1",
                        ".",
                        ">b",
                        ">meta",
                        "y:1",
                        ".",
                        "!meta",
                        "@a")));
    assertTrue(e.getMessage().toLowerCase().contains("broadcast"));
  }

  @Test
  void streamNonCoverCommittedReflectsDeleteImmediately() {
    String text = wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", ".") + "\n";
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(false)
            .onChunk(d -> {})
            .build();
    eng.push(wire(">", ">a", "x:1", ".") + "\n");
    assertEquals(map("a", map("x", 1)), eng.committedSnapshot());
    eng.push(wire(">", ">b", "y:2", "&a", ".") + "\n");
    assertEquals(map("b", map("y", 2)), eng.committedSnapshot());
    eng.finish();
    assertEquals(Parse.parse(text), eng.snapshot());
  }

  @Test
  void streamNonCoverCharChunkedFinalMatchesParse() {
    String text = wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3", ".") + "\n";
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(false)
            .onChunk(d -> {})
            .build();
    for (int i = 0; i < text.length(); i++) {
      eng.push(String.valueOf(text.charAt(i)));
    }
    eng.finish();
    assertEquals(Parse.parse(text), eng.snapshot());
  }

  private static Object runCover(String text, boolean cover) {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(cover)
            .onChunk(d -> {})
            .build();
    eng.push(text);
    eng.finish();
    return eng.snapshot();
  }
}
