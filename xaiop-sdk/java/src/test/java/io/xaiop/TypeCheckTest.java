package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.types.CanonicalType;
import io.xaiop.types.TypeChecker;
import io.xaiop.types.TypeEntry;
import io.xaiop.types.TypeFreezeSession;
import io.xaiop.types.TypeKind;
import io.xaiop.types.TypePolarity;
import io.xaiop.types.TypeRegistry;
import io.xaiop.types.TypeSchemaSnapshot;
import io.xaiop.types.Types;
import io.xaiop.types.XaiopTypeError;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Core type registry / freeze / schema tests — ported from Node {@code typecheck.test.js}
 * (excluding WS end-to-end).
 */
class TypeCheckTest {

  private static Map<String, Object> map(Object... keyValues) {
    LinkedHashMap<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) {
      m.put((String) keyValues[i], keyValues[i + 1]);
    }
    return m;
  }

  private static List<Object> list(Object... items) {
    ArrayList<Object> out = new ArrayList<>();
    for (Object o : items) out.add(o);
    return out;
  }

  // --- Surface / canonicalize / classify / match -----------------------------

  @Test
  void leafConstantsAndStringSurfaces() {
    for (String k :
        List.of("int", "float", "bool", "string", "null", "object", "array", "any")) {
      assertEquals(k, Types.parseTypeSurface(k).kind().wire());
      assertEquals(k, Types.canonicalizeType(k).kind().wire());
    }
    assertEquals(TypeKind.INT, Types.canonicalizeType(Types.TYPE.INT).kind());
    assertEquals(TypeKind.STRING, Types.canonicalizeType(map("kind", "string")).kind());
  }

  @Test
  void arrayAndObjectSurfaceAndBuilders() {
    CanonicalType arr = Types.parseTypeSurface("array<int>");
    assertEquals(TypeKind.ARRAY, arr.kind());
    assertEquals(TypeKind.INT, arr.element().kind());

    assertEquals(
        TypeKind.BOOL,
        Types.parseTypeSurface("array<object<x:bool>>").element().fields().get("x").kind());

    CanonicalType o = Types.parseTypeSurface("object<name:string, old:int>");
    assertEquals(TypeKind.STRING, o.fields().get("name").kind());
    assertEquals(TypeKind.INT, o.fields().get("old").kind());
    assertEquals(TypeKind.OBJECT, Types.parseTypeSurface("object<>").kind());

    assertEquals(TypeKind.BOOL, Types.objectType(map("a", Types.TYPE.BOOL)).fields().get("a").kind());
    assertEquals(TypeKind.FLOAT, Types.arrayType("float").element().kind());
    assertEquals(TypeKind.STRING, Types.arrayType(Types.TYPE.STRING).element().kind());
  }

  @Test
  void surfaceErrors() {
    assertThrows(IllegalArgumentException.class, () -> Types.parseTypeSurface(""));
    assertThrows(IllegalArgumentException.class, () -> Types.parseTypeSurface("nope"));
    assertThrows(IllegalArgumentException.class, () -> Types.parseTypeSurface("array<int"));
    assertThrows(IllegalArgumentException.class, () -> Types.parseTypeSurface("object<name string>"));
    assertThrows(IllegalArgumentException.class, () -> Types.parseTypeSurface("string<int>"));
    assertThrows(IllegalArgumentException.class, () -> Types.parseTypeSurface("int trailing"));
    assertThrows(IllegalArgumentException.class, () -> Types.canonicalizeType(null));
    assertThrows(IllegalArgumentException.class, () -> Types.canonicalizeType(42));
    assertThrows(IllegalArgumentException.class, () -> Types.canonicalizeType(map()));
    assertThrows(IllegalArgumentException.class, () -> Types.objectType(null));
  }

  @Test
  void typeToStringRoundIsh() {
    assertEquals("int", Types.typeToString(Types.TYPE.INT));
    assertEquals("array<string>", Types.typeToString(Types.arrayType(Types.TYPE.STRING)));
    assertEquals(
        "object<a:int,b:bool>",
        Types.typeToString(Types.objectType(map("a", Types.TYPE.INT, "b", Types.TYPE.BOOL))));
  }

  @Test
  void classifyLeavesAndStructures() {
    assertEquals(TypeKind.NULL, Types.classifyValue(null).kind());
    assertEquals(TypeKind.BOOL, Types.classifyValue(true).kind());
    assertEquals(TypeKind.STRING, Types.classifyValue("hi").kind());
    assertEquals(TypeKind.INT, Types.classifyValue(1).kind());
    assertEquals(TypeKind.FLOAT, Types.classifyValue(1.5).kind());
    assertEquals(TypeKind.OBJECT, Types.classifyValue(map()).kind());
    assertEquals(TypeKind.ARRAY, Types.classifyValue(list()).kind());
    assertEquals(TypeKind.INT, Types.classifyValue(list(1, 2)).element().kind());
    assertThrows(XaiopTypeError.class, () -> Types.classifyValue(list(1, "x")));
    assertThrows(XaiopTypeError.class, () -> Types.classifyValue(Double.NaN));
    assertThrows(XaiopTypeError.class, () -> Types.classifyValue(Double.POSITIVE_INFINITY));
  }

  @Test
  void valueMatchesTypeAllowMatrix() {
    assertTrue(Types.valueMatchesType(1, Types.TYPE.INT));
    assertFalse(Types.valueMatchesType(1.5, Types.TYPE.INT));
    assertFalse(Types.valueMatchesType(1, Types.TYPE.FLOAT));
    assertTrue(Types.valueMatchesType(1.5, Types.TYPE.FLOAT));
    assertTrue(Types.valueMatchesType(true, Types.TYPE.BOOL));
    assertTrue(Types.valueMatchesType("a", Types.TYPE.STRING));
    assertTrue(Types.valueMatchesType(null, Types.TYPE.NULL));
    assertFalse(Types.valueMatchesType(null, Types.TYPE.STRING));
    assertTrue(Types.valueMatchesType("x", Types.TYPE.ANY));
    assertTrue(Types.valueMatchesType(map(), Types.TYPE.OBJECT));
    assertFalse(Types.valueMatchesType(list(), Types.TYPE.OBJECT));
    assertTrue(Types.valueMatchesType(list(1), Types.TYPE.ARRAY));
    assertTrue(Types.valueMatchesType(list(1, 2), Types.arrayType(Types.TYPE.INT)));
    assertFalse(Types.valueMatchesType(list(1, "x"), Types.arrayType(Types.TYPE.INT)));
    assertTrue(
        Types.valueMatchesType(
            map("name", "a", "old", 1),
            Types.objectType(map("name", Types.TYPE.STRING, "old", Types.TYPE.INT))));
    assertFalse(
        Types.valueMatchesType(
            map("name", "a"),
            Types.objectType(map("name", Types.TYPE.STRING, "old", Types.TYPE.INT))));
    assertTrue(
        Types.valueMatchesType(
            map("name", "a", "extra", 1), Types.objectType(map("name", Types.TYPE.STRING))));
  }

  @Test
  void typeCompatible() {
    assertTrue(Types.typeCompatible(Types.TYPE.INT, Types.TYPE.INT));
    assertFalse(Types.typeCompatible(Types.TYPE.INT, Types.TYPE.FLOAT));
    assertTrue(Types.typeCompatible(Types.TYPE.ANY, Types.TYPE.STRING));
    assertTrue(Types.typeCompatible(Types.TYPE.OBJECT, CanonicalType.of(TypeKind.OBJECT)));
    assertTrue(
        Types.typeCompatible(Types.arrayType(Types.TYPE.INT), Types.arrayType(Types.TYPE.INT)));
    assertFalse(
        Types.typeCompatible(Types.arrayType(Types.TYPE.INT), Types.arrayType(Types.TYPE.STRING)));
    assertTrue(Types.typeCompatible(CanonicalType.of(TypeKind.ARRAY), Types.arrayType(Types.TYPE.INT)));
  }

  // --- TypeRegistry ----------------------------------------------------------

  @Test
  void registryRegisterImmutablePolaritySnapshot() {
    TypeRegistry reg = new TypeRegistry();
    assertTrue(reg.register("a.b", Types.TYPE.STRING));
    assertFalse(reg.register("a.b", Types.TYPE.INT));
    assertTrue(reg.register("a.c", Types.TYPE.INT, TypePolarity.DENY));
    assertThrows(
        IllegalArgumentException.class,
        () -> reg.register("a.d", Types.TYPE.ANY, TypePolarity.DENY));

    TypeRegistry.RegisterManyResult many =
        reg.registerMany(map("a.b", Types.TYPE.BOOL, "x", Types.TYPE.FLOAT));
    assertEquals(List.of("x"), many.ok());
    assertEquals(List.of("a.b"), many.rejected());

    TypeRegistry.RegisterManyResult many2 =
        reg.registerMany(
            List.of(
                list("y", Types.TYPE.BOOL),
                new TypeEntry("z", Types.TYPE.NULL, TypePolarity.ALLOW)));
    assertTrue(many2.ok().contains("y") && many2.ok().contains("z"));

    assertTrue(reg.has("a.b"));
    assertEquals(TypeKind.STRING, reg.get("a.b").type().kind());
    assertEquals(TypePolarity.DENY, reg.get("a.c").polarity());
    assertTrue(reg.size() >= 4);

    TypeSchemaSnapshot snap = reg.snapshot();
    assertEquals(1, snap.version());
    TypeRegistry reg2 = TypeRegistry.fromSnapshot(snap);
    assertEquals(TypeKind.STRING, reg2.get("a.b").type().kind());
    assertEquals(TypePolarity.DENY, reg2.get("a.c").polarity());

    TypeRegistry reg3 = TypeRegistry.fromSnapshot(reg);
    assertTrue(reg3.has("x"));

    assertThrows(
        IllegalArgumentException.class,
        () -> TypeRegistry.fromSnapshot(map("version", 2, "entries", list())));
    assertThrows(
        XaiopTypeError.class,
        () ->
            TypeRegistry.fromSnapshot(
                map(
                    "version",
                    1,
                    "entries",
                    list(
                        map("path", "dup", "type", map("kind", "int"), "polarity", "allow"),
                        map("path", "dup", "type", map("kind", "string"), "polarity", "allow")))));
  }

  @Test
  void pathNormalizationRejectsEmptyInvalid() {
    TypeRegistry reg = new TypeRegistry();
    assertThrows(RuntimeException.class, () -> reg.register("", Types.TYPE.INT));
    assertThrows(RuntimeException.class, () -> reg.register(".a", Types.TYPE.INT));
  }

  @Test
  void registerManyPolarityBatchDeny() {
    TypeRegistry reg = new TypeRegistry();
    TypeRegistry.RegisterManyResult r =
        reg.registerMany(map("a", Types.TYPE.STRING, "b", Types.TYPE.INT), TypePolarity.DENY);
    assertEquals(2, r.ok().size());
    assertEquals(TypePolarity.DENY, reg.get("a").polarity());
    TypeChecker checker = new TypeChecker(reg);
    assertThrows(XaiopTypeError.class, () -> checker.checkTree(map("a", "x")));
    checker.checkTree(map("a", 1, "b", true));
  }

  // --- TypeChecker -----------------------------------------------------------

  @Test
  void checkerOnlyRegisteredPaths() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("keep", Types.TYPE.INT);
    TypeChecker checker = new TypeChecker(reg);
    checker.checkTree(map("keep", 1, "other", "anything"));
    assertThrows(XaiopTypeError.class, () -> checker.checkTree(map("keep", "no")));
  }

  @Test
  void checkerDenyPolarityHookThrowFalse() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("s", Types.TYPE.STRING, TypePolarity.DENY);
    ArrayList<String> seen = new ArrayList<>();
    TypeChecker checker =
        new TypeChecker(reg, (err, ctx) -> seen.add(err.getPath()));
    List<XaiopTypeError> errs = checker.checkTree(map("s", "bad"), false);
    assertEquals(1, errs.size());
    assertEquals(List.of("s"), seen);
    checker.checkTree(map("s", 1));
  }

  @Test
  void checkerArrayElementTypeFromRegistry() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("items", Types.arrayType(Types.TYPE.INT));
    TypeChecker checker = new TypeChecker(reg);
    checker.checkTree(map("items", list(1, 2)));
    assertThrows(XaiopTypeError.class, () -> checker.checkTree(map("items", list(1, "x"))));
  }

  @Test
  void checkerObjectFieldsAndFragmentUnwrap() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("user", Types.objectType(map("name", Types.TYPE.STRING)));
    TypeChecker checker = new TypeChecker(reg);
    checker.checkTree(map("user", map("name", "a")));
    assertThrows(XaiopTypeError.class, () -> checker.checkTree(map("user", map("name", 1))));
    checker.checkTree(map("isFragment", true, "entries", map("user", map("name", "b"))));
  }

  @Test
  void checkerNullAgainstNonNullRegisteredType() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("k", Types.TYPE.STRING);
    assertThrows(XaiopTypeError.class, () -> new TypeChecker(reg).checkTree(map("k", null)));
    TypeRegistry reg2 = new TypeRegistry();
    reg2.register("n", Types.TYPE.NULL);
    new TypeChecker(reg2).checkTree(map("n", null));
  }

  // --- TypeFreezeSession -----------------------------------------------------

  @Test
  void freezeFirstNonNullNullSkipMismatchReconcile() {
    TypeFreezeSession s = new TypeFreezeSession();
    s.observeTree(map("a", 1, "b", "x"));
    s.observeTree(map("a", 2));
    assertThrows(XaiopTypeError.class, () -> s.observeTree(map("a", "no")));
    s.observeTree(map("a", null));
    s.observeTree(map("a", 3));
    s.reconcileCommit(map("b", "x"));
    assertFalse(s.freezes().containsKey("a"));
    s.observeTree(map("a", "refreshed"));
    s.reconcileCommit(null);
    assertEquals(0, s.freezes().size());
  }

  @Test
  void freezeArrayHomogeneityAndClearPath() {
    TypeFreezeSession s = new TypeFreezeSession();
    s.observeTree(map("items", list(1, 2, null, 3)));
    assertThrows(XaiopTypeError.class, () -> s.observeTree(map("items", list(1, "x"))));
    s.clearPath("items");
    s.observeTree(map("items", list("a", "b")));
  }

  @Test
  void freezeSchemaAllowDenyAny() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("k", Types.TYPE.INT);
    reg.register("s", Types.TYPE.STRING, TypePolarity.DENY);
    reg.register("free", Types.TYPE.ANY);
    TypeFreezeSession s = new TypeFreezeSession(reg);
    s.observeTree(map("k", 1, "free", map("nested", true)));
    assertThrows(XaiopTypeError.class, () -> s.observeTree(map("k", "x")));
    assertThrows(XaiopTypeError.class, () -> s.observeTree(map("s", "nope")));
    s.observeTree(map("s", 1));
    s.observeTree(map("free", 99));
  }

  @Test
  void freezeSchemaDenyThenLocksFirstAllowed() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("s", Types.TYPE.STRING, TypePolarity.DENY);
    TypeFreezeSession s = new TypeFreezeSession(reg);
    assertThrows(XaiopTypeError.class, () -> s.observeTree(map("s", "no")));
    s.observeTree(map("s", 1));
    assertThrows(XaiopTypeError.class, () -> s.observeTree(map("s", true)));
  }

  @Test
  void applySchemaFromSnapshotSeedsFreeze() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("k", Types.TYPE.INT);
    TypeFreezeSession s = new TypeFreezeSession();
    s.applySchema(reg.snapshot());
    assertEquals(TypeKind.INT, s.freezes().get("k").kind());
    s.applySchema(null);
    assertNull(s.schema());
  }

  @Test
  void freezeOnViolationThrowFalse() {
    int[] n = {0};
    TypeFreezeSession s = new TypeFreezeSession(null, err -> n[0]++);
    s.observeTree(map("a", 1));
    List<XaiopTypeError> errs = s.observeTree(map("a", "x"), false);
    assertEquals(1, errs.size());
    assertEquals(1, n[0]);
  }

  @Test
  void freezeRootArrayTree() {
    TypeFreezeSession s = new TypeFreezeSession();
    s.observeTree(list(1, 2));
    assertThrows(XaiopTypeError.class, () -> s.observeTree(list(1, "x")));
  }

  // --- Schema frames ---------------------------------------------------------

  @Test
  void encodeTryParseRoundtrip() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("a.b", Types.TYPE.FLOAT, TypePolarity.DENY);
    TypeSchemaSnapshot snap = reg.snapshot();
    String frame = Types.encodeTypeSchemaFrame(snap);
    assertTrue(frame.startsWith(Types.TYPE_SCHEMA_FRAME_PREFIX));
    TypeSchemaSnapshot parsed = Types.tryParseTypeSchemaFrame(frame);
    assertEquals("a.b", parsed.entries().get(0).path());
    assertEquals(TypePolarity.DENY, parsed.entries().get(0).polarity());
    assertNull(Types.tryParseTypeSchemaFrame("not a frame"));
    assertThrows(
        XaiopTypeError.class,
        () -> Types.tryParseTypeSchemaFrame(Types.TYPE_SCHEMA_FRAME_PREFIX + "{"));
    assertThrows(
        XaiopTypeError.class,
        () ->
            Types.tryParseTypeSchemaFrame(
                Types.TYPE_SCHEMA_FRAME_PREFIX + Json.stringify(map("version", 1))));
    assertThrows(
        IllegalArgumentException.class,
        () -> Types.encodeTypeSchemaFrame(new TypeSchemaSnapshot(2, List.of())));
  }

  // --- XaiopEngine integration -----------------------------------------------

  @Test
  void engineTypeCheckFlagStrictOnly() {
    XaiopEngine eng = new XaiopEngine();
    assertFalse(eng.typeCheck());
    assertTrue(eng.setTypeCheck(true));
    assertTrue(eng.typeCheck());
    eng.setCompatibilityMode(true);
    assertFalse(eng.typeCheck());
    assertFalse(eng.setTypeCheck(true));
    eng.setCompatibilityMode(false);
    assertTrue(eng.setTypeCheck(true));
    assertTrue(eng.setTypeCheck(false));
  }

  @Test
  void engineRegisterApisExport() {
    XaiopEngine eng = new XaiopEngine();
    assertTrue(eng.registerType("data.fork", "string"));
    assertFalse(eng.registerType("data.fork", Types.TYPE.INT));
    assertTrue(eng.registerTypeDeny("data.bad", Types.TYPE.STRING));
    eng.registerTypes(map("data.n", Types.TYPE.INT));
    eng.registerTypes(List.of(list("data.flag", Types.TYPE.BOOL)));
    assertEquals(TypeKind.STRING, eng.getRegisteredType("data.fork").type().kind());
    assertTrue(eng.typeRegistry().size() >= 4);
    assertEquals(1, eng.exportTypeSchema().version());
    assertTrue(eng.encodeTypeSchemaFrame().startsWith(Types.TYPE_SCHEMA_FRAME_PREFIX));
  }

  @Test
  void engineUploadSyncChecksWhenEnabled() {
    XaiopEngine eng = new XaiopEngine();
    eng.registerType("k", Types.TYPE.INT);
    eng.uploadSync(">\nk:oops\n");
    eng.setTypeCheck(true);
    assertThrows(XaiopTypeError.class, () -> eng.uploadSync(">\nk:oops\n"));
    String id = eng.uploadSync(">\nk:1\n");
    assertTrue(eng.has(id));

    XaiopEngine empty = new XaiopEngine();
    empty.setTypeCheck(true);
    empty.uploadSync(">\nk:oops\n");
  }

  @Test
  void engineUploadJsonAndInjectTypeCheck() {
    XaiopEngine eng = new XaiopEngine();
    eng.registerType("k", Types.TYPE.INT);
    eng.setTypeCheck(true);
    String id = eng.uploadJsonSync(map("k", 1));
    assertThrows(XaiopTypeError.class, () -> eng.uploadJsonSync(map("k", "x")));

    eng.injectJsonSync(id, map("k", 2));
    assertThrows(XaiopTypeError.class, () -> eng.injectJsonSync(id, map("k", "bad")));

    String id2 = eng.uploadSync(">\nk:3\n");
    eng.injectXaiopSync(id2, ">\nk:4\n");
    assertThrows(XaiopTypeError.class, () -> eng.injectXaiopSync(id2, ">\nk:no\n"));
  }

  @Test
  void engineNestedObjectTypeAnyAndHook() {
    XaiopEngine eng = new XaiopEngine();
    eng.registerType("user", Types.objectType(map("name", Types.TYPE.STRING, "old", Types.TYPE.INT)));
    eng.registerType("meta.note", Types.TYPE.ANY);
    ArrayList<String> hooks = new ArrayList<>();
    eng.onTypeViolation((err, ctx) -> hooks.add(err.getPath()));
    eng.setTypeCheck(true);
    eng.uploadSync(
        """
        >
        >user
        name:a
        old:2
        >meta
        note:whatever
        """);
    assertThrows(
        XaiopTypeError.class,
        () ->
            eng.uploadSync(
                """
                >
                >user
                name:a
                old:x
                """));
    assertTrue(hooks.contains("user"));
    eng.onTypeViolation(null);
  }

  @Test
  void engineFloatVsIntOnUpload() {
    XaiopEngine eng = new XaiopEngine();
    eng.registerType("n", Types.TYPE.FLOAT);
    eng.setTypeCheck(true);
    eng.uploadSync(">\nn:1.5\n");
    assertThrows(XaiopTypeError.class, () -> eng.uploadSync(">\nn:1\n"));
  }

  @Test
  void engineUnregisteredPathsIgnored() {
    XaiopEngine eng = new XaiopEngine();
    eng.registerType("only", Types.TYPE.STRING);
    eng.setTypeCheck(true);
    eng.uploadSync(
        """
        >
        only:ok
        other:1
        extra:true
        """);
  }

  @Test
  void freezeDenyPolarityDoesNotSeedDeniedFreeze() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("s", Types.TYPE.STRING, TypePolarity.DENY);
    TypeFreezeSession s = new TypeFreezeSession(reg);
    assertThrows(XaiopTypeError.class, () -> s.observeTree(map("s", "no")));
    assertFalse(s.freezes().containsKey("s"));
    s.observeTree(map("s", 1));
    assertEquals(TypeKind.INT, s.freezes().get("s").kind());
  }

  @Test
  void schemaFrameRoundtripThroughRegistryAndFreeze() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("a.b", Types.TYPE.INT, TypePolarity.DENY);
    reg.register("ok", Types.TYPE.STRING);
    String frame = Types.encodeTypeSchemaFrame(reg.snapshot());
    TypeSchemaSnapshot parsed = Types.tryParseTypeSchemaFrame(frame);
    TypeRegistry restored = TypeRegistry.fromSnapshot(parsed);
    assertEquals(TypePolarity.DENY, restored.get("a.b").polarity());
    assertEquals(TypePolarity.ALLOW, restored.get("ok").polarity());

    TypeFreezeSession freeze = new TypeFreezeSession();
    freeze.applySchema(parsed);
    // applySchema seeds ALLOW entries only (deny stays schema-side)
    assertEquals(TypeKind.STRING, freeze.freezes().get("ok").kind());
    assertFalse(freeze.freezes().containsKey("a.b"));
    assertThrows(XaiopTypeError.class, () -> freeze.observeTree(map("a.b", 1)));
    freeze.observeTree(map("a.b", "allowed-after-deny"));
    assertThrows(XaiopTypeError.class, () -> freeze.observeTree(map("ok", 1)));
    freeze.observeTree(map("ok", "hi"));
  }
}
