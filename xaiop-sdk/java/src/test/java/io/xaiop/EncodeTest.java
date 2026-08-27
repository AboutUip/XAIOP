package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EncodeTest {

  private static Map<String, Object> map(Object... keyValues) {
    LinkedHashMap<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) {
      m.put((String) keyValues[i], keyValues[i + 1]);
    }
    return m;
  }

  @Test
  void defaultPolicyPhasesEveryTopLevelKey() {
    String wire = Encode.encode(map("meta", map("name", "demo"), "tags", List.of("a", "b"), "n", 1));
    assertEquals(">\n>meta\nname:demo\n.\n>\n>tags-\n:a\n:b\n.\n>\nn:1\n", wire);
  }

  @Test
  void roundTripsThroughParse() {
    Map<String, Object> value = map("meta", map("name", "demo", "n", 2), "tags", List.of("a", "b"));
    assertEquals(value, Parse.parse(Encode.encode(value)));
  }

  @Test
  void singlePhaseKeepsOneDocument() {
    String wire =
        Encode.encode(
            map("meta", map("name", "demo"), "tags", java.util.Arrays.asList("a", 2, true, null)),
            EncodeOptions.singlePhase());
    assertEquals(">\n>meta\nname:demo\n<\n>tags-\n:a\n:2\n:true\n:null\n", wire);
  }

  @Test
  void arrayRootAndForcedStrings() {
    String wire =
        Encode.encode(List.of(1, "x", map("k", "true")), EncodeOptions.singlePhase());
    assertEquals("-\n:1\n:x\n>\nk: true\n", wire);
  }

  @Test
  void nullPolicyEncodesOrOmits() {
    Map<String, Object> value = map("a", null, "b", 1);
    assertEquals(">\na:null\nb:1\n", Encode.encode(value, EncodeOptions.singlePhase()));

    EncodeOptions omit =
        EncodeOptions.builder()
            .dotPolicy(DotPolicy.NONE)
            .nullPolicy(EncodeOptions.NullPolicy.OMIT)
            .build();
    assertEquals(">\nb:1\n", Encode.encode(value, omit));

    EncodeOptions error =
        EncodeOptions.builder()
            .dotPolicy(DotPolicy.NONE)
            .nullPolicy(EncodeOptions.NullPolicy.ERROR)
            .build();
    XaiopEncodeError err = assertThrows(XaiopEncodeError.class, () -> Encode.encode(value, error));
    assertEquals("null value not allowed", err.getMessage());
    assertEquals("$.a", err.getPath());
  }

  @Test
  void perNKeysAndSortedAndFinalDot() {
    assertEquals(
        ">\na:1\nb:2\n.\n>\nc:3\n",
        Encode.encode(
            map("a", 1, "b", 2, "c", 3),
            EncodeOptions.builder().dotPolicy(DotPolicy.PER_N_KEYS).phaseEvery(2).build()));

    assertEquals(
        ">\na:2\nb:1\n",
        Encode.encode(
            map("b", 1, "a", 2),
            EncodeOptions.builder()
                .dotPolicy(DotPolicy.NONE)
                .keyOrder(EncodeOptions.KeyOrder.SORTED)
                .build()));

    assertEquals(
        ">\na:1\n.\n",
        Encode.encode(
            map("a", 1),
            EncodeOptions.builder().dotPolicy(DotPolicy.NONE).finalDot(true).build()));

    assertEquals(">\n", Encode.encode(map(), EncodeOptions.singlePhase()));
  }

  @Test
  void pathCutsPhaseAtListedPaths() {
    String wire =
        Encode.encode(
            map("a", map("x", 1), "b", List.of(1, 2), "c", 3),
            EncodeOptions.builder().dotPolicyPaths(List.of("a", "b")).build());
    assertEquals(">\n>a\nx:1\n.\n>\n>b-\n:1\n:2\n.\n>\nc:3\n", wire);
    assertEquals(map("a", map("x", 1), "b", List.of(1, 2), "c", 3), Parse.parse(wire));
  }

  @Test
  void pathCutsRejectMissingPathsAndOptionMutex() {
    assertThrows(
        XaiopEncodeError.class,
        () ->
            Encode.encode(
                map("a", 1), EncodeOptions.builder().dotPolicyPaths(List.of("nope")).build()));

    XaiopEncodeError mutex =
        assertThrows(
            XaiopEncodeError.class,
            () ->
                Encode.encode(
                    map("a", 1),
                    EncodeOptions.builder().dotPolicyPaths(List.of("a")).phaseEvery(2).build()));
    assertTrue(mutex.getMessage().contains("mutually exclusive with phaseEvery"));
  }

  @Test
  void rejectedKeysThrow() {
    XaiopEncodeError spaced =
        assertThrows(XaiopEncodeError.class, () -> Encode.encode(map("bad key", 1)));
    assertEquals("invalid label name: \"bad key\"", spaced.getMessage());

    XaiopEncodeError trailingDash =
        assertThrows(XaiopEncodeError.class, () -> Encode.encode(map("a-", 1)));
    assertTrue(trailingDash.getMessage().startsWith("invalid label name (trailing \"-\""));

    assertThrows(XaiopEncodeError.class, () -> Encode.encode(map("a>b", 1)));
    assertThrows(XaiopEncodeError.class, () -> Encode.encode(map("a:b", 1)));
    assertEquals(
        map("a", "line\nbreak"), Parse.parse(Encode.encode(map("a", "line\nbreak"))));
    assertThrows(XaiopEncodeError.class, () -> Encode.encode(null));
  }

  @Test
  void jsonPathHelpersRoundTrip() {
    assertEquals(List.of("a", "b", 0, "c"), Encode.parseJsonPath("a.b[0].c"));
    assertEquals("a.b[0].c", Encode.formatJsonPath(Encode.parseJsonPath("a.b[0].c")));
    assertThrows(XaiopEncodeError.class, () -> Encode.parseJsonPath("[0].a"));
  }
}
