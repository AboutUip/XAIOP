package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.compat.CompatFixId;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EngineTest {

  private static Map<String, Object> map(Object... keyValues) {
    LinkedHashMap<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) {
      m.put((String) keyValues[i], keyValues[i + 1]);
    }
    return m;
  }

  @Test
  void uploadSyncThenGetSync() {
    XaiopEngine engine = new XaiopEngine();
    String id = engine.uploadSync(">\n>meta\nname:demo\n<\nn:1\n");

    assertTrue(engine.has(id));
    assertEquals(map("meta", map("name", "demo"), "n", 1), engine.getSync(id));

    String other = engine.uploadSync(">\na:1\n");
    assertNotEquals(id, other);

    assertTrue(engine.delete(id));
    assertFalse(engine.has(id));
    assertThrows(IllegalArgumentException.class, () -> engine.getSync(id));

    engine.clear();
    assertFalse(engine.has(other));
  }

  @Test
  void getSyncReturnsIndependentCopies() {
    XaiopEngine engine = new XaiopEngine();
    String id = engine.uploadSync(">\n>meta\nname:demo\n");

    @SuppressWarnings("unchecked")
    Map<String, Object> first = (Map<String, Object>) engine.getSync(id);
    @SuppressWarnings("unchecked")
    Map<String, Object> meta = (Map<String, Object>) first.get("meta");
    meta.put("name", "mutated");

    assertEquals(map("meta", map("name", "demo")), engine.getSync(id));
  }

  @Test
  void uploadJsonSyncRoundTrips() {
    XaiopEngine engine = new XaiopEngine();
    Map<String, Object> value = map("meta", map("name", "demo"), "n", 2);
    assertEquals(value, engine.getSync(engine.uploadJsonSync(value)));
    assertEquals(">\na:1\n", engine.encodeSync(map("a", 1), EncodeOptions.singlePhase()));
  }

  @Test
  void fragmentsSurviveGetSync() {
    XaiopEngine engine = new XaiopEngine();
    Object value = engine.getSync(engine.uploadSync(">meta\nname:demo\n"));
    assertInstanceOf(XaiopFragment.class, value);
    assertEquals("\"meta\":{\"name\":\"demo\"}", ((XaiopFragment) value).notation());
  }

  @Test
  void injectMergesIntoTheStore() {
    XaiopEngine engine = new XaiopEngine();
    String id = engine.uploadJsonSync(map("a", 1));

    assertEquals(map("a", 1, "b", 2), engine.injectXaiopSync(id, ">\nb:2\n"));
    assertEquals(map("a", 1, "b", 2), engine.getSync(id));

    assertEquals(
        map("a", 1, "b", 2),
        engine.injectJsonSync(id, map("a", 9), MergeOptions.of(MergeConflict.KEEP)));

    assertEquals(
        ">\na:9\nb:2\n",
        engine.injectJsonSync(
            id, map("a", 9), MergeOptions.builder().as(MergeOptions.As.XAIOP).build()));
  }

  @Test
  void engineMergeUsesItsCompatibilityMode() {
    // `>meta` while the Cursor is inside `tags` is illegal strictly; compatibility pops out.
    String slipped = ">\n>tags-\n:x\n>meta\nname:d\n";

    XaiopEngine strict = new XaiopEngine();
    assertThrows(XaiopSyntaxError.class, () -> strict.mergeToJsonSync(map("a", 1), slipped));

    XaiopEngine lenient = new XaiopEngine(true);
    assertEquals(
        map("a", 1, "tags", java.util.List.of("x"), "meta", map("name", "d")),
        lenient.mergeToJsonSync(map("a", 1), slipped));
    assertEquals(">\na:1\nb:2\n", lenient.mergeToXaiopSync(map("a", 1), ">\nb:2\n"));

    // A caller-pinned compat setting still wins over the engine's mode.
    assertThrows(
        XaiopSyntaxError.class,
        () ->
            lenient.mergeToJsonSync(
                map("a", 1), slipped, MergeOptions.builder().compat(false).build()));
  }

  @Test
  void compatibilityFixesToggleOnlyWhileModeIsOn() {
    XaiopEngine engine = new XaiopEngine();
    assertFalse(engine.compatibilityMode());
    assertFalse(engine.setCompatFix(CompatFixId.forcedRoot, false));
    assertTrue(engine.compatFix(CompatFixId.forcedRoot));

    engine.setCompatibilityMode(true);
    assertTrue(engine.setCompatFix(CompatFixId.forcedRoot, false));
    assertFalse(engine.compatFix(CompatFixId.forcedRoot));

    // forcedRoot off -> bare root content still parses as a fragment.
    assertInstanceOf(XaiopFragment.class, engine.getSync(engine.uploadSync("a:1\n")));
  }

  @Test
  void staticHelpers() {
    assertEquals(map("a", 1), XaiopEngine.parse(">\na:1\n"));
    assertEquals(map("a", 1), XaiopEngine.parse("a:1\n", true));
    assertEquals(">\na:1\n", XaiopEngine.encode(map("a", 1), EncodeOptions.singlePhase()));
    assertEquals(map("a", 1, "b", 2), XaiopEngine.mergeToJson(map("a", 1), ">\nb:2\n"));
    assertEquals(">\na:1\nb:2\n", XaiopEngine.mergeToXaiop(map("a", 1), ">\nb:2\n"));
  }
}
