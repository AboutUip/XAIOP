package io.xaiop;

import static io.xaiop.Fixtures.list;
import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.compat.CompatFixId;
import io.xaiop.compat.CompatPolicy;
import java.util.EnumMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Compatibility mode: the eight deterministic ingest fixes, each verified to be both effective
 * when on and inert when off. Ported from the Node reference suite {@code engine.test.js}.
 */
class CompatTest {

  /** Every fix on except {@code disabled}. */
  private static Map<CompatFixId, Boolean> allBut(CompatFixId disabled) {
    EnumMap<CompatFixId, Boolean> overrides = new EnumMap<>(CompatFixId.class);
    overrides.put(disabled, false);
    return overrides;
  }

  private static XaiopSyntaxError strictError(String source) {
    return assertThrows(XaiopSyntaxError.class, () -> Parse.parse(source));
  }

  // --- mode plumbing ---------------------------------------------------------

  @Test
  void compatibilityModeDefaultsOffAndCanBeEnabled() {
    XaiopEngine engine = new XaiopEngine();
    assertFalse(engine.compatibilityMode(), "engines start strict");
    engine.setCompatibilityMode(true);
    assertTrue(engine.compatibilityMode());
    assertTrue(new XaiopEngine(true).compatibilityMode());
  }

  @Test
  void everyFixDefaultsOnButOnlyTogglesWhileModeIsOn() {
    XaiopEngine engine = new XaiopEngine();
    for (CompatFixId id : CompatFixId.values()) {
      assertTrue(engine.compatFix(id), id + " defaults on");
      assertFalse(engine.setCompatFix(id, false), id + " must not apply while compat is off");
      assertTrue(engine.compatFix(id), id + " stays unchanged while compat is off");
    }

    engine.setCompatibilityMode(true);
    for (CompatFixId id : CompatFixId.values()) {
      assertTrue(engine.setCompatFix(id, false), id + " applies while compat is on");
      assertFalse(engine.compatFix(id));
      assertTrue(engine.setCompatFix(id, true));
      assertTrue(engine.compatFix(id));
    }
  }

  @Test
  void compatibilityModeDoesNotChangeStrictlyValidDocuments() {
    assertEquals(map("x", 1), Parse.parse(">\nx:1"));
    assertEquals(map("x", 1), Parse.parse(">\nx:1", false));
    assertEquals(map("x", 1), Parse.parse(">\nx:1", true));
    assertEquals(list("a", "b"), Parse.parse("-\n:a\n:b", true), "array root survives compat");
  }

  // --- 1. forcedRoot ---------------------------------------------------------

  @Test
  void forcedRootInjectsAnObjectRootSoBareArrayElementsWork() {
    String source = ">meta\nname:demo\n.\n>characters-\n>\nname:alice\n<\n";
    assertInstanceOf(XaiopFragment.class, Parse.parse(">meta\nname:demo"));
    strictError(source);
    assertEquals(
        map("meta", map("name", "demo"), "characters", list(map("name", "alice"))),
        Parse.parse(source, true));
  }

  @Test
  void forcedRootOffKeepsTheStrictFragmentShape() {
    Object v = Parse.parse(">meta\nname:demo", allBut(CompatFixId.forcedRoot));
    XaiopFragment fragment = assertInstanceOf(XaiopFragment.class, v);
    assertEquals(map("meta", map("name", "demo")), fragment.getEntries());
  }

  @Test
  void forcedRootAloneCoercesABareContentRoot() {
    EnumMap<CompatFixId, Boolean> onlyForcedRoot = new EnumMap<>(CompatFixId.class);
    for (CompatFixId id : CompatFixId.values()) onlyForcedRoot.put(id, false);
    onlyForcedRoot.put(CompatFixId.forcedRoot, true);
    assertEquals(map("meta", map("name", "demo")), Parse.parse(">meta\nname:demo", onlyForcedRoot));
  }

  // --- 2. rewriteBareNameArray ----------------------------------------------

  @Test
  void rewriteBareNameArrayTurnsBareNameDashIntoAnArrayEnter() {
    String source = ">\n>characters-\n>\nname:江辞\naliases-\n:绝世神医\n:楚家大少\n<\ngender:男\n<\n";
    assertTrue(strictError(source).getMessage().contains("Bare Label"));
    assertEquals(
        map(
            "characters",
            list(map("name", "江辞", "aliases", list("绝世神医", "楚家大少"), "gender", "男"))),
        Parse.parse(source, true));
  }

  @Test
  void rewriteBareNameArrayLeavesABareNameWithoutTrailingDashAlone() {
    XaiopSyntaxError err =
        assertThrows(XaiopSyntaxError.class, () -> Parse.parse(">\n>meta\naliases\n", true));
    assertTrue(err.getMessage().contains("Bare Label"));
  }

  @Test
  void rewriteBareNameArrayOffFailsLikeStrict() {
    assertThrows(
        XaiopSyntaxError.class,
        () -> Parse.parse(">\ntags-\n:a", allBut(CompatFixId.rewriteBareNameArray)));
    assertEquals(map("tags", list("a")), Parse.parse(">\ntags-\n:a", true));
  }

  // --- 3. rewriteEnterLine ---------------------------------------------------

  @Test
  void rewriteEnterLineNormalizesAWhitespaceOnlyEnter() {
    String source = ">  \nid:wideflat-bench  \nok:true\n";
    assertTrue(strictError(source).getMessage().contains("invalid label name"));
    assertEquals(map("id", "wideflat-bench", "ok", true), Parse.parse(source, true));
  }

  @Test
  void rewriteEnterLineStripsAGluedEnterFromContent() {
    String source = ">\n>shard_index:1\n>shard_total:3\n>characters-\n>\nname:江辞\n<\n";
    assertTrue(strictError(source).getMessage().contains("invalid label name"));
    assertEquals(
        map("shard_index", 1, "shard_total", 3, "characters", list(map("name", "江辞"))),
        Parse.parse(source, true));
  }

  @Test
  void rewriteEnterLineOffFailsLikeStrict() {
    assertThrows(
        XaiopSyntaxError.class,
        () -> Parse.parse(">  \nid:x\n", allBut(CompatFixId.rewriteEnterLine)));
  }

  // --- 4. ignoreBareLeaveAtRoot ---------------------------------------------

  @Test
  void ignoreBareLeaveAtRootDropsAStrayLeaveAfterAPhase() {
    String source = ">\n>beats-\n>\nkind:dialogue\ntext:hi\n<\n.\n<\n>\nid:23-1\nlocation:神医大会\n";
    assertTrue(strictError(source).getMessage().contains("< at Root is illegal"));
    assertEquals(
        map(
            "beats", list(map("kind", "dialogue", "text", "hi")),
            "id", "23-1",
            "location", "神医大会"),
        Parse.parse(source, true));
  }

  @Test
  void ignoreBareLeaveAtRootDoesNotCoverNamedLeaves() {
    XaiopSyntaxError err =
        assertThrows(XaiopSyntaxError.class, () -> Parse.parse(">\nid:1\n.\n<meta\n", true));
    assertTrue(err.getMessage().contains("< at Root is illegal"));
  }

  @Test
  void ignoreBareLeaveAtRootOffFailsLikeStrict() {
    assertThrows(
        XaiopSyntaxError.class,
        () -> Parse.parse(">\nid:1\n.\n<\n>\nx:1\n", allBut(CompatFixId.ignoreBareLeaveAtRoot)));
  }

  // --- 5. popAndRetry --------------------------------------------------------

  private static final String MISSING_LEAVE_ARRAY =
      ">\n>tags-\n:alpha\n:beta\n>users-\n>\nid:1\nname:alice\n<\n";

  @Test
  void popAndRetryRecoversAMissingLeaveArray() {
    strictError(MISSING_LEAVE_ARRAY);
    assertThrows(XaiopSyntaxError.class, () -> Parse.parse(MISSING_LEAVE_ARRAY, false));
    assertEquals(
        map("tags", list("alpha", "beta"), "users", list(map("id", 1, "name", "alice"))),
        Parse.parse(MISSING_LEAVE_ARRAY, true));
  }

  @Test
  void popAndRetryRecoversTwoSequentialCursorErrorsInOneDocument() {
    String source = ">\n>tags-\n:a\n>features-\n:x\n>meta\nname:demo\n.";
    assertTrue(strictError(source).getMessage().contains("inside an array"));
    assertEquals(
        map("tags", list("a"), "features", list("x"), "meta", map("name", "demo")),
        Parse.parse(source, true));
  }

  @Test
  void popAndRetryRecoversALeaveArrayThenNamedSection() {
    String source =
        ">\n>siblings-\n>\ni:1\n>nested\na:1\n<\n<\n>\ni:2\nlabel:S-2\n<\n>meta\nok:1\n.";
    assertTrue(strictError(source).getMessage().contains("inside an array"));
    assertEquals(
        map(
            "siblings",
            list(map("i", 1, "nested", map("a", 1)), map("i", 2, "label", "S-2")),
            "meta",
            map("ok", 1)),
        Parse.parse(source, true));
  }

  @Test
  void popAndRetryOffFailsLikeStrictOnThatSlip() {
    XaiopEngine engine = new XaiopEngine(true);
    assertTrue(engine.setCompatFix(CompatFixId.popAndRetry, false));
    assertThrows(XaiopSyntaxError.class, () -> engine.uploadSync(MISSING_LEAVE_ARRAY));

    assertTrue(engine.setCompatFix(CompatFixId.popAndRetry, true));
    assertEquals(
        map("tags", list("alpha", "beta"), "users", list(map("id", 1, "name", "alice"))),
        engine.getSync(engine.uploadSync(MISSING_LEAVE_ARRAY)));
  }

  @Test
  void popAndRetryStopsWhenTheErrorChangesAfterPopping() {
    assertThrows(XaiopSyntaxError.class, () -> Parse.parse(">\ndata", true));
    assertThrows(XaiopSyntaxError.class, () -> Parse.parse("data", true));
  }

  // --- 6. locatePathTrim -----------------------------------------------------

  private static final String LOCATE_BASE = ">\n>meta\na:1\n.\n";

  @Test
  void locatePathTrimStripsSurroundingSpacesOnce() {
    String source = LOCATE_BASE + "= meta\nb:2\n";
    assertTrue(strictError(source).getMessage().contains("=path not found"));
    assertEquals(map("meta", map("a", 1, "b", 2)), Parse.parse(source, true));
  }

  @Test
  void locatePathTrimStillReportsAGenuinelyMissingPath() {
    XaiopSyntaxError err =
        assertThrows(XaiopSyntaxError.class, () -> Parse.parse(">\na:1\n= missing", true));
    assertTrue(
        err.getMessage().contains("=path not found:  missing"),
        "the original (untrimmed) path is reported: " + err.getMessage());
  }

  @Test
  void locatePathTrimOffFailsLikeStrict() {
    assertThrows(
        XaiopSyntaxError.class,
        () -> Parse.parse(LOCATE_BASE + "= meta\nb:2\n", allBut(CompatFixId.locatePathTrim)));
  }

  // --- 7. locatePathStripSpaces ---------------------------------------------

  @Test
  void locatePathStripSpacesRemovesInteriorSpacesOnTheSecondRetry() {
    String source = ">\n>child\n>inner\na:1\n.\n=child > inner\nb:2\n";
    assertTrue(strictError(source).getMessage().contains("=path not found"));
    assertEquals(map("child", map("inner", map("a", 1, "b", 2))), Parse.parse(source, true));
  }

  @Test
  void locatePathStripSpacesOffFailsLikeStrict() {
    assertThrows(
        XaiopSyntaxError.class,
        () ->
            Parse.parse(
                ">\n>child\n>inner\na:1\n.\n=child > inner\nb:2\n",
                allBut(CompatFixId.locatePathStripSpaces)));
  }

  // --- 8. locatePathArraySuffix ---------------------------------------------

  @Test
  void locatePathArraySuffixMapsNameDashOntoAnArrayKey() {
    String source = ">\n>siblings-\n>\ni:1\n<\n.\n=siblings-\n>\ni:2\nlabel:S-2\n<\n";
    assertTrue(strictError(source).getMessage().contains("=path not found: siblings-"));
    assertEquals(
        map("siblings", list(map("i", 1), map("i", 2, "label", "S-2"))), Parse.parse(source, true));
  }

  @Test
  void locatePathArraySuffixMapsANestedCreateSuffix() {
    String source = ">\n>wrap\n>items-\n>\nid:1\n<\n.\n=wrap>items-\n>\nid:2\n<\n";
    assertTrue(strictError(source).getMessage().contains("=path not found"));
    assertEquals(
        map("wrap", map("items", list(map("id", 1), map("id", 2)))), Parse.parse(source, true));
  }

  @Test
  void locatePathArraySuffixNeverStripsOntoAnObjectKey() {
    XaiopSyntaxError err =
        assertThrows(
            XaiopSyntaxError.class, () -> Parse.parse(LOCATE_BASE + "=meta-\nb:2\n", true));
    assertTrue(err.getMessage().contains("=path not found: meta-"));
  }

  @Test
  void locatePathArraySuffixOffFailsLikeStrict() {
    assertThrows(
        XaiopSyntaxError.class,
        () ->
            Parse.parse(
                ">\n>siblings-\n>\ni:1\n<\n.\n=siblings-\n>\ni:2\n<\n",
                allBut(CompatFixId.locatePathArraySuffix)));
  }

  // --- policy plumbing -------------------------------------------------------

  @Test
  void parseAcceptsACompatPolicyInstance() {
    CompatPolicy policy = new CompatPolicy();
    policy.set(CompatFixId.popAndRetry, false);
    assertThrows(XaiopSyntaxError.class, () -> Parse.parse(MISSING_LEAVE_ARRAY, policy));
    assertTrue(policy.resetToDefaults().get(CompatFixId.popAndRetry));
    assertEquals(
        map("tags", list("alpha", "beta"), "users", list(map("id", 1, "name", "alice"))),
        Parse.parse(MISSING_LEAVE_ARRAY, policy));
  }

  @Test
  void engineCompatibilityModeAppliesToUploads() {
    XaiopEngine engine = new XaiopEngine(true);
    assertEquals(map("y", 2), engine.getSync(engine.uploadSync(">\ny:2")));
    assertThrows(XaiopSyntaxError.class, () -> new XaiopEngine().uploadSync(MISSING_LEAVE_ARRAY));
  }

  @Test
  void unknownDataIdIsRejected() {
    IllegalArgumentException err =
        assertThrows(IllegalArgumentException.class, () -> new XaiopEngine().getSync("missing"));
    assertTrue(err.getMessage().contains("unknown data id"));
  }
}
