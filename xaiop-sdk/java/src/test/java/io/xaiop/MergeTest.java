package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MergeTest {

  private static Map<String, Object> map(Object... keyValues) {
    LinkedHashMap<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) {
      m.put((String) keyValues[i], keyValues[i + 1]);
    }
    return m;
  }

  @Test
  void overwriteRecursesObjectsAndReplacesConflicts() {
    Object merged =
        Merge.mergeJson(map("a", 1, "o", map("x", 1, "y", 2)), map("a", 9, "o", map("y", 8, "z", 7)));
    assertEquals(map("a", 9, "o", map("x", 1, "y", 8, "z", 7)), merged);
  }

  @Test
  void keepRetainsBaseOnConflictButStillAddsNewKeys() {
    Object merged =
        Merge.mergeJson(
            map("a", 1, "o", map("x", 1, "y", 2)),
            map("a", 9, "o", map("y", 8, "z", 7)),
            MergeConflict.KEEP);
    assertEquals(map("a", 1, "o", map("x", 1, "y", 2, "z", 7)), merged);
  }

  @Test
  void arraysAreAtomicAtTheirKey() {
    assertEquals(
        map("t", List.of(3)), Merge.mergeJson(map("t", List.of(1, 2)), map("t", List.of(3))));
    assertEquals(
        map("t", List.of(1, 2)),
        Merge.mergeJson(map("t", List.of(1, 2)), map("t", List.of(3)), MergeConflict.KEEP));
  }

  @Test
  void baseIsNotMutated() {
    Map<String, Object> base = map("o", map("x", 1));
    Merge.mergeJson(base, map("o", map("x", 9)));
    assertEquals(map("o", map("x", 1)), base);
  }

  @Test
  void mergeToJsonAppliesXaiopOverlay() {
    assertEquals(map("a", 1, "b", 2), Merge.mergeToJson(map("a", 1), ">\nb:2\n"));
    assertEquals(
        map("a", 1),
        Merge.mergeToJson(map("a", 1), ">\na:9\n", MergeOptions.of(MergeConflict.KEEP)));
  }

  @Test
  void mergeToXaiopEncodesSinglePhase() {
    assertEquals(">\na:1\nb:2\n", Merge.mergeToXaiop(map("a", 1), ">\nb:2\n"));
    assertEquals(">\na:9\n", Merge.mergeToXaiop(map("a", 1), ">\na:9\n"));
  }

  @Test
  void formatInjectResultHonoursAs() {
    assertEquals(map("a", 1), Merge.formatInjectResult(map("a", 1), MergeOptions.defaults()));
    assertEquals(
        ">\na:1\n",
        Merge.formatInjectResult(
            map("a", 1), MergeOptions.builder().as(MergeOptions.As.XAIOP).build()));
  }

  @Test
  void toMergeableJsonUnwrapsFragments() {
    Object fragment = Parse.parse(">meta\nname:demo\n");
    assertEquals(map("meta", map("name", "demo")), Merge.toMergeableJson(fragment));
  }
}
