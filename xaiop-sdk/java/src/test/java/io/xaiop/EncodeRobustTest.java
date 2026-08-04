package io.xaiop;

import static io.xaiop.Fixtures.assertTree;
import static io.xaiop.Fixtures.list;
import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

/**
 * Encoder hardening: option matrix, rejection surface, number/string tokens and round-trip
 * stability. Ported from the Node suites {@code encode.test.js} and
 * {@code encode.stability.test.js}.
 */
class EncodeRobustTest {

  private static final EncodeOptions NONE = EncodeOptions.singlePhase();

  /** The option matrix the Node stability suite sweeps. */
  private static final Map<String, EncodeOptions> POLICIES =
      Map.of(
          "none", NONE,
          "perTopLevelKey", EncodeOptions.defaults(),
          "perNKeys(2)",
              EncodeOptions.builder().dotPolicy(DotPolicy.PER_N_KEYS).phaseEvery(2).build(),
          "perNKeys(3)/maxPhases(5)",
              EncodeOptions.builder()
                  .dotPolicy(DotPolicy.PER_N_KEYS)
                  .phaseEvery(3)
                  .maxPhases(5)
                  .build(),
          "custom(keysInPhase>=2)",
              EncodeOptions.builder()
                  .dotPolicy(DotPolicy.CUSTOM)
                  .shouldPhase(ctx -> ctx.keysInPhase() >= 2)
                  .build());

  private static Object roundTrip(Object value, EncodeOptions options) {
    return Parse.parse(Encode.encode(value, options));
  }

  private static int countDotLines(String wire) {
    int dots = 0;
    for (String line : wire.split("\r?\n", -1)) {
      if (line.equals(".")) dots++;
    }
    return dots;
  }

  private static XaiopEncodeError encodeError(Supplier<String> call) {
    return assertThrows(XaiopEncodeError.class, call::get);
  }

  // --- scalars / typing -------------------------------------------------------

  @Test
  void roundTripsIntsFloatsBoolsAndStrings() {
    Map<String, Object> value =
        map(
            "i", 0, "j", -7, "f", 1.5, "g", -2.25, "h", 1000,
            "t", true, "f2", false, "s", "hello", "empty", "");
    assertEquals(value, roundTrip(value, NONE));
    assertTrue(roundTrip(value, NONE) instanceof Map, "object root stays an object");
  }

  @Test
  void numericAndBooleanLookingStringsAreForced() {
    Map<String, Object> value =
        map(
            "a", "5", "b", "1.5", "c", "1e3", "d", "true", "e", "false",
            "i", "null", "f", "-2.5E-2", "g", ".5", "h", "5.");
    String wire = Encode.encode(value, NONE);

    assertTrue(wire.contains("a: 5"), wire);
    assertTrue(wire.contains("b: 1.5"), wire);
    assertTrue(wire.contains("d: true"), wire);
    assertTrue(wire.contains("i: null"), wire);
    assertEquals(value, Parse.parse(wire), "every forced string must survive the round trip");
  }

  @Test
  void plainStringsThatAreNotTypedTokensStayUnforced() {
    Map<String, Object> value = map("s", "hi", "t", "1e3x", "u", "NaN");
    String wire = Encode.encode(value, NONE);
    assertTrue(wire.contains("\ns:hi\n"), wire);
    assertTrue(wire.contains("\nt:1e3x\n"), wire);
    assertTrue(wire.contains("\nu:NaN\n"), wire);
    assertEquals(value, Parse.parse(wire));
  }

  @Test
  void nonFiniteNumbersAreRejected() {
    for (Object bad : list(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY,
        Float.NaN, Float.POSITIVE_INFINITY)) {
      XaiopEncodeError err = encodeError(() -> Encode.encode(map("a", bad)));
      assertTrue(err.getMessage().contains("non-finite"), bad + " → " + err.getMessage());
    }
  }

  @Test
  void crlfInStringValuesIsRejected() {
    assertTrue(encodeError(() -> Encode.encode(map("a", "x\ny"))).getMessage().contains("CR/LF"));
    assertTrue(encodeError(() -> Encode.encode(map("a", "x\ry"))).getMessage().contains("CR/LF"));
    assertTrue(
        encodeError(() -> Encode.encode(map("a", list("x\ny")))).getMessage().contains("CR/LF"),
        "array elements are checked too");
  }

  @Test
  void leadingSpaceInStringValuesIsRejected() {
    XaiopEncodeError err = encodeError(() -> Encode.encode(map("s", "  spaced")));
    assertTrue(err.getMessage().contains("U+0020 SPACE"), err.getMessage());
    assertEquals("$.s", err.getPath());
    assertTrue(encodeError(() -> Encode.encode(map("s", " "))).getMessage().contains("U+0020"));
    assertTrue(encodeError(() -> Encode.encode(map("s", "   42"))).getMessage().contains("U+0020"));
    assertTrue(
        encodeError(() -> Encode.encode(list("  x"))).getMessage().contains("U+0020"),
        "array elements are checked too");
    assertEquals(map("s", "\tspaced"), Parse.parse(Encode.encode(map("s", "\tspaced"))));
    assertEquals(map("s", "spaced  "), Parse.parse(Encode.encode(map("s", "spaced  "))));
    assertEquals(map("s", ""), Parse.parse(Encode.encode(map("s", ""))));
  }

  @Test
  void invalidKeysAreRejected() {
    assertTrue(encodeError(() -> Encode.encode(map("", 1))).getMessage().contains("non-empty"));
    assertTrue(
        encodeError(() -> Encode.encode(map("a b", 1))).getMessage().contains("invalid label"));
    assertTrue(
        encodeError(() -> Encode.encode(map("a:b", 1))).getMessage().contains("invalid label"));
    assertTrue(encodeError(() -> Encode.encode(map("foo-", 1))).getMessage().contains("trailing"));
    for (String key : List.of("a>b", "<x", "=p", "!n")) {
      assertTrue(
          encodeError(() -> Encode.encode(map(key, 1))).getMessage().contains("operator"),
          "key " + key + " must be rejected as an operator");
    }
  }

  @Test
  void unsupportedValueTypesAreRejected() {
    for (Object bad : List.of(Instant.now(), new HashSet<>(List.of(1)), new Object())) {
      assertTrue(
          encodeError(() -> Encode.encode(map("a", bad))).getMessage().contains("unsupported"),
          bad.getClass() + " must be rejected");
    }
    assertTrue(
        encodeError(() -> Encode.encode(map("a", list(new Object()))))
            .getMessage()
            .contains("unsupported array element"));
  }

  @Test
  void nullValuesFollowTheirPolicy() {
    assertEquals(map("a", 1, "b", null), roundTrip(map("a", 1, "b", null), NONE));
    assertEquals(map("a", list(1, null, 2)), roundTrip(map("a", list(1, null, 2)), NONE));
    assertEquals(list(null, true), roundTrip(list(null, true), EncodeOptions.defaults()));

    EncodeOptions omit =
        EncodeOptions.builder()
            .dotPolicy(DotPolicy.NONE)
            .nullPolicy(EncodeOptions.NullPolicy.OMIT)
            .build();
    assertEquals(map("a", 1, "c", 2), roundTrip(map("a", 1, "b", null, "c", 2), omit));
    assertEquals(
        map("a", list((Object) null)),
        roundTrip(map("a", list((Object) null)), omit),
        "arrays keep typed nulls so indices do not shift");

    EncodeOptions error =
        EncodeOptions.builder()
            .dotPolicy(DotPolicy.NONE)
            .nullPolicy(EncodeOptions.NullPolicy.ERROR)
            .build();
    assertEquals("$.a", encodeError(() -> Encode.encode(map("a", null), error)).getPath());
    assertEquals(
        "$.a[0]", encodeError(() -> Encode.encode(map("a", list((Object) null)), error)).getPath());
  }

  @Test
  void nullDocumentRootIsRejected() {
    assertTrue(encodeError(() -> Encode.encode(null)).getMessage().contains("null"));
  }

  // --- structures -------------------------------------------------------------

  @Test
  void emptyContainersRoundTripAtEveryLevel() {
    assertEquals(map(), roundTrip(map(), NONE));
    assertEquals(list(), roundTrip(list(), EncodeOptions.builder().root(EncodeOptions.Root.ARRAY).build()));
    Map<String, Object> nested =
        map("o", map(), "a", list(), "nest", map("emptyObj", map(), "emptyArr", list(), "mid", map("again", list())));
    assertEquals(nested, roundTrip(nested, NONE));
    assertEquals(nested, roundTrip(nested, EncodeOptions.defaults()));
  }

  @Test
  void nestedObjectsAndMixedArraysRoundTrip() {
    Map<String, Object> value =
        map(
            "meta", map("name", "x", "n", 1),
            "items", list(map("id", 1, "ok", true), "plain", 3, false, list("x", "y"), map("a", "solo")));
    assertEquals(value, roundTrip(value, NONE));
    assertEquals(value, roundTrip(value, EncodeOptions.defaults()));
  }

  @Test
  void deepObjectAndArrayNestingRoundTrip() {
    Map<String, Object> deep =
        map("a", map("b", map("c", map("d", map("e", list(1, map("z", true)))))));
    assertEquals(deep, roundTrip(deep, NONE));

    Map<String, Object> tree = map("tree", list(list(list(list(list("leaf"), 1), true), map("k", "v"))));
    assertEquals(tree, roundTrip(tree, NONE));
  }

  @Test
  void arrayDocumentRootsAndRootOptionMismatches() {
    List<Object> value = list(map("a", 1), "z", 2, true, list("n"));
    assertEquals(value, roundTrip(value, EncodeOptions.defaults()));
    assertEquals(
        value, roundTrip(value, EncodeOptions.builder().root(EncodeOptions.Root.ARRAY).build()));

    assertTrue(
        encodeError(
                () ->
                    Encode.encode(
                        map("a", 1), EncodeOptions.builder().root(EncodeOptions.Root.ARRAY).build()))
            .getMessage()
            .contains("array"));
    assertTrue(
        encodeError(
                () ->
                    Encode.encode(
                        list(1), EncodeOptions.builder().root(EncodeOptions.Root.OBJECT).build()))
            .getMessage()
            .contains("plain object"));
  }

  @Test
  void arrayRootIgnoresObjectDotPolicies() {
    List<Object> value = list(1, map("a", 2), list("b"));
    String wire = Encode.encode(value, EncodeOptions.defaults());
    assertEquals(0, countDotLines(wire), "an array root has no top-level keys to phase");
    assertTrue(wire.startsWith("-\n"), wire);
    assertEquals(value, Parse.parse(wire));
  }

  @Test
  void aSiblingAfterANamedArrayStaysOnTheParentObject() {
    Map<String, Object> value = map("tags", list("a", "b"), "n", 1);
    assertEquals(value, roundTrip(value, NONE));
    assertEquals(value, roundTrip(value, EncodeOptions.defaults()));
  }

  @Test
  void aNamedArrayStaysInsideOnePhase() {
    Map<String, Object> value = map("items", list(map("id", 1), map("id", 2)), "other", 9);
    String wire = Encode.encode(value, EncodeOptions.defaults());
    String[] phases = wire.split("\n\\.\n");
    assertEquals(2, phases.length, wire);
    assertTrue(phases[0].contains("items-"), phases[0]);
    assertFalse(phases[1].contains("items-"), phases[1]);
    assertEquals(value, Parse.parse(wire));
  }

  @Test
  void handWrittenWireMayReopenAnArrayKeyAcrossPhases() {
    assertEquals(
        map("items", list(map("id", 1), map("id", 2))),
        Parse.parse(">\n>items-\n>\nid:1\n<\n.\n>\n>items-\n>\nid:2\n<\n"));
  }

  // --- dot policies -----------------------------------------------------------

  @Test
  void defaultPolicyIsOnePhasePerTopLevelKey() {
    String wire = Encode.encode(map("a", 1, "b", 2, "c", 3));
    assertEquals(2, countDotLines(wire));
    assertEquals(map("a", 1, "b", 2, "c", 3), Parse.parse(wire));
  }

  @Test
  void nonePolicyEmitsNoPhaseDots() {
    String wire = Encode.encode(map("a", 1, "b", 2), NONE);
    assertEquals(0, countDotLines(wire));
    assertTrue(wire.startsWith(">\n"), wire);
  }

  @Test
  void perNKeysGroupsTopLevelKeys() {
    String wire =
        Encode.encode(
            map("a", 1, "b", 2, "c", 3, "d", 4, "e", 5),
            EncodeOptions.builder().dotPolicy(DotPolicy.PER_N_KEYS).phaseEvery(2).build());
    assertEquals(2, countDotLines(wire), "[a,b] [c,d] [e]");
    assertEquals(map("a", 1, "b", 2, "c", 3, "d", 4, "e", 5), Parse.parse(wire));
  }

  @Test
  void maxPhasesMergesTheTail() {
    String wire =
        Encode.encode(
            map("a", 1, "b", 2, "c", 3, "d", 4),
            EncodeOptions.builder()
                .dotPolicy(DotPolicy.PER_TOP_LEVEL_KEY)
                .maxPhases(2)
                .build());
    assertEquals(1, countDotLines(wire), "three dots collapse to one under maxPhases=2");
    assertEquals(map("a", 1, "b", 2, "c", 3, "d", 4), Parse.parse(wire));
  }

  @Test
  void maxPhasesCapsALargeKeySet() {
    Map<String, Object> value = new LinkedHashMap<>();
    for (int i = 0; i < 20; i++) value.put("k" + i, i);
    String wire =
        Encode.encode(
            value,
            EncodeOptions.builder()
                .dotPolicy(DotPolicy.PER_N_KEYS)
                .phaseEvery(3)
                .maxPhases(4)
                .build());
    assertTrue(countDotLines(wire) <= 3, "dots: " + countDotLines(wire));
    assertEquals(value, Parse.parse(wire));
  }

  @Test
  void customShouldPhaseDecidesEachBoundary() {
    String wire =
        Encode.encode(
            map("a", 1, "b", 2, "c", 3, "d", 4),
            EncodeOptions.builder()
                .dotPolicy(DotPolicy.CUSTOM)
                .shouldPhase(ctx -> ctx.key().equals("b") || ctx.key().equals("c"))
                .build());
    assertEquals(2, countDotLines(wire), "cuts after b and c → [a,b] [c] [d]");
    assertEquals(map("a", 1, "b", 2, "c", 3, "d", 4), Parse.parse(wire));
  }

  @Test
  void customShouldPhaseSeesTheFullPhaseContext() {
    List<String> seen = new ArrayList<>();
    Encode.encode(
        map("a", 1, "b", 2, "c", 3),
        EncodeOptions.builder()
            .dotPolicy(DotPolicy.CUSTOM)
            .shouldPhase(
                ctx -> {
                  seen.add(
                      ctx.key()
                          + "/"
                          + ctx.index()
                          + "/"
                          + ctx.total()
                          + "/"
                          + ctx.keysInPhase()
                          + "/"
                          + ctx.phaseIndex());
                  return ctx.keysInPhase() >= 2;
                })
            .build());
    assertEquals(List.of("a/0/3/1/0", "b/1/3/2/0"), seen, "the last key is never asked");
  }

  @Test
  void customWithoutShouldPhaseIsRejected() {
    assertTrue(
        encodeError(
                () ->
                    Encode.encode(
                        map("a", 1),
                        EncodeOptions.builder().dotPolicy(DotPolicy.CUSTOM).build()))
            .getMessage()
            .contains("shouldPhase"));
  }

  @Test
  void finalDotAppendsATrailingPhaseMarkerWithoutChangingTheValue() {
    Map<String, Object> value = map("a", 1, "b", 2);
    String withDot =
        Encode.encode(value, EncodeOptions.builder().finalDot(true).build());
    assertTrue(withDot.stripTrailing().endsWith("."), withDot);
    assertEquals(value, Parse.parse(withDot));
    assertEquals(value, Parse.parse(Encode.encode(value)));
  }

  @Test
  void sortedKeyOrderIsStableAcrossCalls() {
    Map<String, Object> value = map("z", 1, "m", 2, "a", 3);
    EncodeOptions sorted =
        EncodeOptions.builder()
            .dotPolicy(DotPolicy.NONE)
            .keyOrder(EncodeOptions.KeyOrder.SORTED)
            .build();
    String a = Encode.encode(value, sorted);
    assertEquals(a, Encode.encode(value, sorted));
    assertTrue(a.indexOf("a:3") < a.indexOf("m:2"), a);
    assertTrue(a.indexOf("m:2") < a.indexOf("z:1"), a);
  }

  @Test
  void invalidOptionsAreRejected() {
    assertThrows(
        XaiopEncodeError.class, () -> EncodeOptions.builder().dotPolicy("nope").build());
    assertTrue(
        encodeError(() -> Encode.encode(map("a", 1), EncodeOptions.builder().phaseEvery(0).build()))
            .getMessage()
            .contains("phaseEvery"));
    assertTrue(
        encodeError(() -> Encode.encode(map("a", 1), EncodeOptions.builder().maxPhases(0).build()))
            .getMessage()
            .contains("maxPhases"));
    assertThrows(XaiopEncodeError.class, () -> EncodeOptions.builder().style(null).build());
    assertThrows(XaiopEncodeError.class, () -> EncodeOptions.builder().root(null).build());
  }

  @Test
  void styleRelativeAgreesWithResetForSinglePhaseDocuments() {
    Map<String, Object> value = map("a", 1, "b", map("c", 2), "d", list(3));
    String relative =
        Encode.encode(
            value,
            EncodeOptions.builder()
                .dotPolicy(DotPolicy.NONE)
                .style(EncodeOptions.Style.RELATIVE)
                .build());
    String reset = Encode.encode(value, NONE);

    assertEquals(value, Parse.parse(relative));
    assertEquals(value, Parse.parse(reset));
    assertEquals(0, countDotLines(relative));
    assertEquals(0, countDotLines(reset));
    assertEquals(reset, relative, "a single-phase document has no resets to skip");
  }

  @Test
  void styleRelativeIsIgnoredOncePhasingIsRequested() {
    Map<String, Object> value = map("a", 1, "b", 2);
    assertEquals(
        Encode.encode(value, EncodeOptions.defaults()),
        Encode.encode(
            value, EncodeOptions.builder().style(EncodeOptions.Style.RELATIVE).build()),
        "relative only short-circuits dotPolicy:none; phases always reset the Cursor");
  }

  // --- path-array dot policy --------------------------------------------------

  @Test
  void pathArrayCutsAfterANestedObjectKey() {
    Map<String, Object> value = map("a", map("x", 1, "y", 2), "b", 3);
    String wire = Encode.encode(value, EncodeOptions.builder().dotPolicyPaths(List.of("a.x")).build());
    assertEquals(1, countDotLines(wire));
    assertTrue(wire.contains("\nx:1\n.\n"), wire);
    assertEquals(value, Parse.parse(wire));
  }

  @Test
  void pathArrayCutsAtAnArrayElementIndex() {
    Map<String, Object> value =
        map(
            "data",
            map(
                "childs", list(map("id", 0), map("id", 1), map("id", 2), map("id", 3)),
                "meta", true));
    String wire =
        Encode.encode(value, EncodeOptions.builder().dotPolicyPaths(List.of("data.childs[2]")).build());
    assertEquals(1, countDotLines(wire));
    String[] phases = wire.split("\n\\.\n");
    assertEquals(2, phases.length, wire);
    assertTrue(phases[1].contains(">childs-"), "the array reopens after the cut: " + phases[1]);
    assertEquals(value, Parse.parse(wire));
  }

  @Test
  void pathArrayCutsAtSeveralFlatArrayIndexes() {
    Map<String, Object> value = map("items", list(1, 2, 3, 4), "z", true);
    assertEquals(
        value,
        roundTrip(
            value, EncodeOptions.builder().dotPolicyPaths(List.of("items[1]", "items[2]")).build()));
  }

  @Test
  void pathArrayRejectsMissingPaths() {
    assertTrue(
        encodeError(
                () ->
                    Encode.encode(
                        map("a", 1), EncodeOptions.builder().dotPolicyPaths(List.of("nope")).build()))
            .getMessage()
            .contains("not found"));
  }

  @Test
  void pathArrayIsMutuallyExclusiveWithTheOtherPhaseKnobs() {
    List<EncodeOptions> conflicting =
        List.of(
            EncodeOptions.builder().dotPolicyPaths(List.of("a")).phaseEvery(2).build(),
            EncodeOptions.builder().dotPolicyPaths(List.of("a")).maxPhases(2).build(),
            EncodeOptions.builder().dotPolicyPaths(List.of("a")).shouldPhase(ctx -> true).build());
    for (EncodeOptions options : conflicting) {
      assertTrue(
          encodeError(() -> Encode.encode(map("a", 1), options))
              .getMessage()
              .contains("mutually exclusive"));
    }
  }

  @Test
  void pathArrayRequiresResetStyle() {
    assertTrue(
        encodeError(
                () ->
                    Encode.encode(
                        map("a", 1),
                        EncodeOptions.builder()
                            .dotPolicyPaths(List.of("a"))
                            .style(EncodeOptions.Style.RELATIVE)
                            .build()))
            .getMessage()
            .contains("style:'reset'"));
  }

  @Test
  void pathArrayRejectsCutsInsideAnArrayElementObject() {
    assertTrue(
        encodeError(
                () ->
                    Encode.encode(
                        map("items", list(map("id", 1))),
                        EncodeOptions.builder().dotPolicyPaths(List.of("items[0].id")).build()))
            .getMessage()
            .contains("index must be final"));
  }

  @Test
  void pathArrayRejectsDuplicates() {
    assertTrue(
        encodeError(
                () ->
                    Encode.encode(
                        map("a", 1),
                        EncodeOptions.builder().dotPolicyPaths(List.of("a", "a")).build()))
            .getMessage()
            .contains("duplicate"));
  }

  @Test
  void jsonPathHelpersRoundTripAndRejectMalformedInput() {
    assertEquals(List.of("data", "childs", 2, "name"), Encode.parseJsonPath("data.childs[2].name"));
    assertEquals("data.childs[2].name", Encode.formatJsonPath(List.of("data", "childs", 2, "name")));
    assertThrows(XaiopEncodeError.class, () -> Encode.parseJsonPath("[0]"));
    assertThrows(XaiopEncodeError.class, () -> Encode.parseJsonPath("a..b"));
    assertThrows(XaiopEncodeError.class, () -> Encode.parseJsonPath(""));
  }

  // --- numbers ----------------------------------------------------------------

  @Test
  void numberEdgeCasesSurviveTheWire() {
    Map<String, Object> value =
        map(
            "max", 9007199254740991L,
            "min", -9007199254740991L,
            "z", 0,
            "nz", -0.0,
            "f", 0.1 + 0.2,
            "sci", 1e-7,
            "bigf", 1.23e20);
    assertTree(value, roundTrip(value, NONE), "number edges must round-trip by value");
    assertEquals(0.0, ((Number) ((Map<?, ?>) roundTrip(value, NONE)).get("nz")).doubleValue(),
        "the number surface collapses -0");
  }

  @Test
  void integralDoublesEncodeAsIntegerTokens() {
    assertEquals(">\na:3\nb:-12\n", Encode.encode(map("a", 3.0, "b", -12.0), NONE));
  }

  @Test
  void exponentialTokensMatchTheJavaScriptNumberSurface() {
    assertEquals(">\na:1e-7\n", Encode.encode(map("a", 1e-7), NONE));
    assertEquals(">\na:1e+21\n", Encode.encode(map("a", 1e21), NONE));
    assertEquals(">\na:0.30000000000000004\n", Encode.encode(map("a", 0.1 + 0.2), NONE));
    assertEquals(">\na:123000000000000000000\n", Encode.encode(map("a", 1.23e20), NONE));
  }

  @Test
  void subnormalAndExtremeFloatTokensMatchTheJavaScriptNumberSurface() {
    // Double.toString renders these as 4.9E-324 / 9.9E-324; ECMAScript uses the shortest form.
    assertEquals(">\na:5e-324\n", Encode.encode(map("a", Double.MIN_VALUE), NONE));
    assertEquals(">\na:1e-323\n", Encode.encode(map("a", 1e-323), NONE));
    assertEquals(">\na:-5e-324\n", Encode.encode(map("a", -Double.MIN_VALUE), NONE));
    assertEquals(">\na:1.7976931348623157e+308\n", Encode.encode(map("a", Double.MAX_VALUE), NONE));
    assertEquals(">\na:2.2250738585072014e-308\n", Encode.encode(map("a", Double.MIN_NORMAL), NONE));
    assertEquals(">\na:0.000001\n", Encode.encode(map("a", 1e-6), NONE));
    assertEquals(">\na:1.5e+300\n", Encode.encode(map("a", 1.5e300), NONE));
    assertEquals(">\na:0.3333333333333333\n", Encode.encode(map("a", 1.0 / 3), NONE));
    assertEquals(">\na:4.35\n", Encode.encode(map("a", 4.35), NONE));
  }

  @Test
  void floatTokensAreBitExactAndUseTheShortestRoundTrippingForm() {
    java.util.Random random = new java.util.Random(20260803);
    for (int i = 0; i < 3000; i++) {
      double d =
          i % 2 == 0
              ? Double.longBitsToDouble(random.nextLong())
              : (random.nextDouble() - 0.5) * Math.pow(10, random.nextInt(40) - 20);
      if (!Double.isFinite(d)) continue;

      String wire = Encode.encode(map("a", d), NONE);
      String token = wire.substring(wire.indexOf("a:") + 2, wire.length() - 1);
      assertEquals(
          Double.doubleToLongBits(d),
          Double.doubleToLongBits(Double.parseDouble(token)),
          "token " + token + " must re-read as the same binary64");

      int digits = new java.math.BigDecimal(token).stripTrailingZeros().precision();
      if (digits > 1) {
        java.math.BigDecimal shorter =
            new java.math.BigDecimal(Math.abs(d))
                .round(new java.math.MathContext(digits - 1, java.math.RoundingMode.HALF_EVEN));
        assertFalse(
            shorter.doubleValue() == Math.abs(d),
            "token " + token + " is longer than necessary for " + d);
      }
    }
  }

  @Test
  void unicodeValuesAndKeysRoundTrip() {
    Map<String, Object> value =
        map("名称", "萱", "emoji", "🚀", "mix", "café", "arr", list("中文", "ok"));
    assertEquals(value, roundTrip(value, NONE));
    assertEquals(value, roundTrip(value, EncodeOptions.defaults()));
  }

  @Test
  void longStringValuesRoundTrip() {
    Map<String, Object> value = map("body", "x".repeat(10_000), "n", 1);
    assertEquals(value, roundTrip(value, NONE));
  }

  // --- wire shape / stability -------------------------------------------------

  @Test
  void wireAlwaysEndsWithExactlyOneTrailingNewline() {
    for (Object value : list(map(), map("a", 1), list(), map("a", map("b", list())))) {
      String wire = Encode.encode(value, NONE);
      assertTrue(wire.endsWith("\n"), wire);
      assertFalse(wire.endsWith("\n\n"), wire);
    }
  }

  @Test
  void noConsecutiveStandaloneDotLinesUnderNormalPolicies() {
    Map<String, Object> value = map("a", 1, "b", 2, "c", 3, "d", 4);
    for (EncodeOptions options :
        List.of(
            EncodeOptions.defaults(),
            EncodeOptions.builder().dotPolicy(DotPolicy.PER_N_KEYS).phaseEvery(2).build(),
            NONE)) {
      assertFalse(Encode.encode(value, options).contains("\n.\n.\n"));
    }
  }

  @Test
  void phaseCountFollowsTheDocumentedFormula() {
    Map<String, Object> value = new LinkedHashMap<>();
    for (String key : List.of("a", "b", "c", "d", "e", "f", "g")) value.put(key, 1);

    assertEquals(6, countDotLines(Encode.encode(value, EncodeOptions.defaults())));
    assertEquals(
        2,
        countDotLines(
            Encode.encode(
                value,
                EncodeOptions.builder().dotPolicy(DotPolicy.PER_N_KEYS).phaseEvery(3).build())));
    assertEquals(
        2,
        countDotLines(
            Encode.encode(value, EncodeOptions.builder().maxPhases(3).build())));
    assertEquals(0, countDotLines(Encode.encode(value, NONE)));
  }

  @Test
  void encodingIsDeterministicForEveryPolicy() {
    Map<String, Object> value =
        map(
            "meta", map("name", "x", "n", 1.5, "flag", true),
            "tags", list("a", "b", "1"),
            "nested", list(map("id", 1), map("id", 2, "t", "true")));
    POLICIES.forEach(
        (name, options) ->
            assertEquals(
                Encode.encode(value, options), Encode.encode(value, options), "policy " + name));
  }

  @Test
  void doubleRoundTripIsIdempotentOnTheComplexFixture() {
    Map<String, Object> expected = Fixtures.complexJson();
    POLICIES.forEach(
        (name, options) -> {
          Object once = roundTrip(expected, options);
          assertEquals(expected, once, "policy " + name);
          assertEquals(expected, roundTrip(once, options), "policy " + name + " (twice)");
        });
  }

  @Test
  void complexFixtureParsesToTheExpectedTreeAndReEncodes() {
    Object fromWire = Parse.parse(Fixtures.complexWire());
    assertEquals(Fixtures.complexJson(), fromWire);
    POLICIES.forEach(
        (name, options) ->
            assertEquals(Fixtures.complexJson(), roundTrip(fromWire, options), "policy " + name));
  }

  @Test
  void seededRandomCorpusRoundTripsUnderEveryPolicy() {
    Rng rng = new Rng(20260803);
    for (int i = 0; i < 40; i++) {
      Object generated = randomJson(rng, 0);
      Object value = generated instanceof Map || generated instanceof List ? generated : map("v", generated);
      for (Map.Entry<String, EncodeOptions> policy : POLICIES.entrySet()) {
        assertTree(
            value,
            roundTrip(value, policy.getValue()),
            "case " + i + " under " + policy.getKey() + "\nwire:\n" + Encode.encode(value, policy.getValue()));
      }
    }
  }

  @Test
  void encodeErrorsCarryAPathForValueLevelFailures() {
    XaiopEncodeError err = encodeError(() -> Encode.encode(map("ok", map("bad", Double.NaN)), NONE));
    assertNotNull(err.getPath(), "value-level failures locate the offending node");
    assertTrue(err.getPath().contains("bad"), err.getPath());

    // Option-level failures are not tied to a node, so getPath() is null.
    assertEquals(
        null,
        encodeError(
                () ->
                    Encode.encode(
                        map("a", 1), EncodeOptions.builder().phaseEvery(0).build()))
            .getPath());
  }

  // --- deterministic pseudo-random corpus -------------------------------------

  /** The LCG the Node stability suite uses, so the corpus shape is comparable. */
  private static final class Rng {
    private int state;

    Rng(int seed) {
      this.state = seed;
    }

    double next() {
      state = state * 1664525 + 1013904223;
      return (state & 0xFFFFFFFFL) / 4294967296.0;
    }

    int below(int bound) {
      return (int) (next() * bound);
    }
  }

  private static Object randomJson(Rng rng, int depth) {
    double pick = rng.next();
    if (depth > 4 || pick < 0.25) return randomScalar(rng);
    if (pick < 0.55) {
      List<Object> arr = list();
      int n = rng.below(5);
      for (int i = 0; i < n; i++) arr.add(randomJson(rng, depth + 1));
      return arr;
    }
    Map<String, Object> obj = map();
    int n = rng.below(5) + (depth == 0 ? 1 : 0);
    for (int i = 0; i < n; i++) {
      obj.put("k" + rng.below(1_000_000), randomJson(rng, depth + 1));
    }
    return obj;
  }

  private static Object randomScalar(Rng rng) {
    double t = rng.next();
    if (t < 0.2) return rng.below(1000) - 500;
    if (t < 0.35) return (double) (float) ((rng.next() - 0.5) * 1000);
    if (t < 0.42) return rng.next() < 0.5;
    if (t < 0.48) return null;
    if (t < 0.55) return "";
    if (t < 0.7) return "s_" + rng.below(1_000_000);
    if (t < 0.8) return String.valueOf(rng.below(100));
    if (t < 0.88) return String.valueOf(rng.next() * 10);
    if (t < 0.94) return "null";
    return rng.next() < 0.5 ? "true" : "1e3";
  }
}
