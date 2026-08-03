package io.xaiop;

import static io.xaiop.Fixtures.list;
import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Merge / inject semantics: conflicts are per-key, containers are cloned, and the free, static
 * and instance entry points agree. Ported from the Node suite {@code merge.test.js}.
 */
class MergeRobustTest {

  private static final EncodeOptions NONE = EncodeOptions.singlePhase();

  @Test
  void nonConflictingKeysUnion() {
    assertEquals(map("a", 1, "b", 2), Merge.mergeJson(map("a", 1), map("b", 2)));
  }

  @Test
  void conflictingKeysFollowThePolicy() {
    assertEquals(
        map("a", 9, "b", 2),
        Merge.mergeJson(map("a", 1, "b", 2), map("a", 9), MergeConflict.OVERWRITE));
    assertEquals(
        map("a", 1, "b", 2), Merge.mergeJson(map("a", 1, "b", 2), map("a", 9), MergeConflict.KEEP));
  }

  @Test
  void objectsRecurseWhileArraysAndScalarsConflictWhole() {
    Map<String, Object> base = map("meta", map("name", "x", "n", 1), "tags", list("a"));
    Map<String, Object> overlay = map("meta", map("n", 2, "extra", true), "tags", list("b"));

    assertEquals(
        map("meta", map("name", "x", "n", 2, "extra", true), "tags", list("b")),
        Merge.mergeJson(base, overlay, MergeConflict.OVERWRITE));
    assertEquals(
        map("meta", map("name", "x", "n", 1, "extra", true), "tags", list("a")),
        Merge.mergeJson(base, overlay, MergeConflict.KEEP));
  }

  @Test
  void aTypeMismatchAtAKeyIsAnAtomicConflict() {
    assertEquals(
        map("a", 9), Merge.mergeJson(map("a", map("x", 1)), map("a", 9), MergeConflict.OVERWRITE));
    assertEquals(
        map("a", map("x", 1)),
        Merge.mergeJson(map("a", map("x", 1)), map("a", 9), MergeConflict.KEEP));
    assertEquals(
        map("a", map("x", 1)),
        Merge.mergeJson(map("a", list(1)), map("a", map("x", 1)), MergeConflict.OVERWRITE),
        "array → object replaces wholesale");
  }

  @Test
  void neitherInputIsMutatedAndTheResultIsIsolated() {
    Map<String, Object> base = map("a", map("x", 1));
    Map<String, Object> overlay = map("a", map("y", 2));
    Object out = Merge.mergeJson(base, overlay);

    assertEquals(map("a", map("x", 1, "y", 2)), out);
    assertEquals(map("a", map("x", 1)), base, "base untouched");
    assertEquals(map("a", map("y", 2)), overlay, "overlay untouched");

    @SuppressWarnings("unchecked")
    Map<String, Object> nested = (Map<String, Object>) ((Map<?, ?>) out).get("a");
    nested.put("z", 3);
    assertEquals(map("a", map("x", 1)), base, "mutating the result must not reach the base");
    assertEquals(map("a", map("y", 2)), overlay, "mutating the result must not reach the overlay");
  }

  @Test
  void aMissingKeyTakesTheOverlaySubtreeByValueNotByReference() {
    Map<String, Object> overlay = map("fresh", map("deep", list(1)));
    Object out = Merge.mergeJson(map("a", 1), overlay);

    @SuppressWarnings("unchecked")
    Map<String, Object> fresh = (Map<String, Object>) ((Map<?, ?>) out).get("fresh");
    fresh.put("added", true);
    assertEquals(map("fresh", map("deep", list(1))), overlay, "overlay subtrees are cloned in");
  }

  @Test
  void aNullConflictPolicyIsRejected() {
    assertThrows(
        IllegalArgumentException.class, () -> Merge.mergeJson(map("a", 1), map("a", 2), null));
    assertThrows(IllegalArgumentException.class, () -> MergeOptions.builder().conflict(null));
    assertThrows(IllegalArgumentException.class, () -> MergeOptions.builder().as(null));
  }

  // --- XAIOP overlays ---------------------------------------------------------

  @Test
  void mergeToJsonAppliesAnXaiopOverlayUnderBothPolicies() {
    String wire = Encode.encode(map("b", 2, "a", 9), NONE);
    assertEquals(
        map("a", 9, "c", 3, "b", 2),
        Merge.mergeToJson(map("a", 1, "c", 3), wire, MergeOptions.of(MergeConflict.OVERWRITE)));
    assertEquals(
        map("a", 1, "c", 3, "b", 2),
        Merge.mergeToJson(map("a", 1, "c", 3), wire, MergeOptions.of(MergeConflict.KEEP)));
  }

  @Test
  void mergeToJsonRejectsANullSource() {
    assertThrows(NullPointerException.class, () -> Merge.mergeToJson(map("a", 1), null));
  }

  @Test
  void mergeToXaiopReturnsRoundTrippableWire() {
    String out = Merge.mergeToXaiop(map("a", 1), ">\nb:2\n", MergeOptions.of(MergeConflict.OVERWRITE));
    assertEquals(map("a", 1, "b", 2), Parse.parse(out));
    assertEquals(0, out.chars().filter(c -> c == '.').count(), "single phase by default: " + out);
  }

  @Test
  void mergeToXaiopHonoursCustomEncodeOptions() {
    String out =
        Merge.mergeToXaiop(
            map("a", 1),
            ">\nb:2\n",
            MergeOptions.builder().encodeOptions(EncodeOptions.defaults()).build());
    assertEquals(">\na:1\n.\n>\nb:2\n", out, "perTopLevelKey phases the merged document");
  }

  @Test
  void freeStaticAndInstanceMergeToJsonAgree() {
    Map<String, Object> base = map("a", 1);
    String wire = Encode.encode(map("b", 2), NONE);
    XaiopEngine engine = new XaiopEngine();

    Object free = Merge.mergeToJson(base, wire);
    assertEquals(free, XaiopEngine.mergeToJson(base, wire));
    assertEquals(free, engine.mergeToJsonSync(base, wire));
    assertEquals(free, Xaiop.mergeToJson(base, wire));
    assertEquals(map("a", 1, "b", 2), free);
  }

  @Test
  void freeStaticAndInstanceMergeToXaiopAgree() {
    Map<String, Object> base = map("a", 1);
    String wire = Encode.encode(map("b", 2), NONE);
    XaiopEngine engine = new XaiopEngine();

    String free = Merge.mergeToXaiop(base, wire);
    assertEquals(free, XaiopEngine.mergeToXaiop(base, wire));
    assertEquals(free, engine.mergeToXaiopSync(base, wire));
    assertEquals(free, Xaiop.mergeToXaiop(base, wire));
    assertEquals(map("a", 1, "b", 2), Parse.parse(free));
  }

  @Test
  void freeAndFacadeMergeJsonAgree() {
    assertEquals(
        Merge.mergeJson(map("a", 1), map("b", 2)), Xaiop.mergeJson(map("a", 1), map("b", 2)));
    assertEquals(
        Merge.mergeJson(map("a", 1), map("a", 2), MergeConflict.KEEP),
        Xaiop.mergeJson(map("a", 1), map("a", 2), MergeConflict.KEEP));
  }

  // --- inject -----------------------------------------------------------------

  @Test
  void injectXaiopMutatesTheStoreAndCanReturnWire() {
    XaiopEngine engine = new XaiopEngine();
    String id = engine.uploadJsonSync(map("a", 1, "nested", map("x", 1)), NONE);

    Object json = engine.injectXaiopSync(id, Encode.encode(map("nested", map("y", 2), "b", 3), NONE));
    assertEquals(map("a", 1, "nested", map("x", 1, "y", 2), "b", 3), json);
    assertEquals(json, engine.getSync(id));

    Object wireOut =
        engine.injectXaiopSync(
            id,
            Encode.encode(map("c", 4), NONE),
            MergeOptions.builder().as(MergeOptions.As.XAIOP).build());
    assertInstanceOf(String.class, wireOut);
    assertEquals(
        map("a", 1, "nested", map("x", 1, "y", 2), "b", 3, "c", 4), Parse.parse((String) wireOut));
    assertEquals(Parse.parse((String) wireOut), engine.getSync(id));
  }

  @Test
  void injectJsonHonoursTheKeepPolicy() {
    XaiopEngine engine = new XaiopEngine();
    String id = engine.uploadJsonSync(map("a", 1, "b", 2), NONE);
    engine.injectJsonSync(id, map("a", 9, "c", 3), MergeOptions.of(MergeConflict.KEEP));
    assertEquals(map("a", 1, "b", 2, "c", 3), engine.getSync(id));
  }

  @Test
  void injectIntoAStoredFragmentMaterializesThenMerges() {
    XaiopEngine engine = new XaiopEngine();
    String id = engine.uploadSync("a:1\n");
    assertInstanceOf(XaiopFragment.class, engine.getSync(id), "a bare content root stores a fragment");

    assertEquals(map("a", 1, "b", 2), engine.injectJsonSync(id, map("b", 2)));
    assertEquals(map("a", 1, "b", 2), engine.getSync(id), "the store now holds a plain tree");
  }

  @Test
  void injectRejectsAnUnknownDataId() {
    XaiopEngine engine = new XaiopEngine();
    assertTrue(
        assertThrows(IllegalArgumentException.class, () -> engine.injectJsonSync("missing", map("a", 1)))
            .getMessage()
            .contains("unknown data id"));
    assertTrue(
        assertThrows(
                IllegalArgumentException.class, () -> engine.injectXaiopSync("missing", ">\na:1\n"))
            .getMessage()
            .contains("unknown data id"));
  }

  @Test
  void formatInjectResultShapesTheReturnValue() {
    assertEquals(map("a", 1), Merge.formatInjectResult(map("a", 1), MergeOptions.defaults()));
    assertEquals(
        ">\na:1\n",
        Merge.formatInjectResult(map("a", 1), MergeOptions.builder().as(MergeOptions.As.XAIOP).build()));
  }

  @Test
  void toMergeableJsonUnwrapsFragmentsAndClonesTrees() {
    Object fragment = Parse.parse(">meta\nname:demo\n");
    assertEquals(map("meta", map("name", "demo")), Merge.toMergeableJson(fragment));

    Map<String, Object> tree = map("a", map("x", 1));
    Object cloned = Merge.toMergeableJson(tree);
    assertEquals(tree, cloned);
    @SuppressWarnings("unchecked")
    Map<String, Object> nested = (Map<String, Object>) ((Map<?, ?>) cloned).get("a");
    nested.put("y", 2);
    assertEquals(map("a", map("x", 1)), tree, "toMergeableJson must clone");
  }

  // --- engine compatibility interaction --------------------------------------

  @Test
  void engineCompatibilityAppliesToMergeUnlessTheCallerPinsIt() {
    String slipped = ">\n>tags-\n:x\n>meta\nname:d\n";
    assertThrows(
        XaiopSyntaxError.class, () -> new XaiopEngine().mergeToJsonSync(map("a", 1), slipped));

    XaiopEngine lenient = new XaiopEngine(true);
    assertEquals(
        map("a", 1, "tags", list("x"), "meta", map("name", "d")),
        lenient.mergeToJsonSync(map("a", 1), slipped));
    assertThrows(
        XaiopSyntaxError.class,
        () ->
            lenient.mergeToJsonSync(
                map("a", 1), slipped, MergeOptions.builder().compat(false).build()));
  }

  @Test
  void injectUsesTheEngineCompatibilityMode() {
    XaiopEngine lenient = new XaiopEngine(true);
    String id = lenient.uploadJsonSync(map("a", 1), NONE);
    assertEquals(
        map("a", 1, "tags", list("x"), "meta", map("name", "d")),
        lenient.injectXaiopSync(id, ">\n>tags-\n:x\n>meta\nname:d\n"));
  }
}
