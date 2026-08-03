package io.xaiop;

import static io.xaiop.Fixtures.list;
import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.Materialize;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * {@link Parse.LiveXaiopParser} is observationally equivalent to {@link Parse#parse(String)} over
 * the concatenation of what it was fed. Ported from the Node suite {@code live.parse.test.js}.
 */
class LiveParseTest {

  private static Object liveParse(String source) {
    return Materialize.materializeSnapshot(new Parse.LiveXaiopParser().feedText(source).value());
  }

  private static Object liveParse(String source, boolean compat) {
    return Materialize.materializeSnapshot(
        new Parse.LiveXaiopParser(compat).feedText(source).value());
  }

  private static Object oneShot(String source) {
    return Materialize.materializeSnapshot(Parse.parse(source));
  }

  private static final List<String> CORPUS =
      List.of(
          ">\n>left\n>test\nx:1\n.\n>right\n>test\ny:2\n.\n!test\nz:9\n.",
          ">\n>wrap\n>a\n>b\nx:1\n.\n=a>b\nz:3\n.",
          ">\n>a\n.\n@b>c\nn:1\n.",
          ">\nid:1\n.\n>\nid:2\n.",
          ">\n>items-\n:1\n:2\n.\n@items\n:3\n",
          "-\n:a\n:b\n",
          ">meta\nname:demo\n");

  @Test
  void matchesOneShotParseOnTheComplexFixture() {
    String source = Fixtures.complexWire();
    assertEquals(oneShot(source), liveParse(source));
    assertEquals(Fixtures.complexJson(), liveParse(source));
  }

  @Test
  void matchesOneShotParseAcrossTheLocateBroadcastCorpus() {
    for (String source : CORPUS) {
      assertEquals(oneShot(source), liveParse(source), "live ≠ one-shot for: " + source);
    }
  }

  @Test
  void feedLineMatchesFeedText() {
    String source = ">\n>a\nx:1\n.\n>b\ny:2\n";
    Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
    for (String line : source.replaceAll("\n$", "").split("\n", -1)) {
      live.feedLine(line);
    }
    assertEquals(liveParse(source), Materialize.materializeSnapshot(live.value()));
  }

  @Test
  void feedTextIsIncrementalAcrossCalls() {
    Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
    live.feedText(">\n>a\nx:1\n.\n");
    live.feedText(">b\ny:2\n");
    assertEquals(
        map("a", map("x", 1), "b", map("y", 2)), Materialize.materializeSnapshot(live.value()));
  }

  @Test
  void feedTextIgnoresEmptyInputAndRejectsNull() {
    Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
    live.feedText("");
    assertEquals(new LinkedHashMap<>(), Materialize.materializeSnapshot(live.value()));
    assertThrows(NullPointerException.class, () -> live.feedText(null));
  }

  @Test
  void compatibilityForcedRootMatchesOneShotParse() {
    String source = "id:1\nname:a\n";
    assertEquals(
        Materialize.materializeSnapshot(Parse.parse(source, true)), liveParse(source, true));
  }

  @Test
  void materializeSnapshotDetachesFromTheLiveTree() {
    Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
    live.feedText(">\n>a\nx:1\n");
    Object snapshot = Materialize.materializeSnapshot(live.value());
    assertNotSame(live.value(), snapshot, "snapshots must be independent of the live tree");
    live.feedText("y:2\n");
    assertEquals(map("a", map("x", 1)), snapshot, "an existing snapshot must not observe new feeds");
    assertEquals(map("a", map("x", 1, "y", 2)), Materialize.materializeSnapshot(live.value()));
  }

  // --- checkpoint parity ------------------------------------------------------

  @Test
  void checkpointCommitEqualsOneShotParseForPhasedEncode() {
    Map<String, Object> value =
        map(
            "meta", map("t", 1),
            "a", map("x", 1, "items", list(1, 2, 3)),
            "b", map("y", "z", "nested", map("k", true)));
    String wire = Encode.encode(value, EncodeOptions.defaults());

    DotCheckpointEngine engine = DotCheckpointEngine.Options.of(chunk -> {}).build();
    for (int i = 0; i < wire.length(); i += 7) {
      engine.push(wire.substring(i, Math.min(i + 7, wire.length())));
    }
    engine.finish();

    assertEquals(Parse.parse(wire), engine.committedSnapshot());
    assertEquals(Parse.parse(wire), engine.snapshot());
    assertEquals(value, engine.snapshot());
  }

  @Test
  void checkpointWithoutDiffStillCommitsTheWholeDocument() {
    Map<String, Object> value = map("a", map("x", 1), "b", map("y", 2), "c", map("z", 3));
    String wire = Encode.encode(value);

    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add).emitDiff(false).build();
    engine.push(wire);
    engine.finish();

    assertTrue(diffs.stream().allMatch(d -> d == null), "emitDiff(false) must only emit nulls");
    assertEquals(Parse.parse(wire), engine.committedSnapshot());
    assertEquals(Parse.parse(wire), engine.snapshot());
  }

  @Test
  void checkpointCommitEqualsOneShotParseWithManyPhases() {
    Map<String, Object> value = new LinkedHashMap<>();
    for (int i = 0; i < 20; i++) {
      value.put("k" + i, map("v", i, "s", "x" + i));
    }
    String wire =
        Encode.encode(
            value,
            EncodeOptions.builder().dotPolicy(DotPolicy.PER_N_KEYS).phaseEvery(1).build());

    DotCheckpointEngine engine = DotCheckpointEngine.Options.of(chunk -> {}).build();
    engine.push(wire);
    engine.finish();

    assertEquals(Parse.parse(wire), engine.committedSnapshot());
  }
}
