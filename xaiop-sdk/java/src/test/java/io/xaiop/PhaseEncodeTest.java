package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.PhaseEncode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Port of Node {@code ws.phase-encode.test.js} (no network). */
class PhaseEncodeTest {

  private static Map<String, Object> map(Object... keyValues) {
    LinkedHashMap<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) {
      m.put((String) keyValues[i], keyValues[i + 1]);
    }
    return m;
  }

  @Test
  void nonFinalAppendsDotNewline() {
    String wire = PhaseEncode.encodePhaseJson("modA", map("x", 1));
    assertTrue(wire.endsWith(".\n"));
    assertFalse(wire.contains(".\n."));
    assertEquals(map("modA", map("x", 1)), Parse.parse(wire));
  }

  @Test
  void finalOmitsTrailingDot() {
    String wire =
        PhaseEncode.encodePhaseJson("modA", map("x", 1), PhaseEncode.Options.builder().finalPhase(true));
    assertFalse(wire.stripTrailing().endsWith("."));
    assertEquals(map("modA", map("x", 1)), Parse.parse(wire));
  }

  @Test
  void objectMultiKeySinglePhase() {
    String wire = PhaseEncode.encodePhaseObject(map("a", 1, "b", "2"));
    assertTrue(wire.endsWith(".\n"));
    assertEquals(map("a", 1, "b", "2"), Parse.parse(wire));
  }

  @Test
  void rejectsEmptyKeyAndNonObject() {
    IllegalArgumentException empty =
        assertThrows(IllegalArgumentException.class, () -> PhaseEncode.encodePhaseJson("", 1));
    assertTrue(empty.getMessage().contains("non-empty"));

    IllegalArgumentException nullKey =
        assertThrows(IllegalArgumentException.class, () -> PhaseEncode.encodePhaseJson(null, 1));
    assertTrue(nullKey.getMessage().contains("non-empty"));

    IllegalArgumentException nullObj =
        assertThrows(IllegalArgumentException.class, () -> PhaseEncode.encodePhaseObject(null));
    assertTrue(nullObj.getMessage().contains("plain object"));

    IllegalArgumentException arr =
        assertThrows(IllegalArgumentException.class, () -> PhaseEncode.encodePhaseObject(List.of(1)));
    assertTrue(arr.getMessage().contains("plain object"));

    // encodePhaseObject accepts plain Map only (not String / other non-map).
    IllegalArgumentException str =
        assertThrows(IllegalArgumentException.class, () -> PhaseEncode.encodePhaseObject("nope"));
    assertTrue(str.getMessage().contains("plain object"));
  }

  @Test
  void encodePhaseObjectFinalOmitsTrailingDot() {
    String wire =
        PhaseEncode.encodePhaseObject(
            map("a", 1, "b", 2), PhaseEncode.Options.builder().finalPhase(true));
    assertFalse(wire.stripTrailing().endsWith("."));
    assertEquals(map("a", 1, "b", 2), Parse.parse(wire));
  }

  @Test
  void hardenedKeyStillRejected() {
    assertThrows(XaiopEncodeError.class, () -> PhaseEncode.encodePhaseJson("bad-", 1));
  }

  @Test
  void concatenatingPhasesLaterWins() {
    String a = PhaseEncode.encodePhaseJson("s1", map("n", 1));
    String b = PhaseEncode.encodePhaseJson("s2", map("n", 2));
    String c =
        PhaseEncode.encodePhaseJson("s1", map("n", 9), PhaseEncode.Options.builder().finalPhase(true));
    assertEquals(map("s1", map("n", 9), "s2", map("n", 2)), Parse.parse(a + b + c));
  }

  @Test
  void encodeOptionsForceDotPolicyNone() {
    // Caller asks for per-top-level-key; phase encode must still emit a single phase body.
    String wire =
        PhaseEncode.encodePhaseObject(
            map("a", 1, "b", 2),
            PhaseEncode.Options.builder()
                .encodeOptions(
                    EncodeOptions.builder().dotPolicy(DotPolicy.PER_TOP_LEVEL_KEY).build())
                .finalPhase(true));
    assertFalse(wire.contains(".\n"));
    assertEquals(map("a", 1, "b", 2), Parse.parse(wire));
  }
}
