import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  TYPE,
  TYPE_SCHEMA_FRAME_PREFIX,
  TypeChecker,
  TypeFreezeSession,
  TypeRegistry,
  XaiopEngine,
  XaiopTypeError,
  XaiopWs,
  arrayType,
  canonicalizeType,
  classifyValue,
  encodeTypeSchemaFrame,
  objectType,
  parseTypeSurface,
  tryParseTypeSchemaFrame,
  typeCompatible,
  typeToString,
  valueMatchesType,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Surface / canonicalize / classify / match
// ---------------------------------------------------------------------------

describe("canonicalize + surface syntax", () => {
  test("leaf constants and string surfaces", () => {
    for (const k of ["int", "float", "bool", "string", "null", "object", "array", "any"]) {
      assert.equal(parseTypeSurface(k).kind, k);
      assert.equal(canonicalizeType(k).kind, k);
    }
    assert.equal(canonicalizeType(TYPE.INT).kind, "int");
    assert.equal(canonicalizeType({ kind: "string" }).kind, "string");
  });

  test("array and object surface + builders", () => {
    assert.deepEqual(parseTypeSurface("array<int>"), {
      kind: "array",
      element: { kind: "int" },
    });
    assert.deepEqual(parseTypeSurface("array<object<x:bool>>").element.fields.x, {
      kind: "bool",
    });
    const o = parseTypeSurface("object<name:string, old:int>");
    assert.equal(o.fields.name.kind, "string");
    assert.equal(o.fields.old.kind, "int");
    assert.equal(parseTypeSurface("object<>").kind, "object");
    assert.equal(objectType({ a: TYPE.BOOL }).fields.a.kind, "bool");
    assert.equal(arrayType("float").element.kind, "float");
    assert.equal(arrayType(TYPE.STRING).element.kind, "string");
  });

  test("surface errors", () => {
    assert.throws(() => parseTypeSurface(""), TypeError);
    assert.throws(() => parseTypeSurface("nope"), TypeError);
    assert.throws(() => parseTypeSurface("array<int"), TypeError);
    assert.throws(() => parseTypeSurface("object<name string>"), TypeError);
    assert.throws(() => parseTypeSurface("string<int>"), TypeError);
    assert.throws(() => parseTypeSurface("int trailing"), TypeError);
    assert.throws(() => canonicalizeType(null), TypeError);
    assert.throws(() => canonicalizeType(42), TypeError);
    assert.throws(() => canonicalizeType({}), TypeError);
    assert.throws(() => objectType(null), TypeError);
    assert.throws(() => objectType([]), TypeError);
  });

  test("typeToString round-ish", () => {
    assert.equal(typeToString(TYPE.INT), "int");
    assert.equal(typeToString(arrayType(TYPE.STRING)), "array<string>");
    assert.equal(
      typeToString(objectType({ a: TYPE.INT, b: TYPE.BOOL })),
      "object<a:int,b:bool>",
    );
  });
});

describe("classifyValue + valueMatchesType + typeCompatible", () => {
  test("classify leaves and structures", () => {
    assert.equal(classifyValue(null).kind, "null");
    assert.equal(classifyValue(true).kind, "bool");
    assert.equal(classifyValue("hi").kind, "string");
    assert.equal(classifyValue(1).kind, "int");
    assert.equal(classifyValue(1.5).kind, "float");
    assert.equal(classifyValue({}).kind, "object");
    assert.equal(classifyValue([]).kind, "array");
    assert.deepEqual(classifyValue([1, 2]).element, { kind: "int" });
    assert.throws(() => classifyValue([1, "x"]), XaiopTypeError);
    assert.throws(() => classifyValue(Number.NaN), XaiopTypeError);
    assert.throws(() => classifyValue(Infinity), XaiopTypeError);
  });

  test("valueMatchesType allow matrix", () => {
    assert.equal(valueMatchesType(1, TYPE.INT), true);
    assert.equal(valueMatchesType(1.5, TYPE.INT), false);
    assert.equal(valueMatchesType(1, TYPE.FLOAT), false);
    assert.equal(valueMatchesType(1.5, TYPE.FLOAT), true);
    assert.equal(valueMatchesType(true, TYPE.BOOL), true);
    assert.equal(valueMatchesType("a", TYPE.STRING), true);
    assert.equal(valueMatchesType(null, TYPE.NULL), true);
    assert.equal(valueMatchesType(null, TYPE.STRING), false);
    assert.equal(valueMatchesType("x", TYPE.ANY), true);
    assert.equal(valueMatchesType({}, TYPE.OBJECT), true);
    assert.equal(valueMatchesType([], TYPE.OBJECT), false);
    assert.equal(valueMatchesType([1], TYPE.ARRAY), true);
    assert.equal(valueMatchesType([1, 2], arrayType(TYPE.INT)), true);
    assert.equal(valueMatchesType([1, "x"], arrayType(TYPE.INT)), false);
    assert.equal(
      valueMatchesType({ name: "a", old: 1 }, objectType({ name: TYPE.STRING, old: TYPE.INT })),
      true,
    );
    assert.equal(
      valueMatchesType({ name: "a" }, objectType({ name: TYPE.STRING, old: TYPE.INT })),
      false,
    );
    assert.equal(
      valueMatchesType({ name: "a", extra: 1 }, objectType({ name: TYPE.STRING })),
      true,
    );
  });

  test("typeCompatible", () => {
    assert.equal(typeCompatible(TYPE.INT, TYPE.INT), true);
    assert.equal(typeCompatible(TYPE.INT, TYPE.FLOAT), false);
    assert.equal(typeCompatible(TYPE.ANY, TYPE.STRING), true);
    assert.equal(typeCompatible(TYPE.OBJECT, { kind: "object" }), true);
    assert.equal(
      typeCompatible(arrayType(TYPE.INT), arrayType(TYPE.INT)),
      true,
    );
    assert.equal(
      typeCompatible(arrayType(TYPE.INT), arrayType(TYPE.STRING)),
      false,
    );
    assert.equal(typeCompatible({ kind: "array" }, arrayType(TYPE.INT)), true);
  });
});

// ---------------------------------------------------------------------------
// TypeRegistry
// ---------------------------------------------------------------------------

describe("TypeRegistry", () => {
  test("register immutable + polarity + list/snapshot", () => {
    const reg = new TypeRegistry();
    assert.equal(reg.register("a.b", TYPE.STRING), true);
    assert.equal(reg.register("a.b", TYPE.INT), false);
    assert.equal(reg.register("a.c", TYPE.INT, { polarity: "deny" }), true);
    assert.throws(() => reg.register("a.d", TYPE.ANY, { polarity: "deny" }), TypeError);

    const { ok, rejected } = reg.registerMany({
      "a.b": TYPE.BOOL,
      "x": TYPE.FLOAT,
    });
    assert.deepEqual(ok, ["x"]);
    assert.deepEqual(rejected, ["a.b"]);

    const { ok: ok2 } = reg.registerMany([
      ["y", TYPE.BOOL],
      { path: "z", type: TYPE.NULL, polarity: "allow" },
    ]);
    assert.ok(ok2.includes("y") && ok2.includes("z"));

    assert.equal(reg.has("a.b"), true);
    assert.equal(reg.get("a.b").type.kind, "string");
    assert.equal(reg.get("a.c").polarity, "deny");
    assert.equal(reg.size >= 4, true);

    const snap = reg.snapshot();
    assert.equal(snap.version, 1);
    const reg2 = TypeRegistry.fromSnapshot(snap);
    assert.equal(reg2.get("a.b").type.kind, "string");
    assert.equal(reg2.get("a.c").polarity, "deny");

    const reg3 = TypeRegistry.fromSnapshot(reg);
    assert.equal(reg3.has("x"), true);

    assert.throws(() => TypeRegistry.fromSnapshot({ version: 2, entries: [] }), TypeError);
    assert.throws(
      () => TypeRegistry.fromSnapshot({ version: 1, entries: [{ path: "dup", type: TYPE.INT }, { path: "dup", type: TYPE.STRING }] }),
      XaiopTypeError,
    );
  });

  test("path normalization rejects empty / invalid", () => {
    const reg = new TypeRegistry();
    assert.throws(() => reg.register("", TYPE.INT));
    assert.throws(() => reg.register(".a", TYPE.INT));
  });
});

// ---------------------------------------------------------------------------
// TypeChecker (server registry)
// ---------------------------------------------------------------------------

describe("TypeChecker", () => {
  test("only registered paths; unregistered ignored", () => {
    const reg = new TypeRegistry();
    reg.register("keep", TYPE.INT);
    const checker = new TypeChecker(reg);
    checker.checkTree({ keep: 1, other: "anything" });
    assert.throws(() => checker.checkTree({ keep: "no" }), XaiopTypeError);
  });

  test("deny polarity + hook + throw:false", () => {
    const reg = new TypeRegistry();
    reg.register("s", TYPE.STRING, { polarity: "deny" });
    /** @type {string[]} */
    const seen = [];
    const checker = new TypeChecker(reg, {
      onViolation: (err) => seen.push(err.path),
    });
    const errs = checker.checkTree({ s: "bad" }, { throw: false });
    assert.equal(errs.length, 1);
    assert.deepEqual(seen, ["s"]);
    checker.checkTree({ s: 1 });
  });

  test("array element type from registry", () => {
    const reg = new TypeRegistry();
    reg.register("items", arrayType(TYPE.INT));
    const checker = new TypeChecker(reg);
    checker.checkTree({ items: [1, 2] });
    assert.throws(() => checker.checkTree({ items: [1, "x"] }), XaiopTypeError);
  });

  test("object fields + fragment unwrap", () => {
    const reg = new TypeRegistry();
    reg.register("user", objectType({ name: TYPE.STRING }));
    const checker = new TypeChecker(reg);
    checker.checkTree({ user: { name: "a" } });
    assert.throws(() => checker.checkTree({ user: { name: 1 } }), XaiopTypeError);
    checker.checkTree({
      isFragment: true,
      entries: { user: { name: "b" } },
    });
  });

  test("null against non-null registered type fails on server", () => {
    const reg = new TypeRegistry();
    reg.register("k", TYPE.STRING);
    assert.throws(() => new TypeChecker(reg).checkTree({ k: null }), XaiopTypeError);
    reg.register("n", TYPE.NULL);
    // separate registry for null ok
    const reg2 = new TypeRegistry();
    reg2.register("n", TYPE.NULL);
    new TypeChecker(reg2).checkTree({ n: null });
  });
});

// ---------------------------------------------------------------------------
// TypeFreezeSession (client)
// ---------------------------------------------------------------------------

describe("TypeFreezeSession", () => {
  test("first non-null freeze; null skip; mismatch; refresh via reconcile", () => {
    const s = new TypeFreezeSession();
    s.observeTree({ a: 1, b: "x" });
    s.observeTree({ a: 2 });
    assert.throws(() => s.observeTree({ a: "no" }), XaiopTypeError);
    s.observeTree({ a: null });
    s.observeTree({ a: 3 });
    s.reconcileCommit({ b: "x" });
    assert.equal(s.freezes.has("a"), false);
    s.observeTree({ a: "refreshed" });
    s.reconcileCommit(null);
    assert.equal(s.freezes.size, 0);
  });

  test("array homogeneity + clearPath", () => {
    const s = new TypeFreezeSession();
    s.observeTree({ items: [1, 2, null, 3] });
    assert.throws(() => s.observeTree({ items: [1, "x"] }), XaiopTypeError);
    s.clearPath("items");
    s.observeTree({ items: ["a", "b"] });
  });

  test("schema allow / deny / any", () => {
    const reg = new TypeRegistry();
    reg.register("k", TYPE.INT);
    reg.register("s", TYPE.STRING, { polarity: "deny" });
    reg.register("free", TYPE.ANY);
    const s = new TypeFreezeSession({ schema: reg });
    s.observeTree({ k: 1, free: { nested: true } });
    assert.throws(() => s.observeTree({ k: "x" }), XaiopTypeError);
    assert.throws(() => s.observeTree({ s: "nope" }), XaiopTypeError);
    // deny violation must not freeze the denied value ??int is allowed next
    s.observeTree({ s: 1 });
    s.observeTree({ free: 99 });
  });

  test("schema deny then freeze locks first allowed value", () => {
    const reg = new TypeRegistry();
    reg.register("s", TYPE.STRING, { polarity: "deny" });
    const s = new TypeFreezeSession({ schema: reg });
    assert.throws(() => s.observeTree({ s: "no" }), XaiopTypeError);
    s.observeTree({ s: 1 });
    assert.throws(() => s.observeTree({ s: true }), XaiopTypeError);
  });

  test("applySchema from snapshot seeds freeze", () => {
    const reg = new TypeRegistry();
    reg.register("k", TYPE.INT);
    const s = new TypeFreezeSession();
    s.applySchema(reg.snapshot());
    assert.equal(s.freezes.get("k").kind, "int");
    s.applySchema(null);
    assert.equal(s.schema, null);
  });

  test("onViolation + throw:false", () => {
    /** @type {number} */
    let n = 0;
    const s = new TypeFreezeSession({
      onViolation: () => {
        n++;
      },
    });
    s.observeTree({ a: 1 });
    const errs = s.observeTree({ a: "x" }, { throw: false });
    assert.equal(errs.length, 1);
    assert.equal(n, 1);
  });

  test("root array tree", () => {
    const s = new TypeFreezeSession();
    s.observeTree([1, 2]);
    assert.throws(() => s.observeTree([1, "x"]), XaiopTypeError);
  });
});

// ---------------------------------------------------------------------------
// Schema frames
// ---------------------------------------------------------------------------

describe("type schema frames", () => {
  test("encode / tryParse roundtrip", () => {
    const reg = new TypeRegistry();
    reg.register("a.b", TYPE.FLOAT, { polarity: "deny" });
    const snap = reg.snapshot();
    const frame = encodeTypeSchemaFrame(snap);
    assert.ok(frame.startsWith(TYPE_SCHEMA_FRAME_PREFIX));
    const parsed = tryParseTypeSchemaFrame(frame);
    assert.equal(parsed.entries[0].path, "a.b");
    assert.equal(parsed.entries[0].polarity, "deny");
    assert.equal(tryParseTypeSchemaFrame("not a frame"), null);
    assert.throws(() => tryParseTypeSchemaFrame(TYPE_SCHEMA_FRAME_PREFIX + "{"), XaiopTypeError);
    assert.throws(
      () => tryParseTypeSchemaFrame(TYPE_SCHEMA_FRAME_PREFIX + JSON.stringify({ version: 1 })),
      XaiopTypeError,
    );
    assert.throws(() => encodeTypeSchemaFrame({ version: 2, entries: [] }), TypeError);
  });
});

// ---------------------------------------------------------------------------
// XaiopEngine integration
// ---------------------------------------------------------------------------

describe("XaiopEngine type APIs", () => {
  test("typeCheck flag strict-only; compat clears", () => {
    const eng = new XaiopEngine();
    assert.equal(eng.typeCheck, false);
    assert.equal(eng.setTypeCheck(true), true);
    assert.equal(eng.typeCheck, true);
    eng.setCompatibilityMode(true);
    assert.equal(eng.typeCheck, false);
    assert.equal(eng.setTypeCheck(true), false);
    eng.setCompatibilityMode(false);
    assert.equal(eng.setTypeCheck(true), true);
    assert.equal(eng.setTypeCheck(false), true);
  });

  test("register APIs + getRegisteredType + export", () => {
    const eng = new XaiopEngine();
    assert.equal(eng.registerType("data.fork", "string"), true);
    assert.equal(eng.registerType("data.fork", TYPE.INT), false);
    assert.equal(eng.registerTypeDeny("data.bad", TYPE.STRING), true);
    eng.registerTypes({ "data.n": TYPE.INT });
    eng.registerTypes([["data.flag", TYPE.BOOL]]);
    assert.equal(eng.getRegisteredType("data.fork").type.kind, "string");
    assert.equal(eng.typeRegistry.size >= 4, true);
    const snap = eng.exportTypeSchema();
    assert.equal(snap.version, 1);
    const frame = eng.encodeTypeSchemaFrame();
    assert.ok(frame.startsWith(TYPE_SCHEMA_FRAME_PREFIX));
  });

  test("uploadSync checks when enabled; skips when off or empty registry", () => {
    const eng = new XaiopEngine();
    eng.registerType("k", TYPE.INT);
    // typeCheck off ??no check
    eng.uploadSync(`>\nk:oops\n`);
    eng.setTypeCheck(true);
    assert.throws(() => eng.uploadSync(`>\nk:oops\n`), XaiopTypeError);
    const id = eng.uploadSync(`>\nk:1\n`);
    assert.ok(eng.has(id));

    const empty = new XaiopEngine();
    empty.setTypeCheck(true);
    empty.uploadSync(`>\nk:oops\n`); // empty registry ??no-op
  });

  test("uploadJsonSync + inject* typeCheck", () => {
    const eng = new XaiopEngine();
    eng.registerType("k", TYPE.INT);
    eng.setTypeCheck(true);
    const id = eng.uploadJsonSync({ k: 1 });
    assert.throws(() => eng.uploadJsonSync({ k: "x" }), XaiopTypeError);

    eng.injectJsonSync(id, { k: 2 });
    assert.throws(() => eng.injectJsonSync(id, { k: "bad" }), XaiopTypeError);

    const id2 = eng.uploadSync(`>\nk:3\n`);
    eng.injectXaiopSync(id2, `>\nk:4\n`);
    assert.throws(() => eng.injectXaiopSync(id2, `>\nk:no\n`), XaiopTypeError);
  });

  test("nested objectType + any + onTypeViolation hook", () => {
    const eng = new XaiopEngine();
    eng.registerType("user", objectType({ name: TYPE.STRING, old: TYPE.INT }));
    eng.registerType("meta.note", TYPE.ANY);
    /** @type {string[]} */
    const hooks = [];
    eng.onTypeViolation((err) => hooks.push(err.path));
    eng.setTypeCheck(true);
    eng.uploadSync(`>
>user
name:a
old:2
>meta
note:whatever
`);
    assert.throws(() =>
      eng.uploadSync(`>
>user
name:a
old:x
`),
    );
    assert.ok(hooks.includes("user"));
    eng.onTypeViolation(null);
  });

  test("float vs int distinction on upload", () => {
    const eng = new XaiopEngine();
    eng.registerType("n", TYPE.FLOAT);
    eng.setTypeCheck(true);
    eng.uploadSync(`>\nn:1.5\n`);
    assert.throws(() => eng.uploadSync(`>\nn:1\n`), XaiopTypeError);
  });

  test("unregistered paths ignored on server", () => {
    const eng = new XaiopEngine();
    eng.registerType("only", TYPE.STRING);
    eng.setTypeCheck(true);
    eng.uploadSync(`>
only:ok
other:1
extra:true
`);
  });
});

// ---------------------------------------------------------------------------
// WS end-to-end
// ---------------------------------------------------------------------------

describe("WS typeCheck + pushTypeConsistency", () => {
  async function withPair(clientOpts = {}, hubOpts = {}) {
    const hub = await XaiopWs.listen({ port: 0, ...hubOpts });
    /** @type {import("../dist/index.js").XaiopWsConnection|null} */
    let serverConn = null;
    hub.onConnection((c) => {
      serverConn = c;
    });
    const client = await XaiopWs.connect(hub.url(), clientOpts);
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(serverConn);
    return { hub, serverConn, client };
  }

  test("happy path: schema push then int phases", async () => {
    const eng = new XaiopEngine();
    eng.registerType("k", TYPE.INT);
    eng.setTypeCheck(true);
    const { hub, serverConn, client } = await withPair({ typeCheck: true });
    assert.equal(client.typeCheck, true);
    assert.equal(serverConn.pushTypeConsistency(eng), true);
    serverConn.pushWire(`>\nk:1\n.\n`);
    serverConn.pushWire(`>\nk:2\n.\n`);
    await serverConn.end();
    const final = await client.done;
    assert.equal(final.k, 2);
    await hub.close();
  });

  test("schema mismatch rejects client done", async () => {
    const eng = new XaiopEngine();
    eng.registerType("k", TYPE.INT);
    eng.setTypeCheck(true);
    const { hub, serverConn, client } = await withPair({ typeCheck: true });
    serverConn.pushTypeConsistency(eng);
    serverConn.pushWire(`>\nk:1\n.\n`);
    serverConn.pushWire(`>\nk:oops\n.\n`);
    await serverConn.end();
    await assert.rejects(() => client.done, XaiopTypeError);
    await hub.close();
  });

  test("client freeze without schema still enforces consistency", async () => {
    const { hub, serverConn, client } = await withPair({ typeCheck: true });
    serverConn.pushWire(`>\nk:1\n.\n`);
    serverConn.pushWire(`>\nk:oops\n.\n`);
    await serverConn.end();
    await assert.rejects(() => client.done, XaiopTypeError);
    await hub.close();
  });

  test("client without typeCheck accepts mixed types", async () => {
    const { hub, serverConn, client } = await withPair({});
    assert.equal(client.typeCheck, false);
    serverConn.pushWire(`>\nk:1\n.\n`);
    serverConn.pushWire(`>\nk:oops\n.\n`);
    await serverConn.end();
    const final = await client.done;
    assert.equal(final.k, "oops");
    await hub.close();
  });

  test("pushTypeConsistency accepts TypeRegistry and snapshot", async () => {
    const { hub, serverConn, client } = await withPair({ typeCheck: true });
    const reg = new TypeRegistry();
    reg.register("k", TYPE.STRING);
    assert.equal(serverConn.pushTypeConsistency(reg), true);
    assert.equal(serverConn.pushTypeConsistency(reg.snapshot()), true);
    serverConn.pushWire(`>\nk:hi\n.\n`);
    await serverConn.end();
    assert.equal((await client.done).k, "hi");
    await hub.close();
  });

  test("pushTypeConsistency guards", async () => {
    const { hub, serverConn, client } = await withPair({});
    const empty = new XaiopEngine();
    empty.setTypeCheck(true);
    assert.throws(() => serverConn.pushTypeConsistency(empty));
    empty.registerType("x", TYPE.STRING);
    empty.setTypeCheck(false);
    assert.throws(() => serverConn.pushTypeConsistency(empty));
    assert.throws(() => serverConn.pushTypeConsistency(null));
    assert.throws(() => serverConn.pushTypeConsistency({ version: 1, entries: [] }));
    empty.setTypeCheck(true);
    assert.equal(serverConn.pushTypeConsistency(empty), true);
    await client.end();
    await hub.close();

    const { hub: hub2, serverConn: sc2, client: c2 } = await withPair(
      {},
      { compatibilityMode: true },
    );
    const eng = new XaiopEngine();
    eng.registerType("x", TYPE.STRING);
    eng.setTypeCheck(true);
    assert.throws(() => sc2.pushTypeConsistency(eng));
    await c2.end();
    await hub2.close();
  });

  test("typeCheck option ignored when compatibilityMode on connect", async () => {
    const { hub, client } = await withPair({
      typeCheck: true,
      compatibilityMode: true,
    });
    assert.equal(client.typeCheck, false);
    await client.end();
    await hub.close();
  });

  test("array homogeneity over WS phases", async () => {
    const { hub, serverConn, client } = await withPair({ typeCheck: true });
    serverConn.pushWire(`>
>items-
:1
:2
.
`);
    serverConn.pushWire(`>
>items-
:x
.
`);
    await serverConn.end();
    await assert.rejects(() => client.done, XaiopTypeError);
    await hub.close();
  });

  test("null content does not break freeze over WS", async () => {
    const { hub, serverConn, client } = await withPair({ typeCheck: true });
    serverConn.pushWire(`>\nk:1\n.\n`);
    serverConn.pushWire(`>\nk:null\n.\n`);
    serverConn.pushWire(`>\nk:2\n.\n`);
    await serverConn.end();
    const final = await client.done;
    assert.equal(final.k, 2);
    await hub.close();
  });

  test("preloaded typeSchema on connect", async () => {
    const reg = new TypeRegistry();
    reg.register("k", TYPE.INT);
    const { hub, serverConn, client } = await withPair({
      typeCheck: true,
      typeSchema: reg.snapshot(),
    });
    serverConn.pushWire(`>\nk:oops\n.\n`);
    await serverConn.end();
    await assert.rejects(() => client.done, XaiopTypeError);
    await hub.close();
  });

  test("object shape schema over WS", async () => {
    const eng = new XaiopEngine();
    eng.registerType("user", objectType({ name: TYPE.STRING, age: TYPE.INT }));
    eng.setTypeCheck(true);
    const { hub, serverConn, client } = await withPair({ typeCheck: true });
    serverConn.pushTypeConsistency(eng);
    serverConn.pushWire(`>
>user
name:a
age:1
.
`);
    await serverConn.end();
    assert.equal((await client.done).user.name, "a");
    await hub.close();
  });

  test("pushTypeConsistency when socket closed returns false", async () => {
    const { hub, serverConn, client } = await withPair({});
    await serverConn.end();
    await client.closed;
    const eng = new XaiopEngine();
    eng.registerType("x", TYPE.STRING);
    eng.setTypeCheck(true);
    assert.equal(serverConn.pushTypeConsistency(eng), false);
    await hub.close();
  });
});

// ---------------------------------------------------------------------------
// XaiopStream typeCheck (HTTP-less RAW via push is not available; use WS transport)
// ---------------------------------------------------------------------------

describe("XaiopStream typeCheck option", () => {
  test("constructor enables type session only in strict mode", async () => {
    const { XaiopStream } = await import("../dist/index.js");
    const s1 = new XaiopStream("http://127.0.0.1:9/x", { typeCheck: true });
    assert.equal(s1._typeCheck, true);
    assert.ok(s1._typeSession);
    const s2 = new XaiopStream("http://127.0.0.1:9/x", {
      typeCheck: true,
      compatibilityMode: true,
    });
    assert.equal(s2._typeCheck, false);
    assert.equal(s2._typeSession, null);
  });
});

describe("registerMany polarity batch deny", () => {
  test("registerMany with polarity deny", () => {
    const reg = new TypeRegistry();
    const { ok } = reg.registerMany({ a: TYPE.STRING, b: TYPE.INT }, { polarity: "deny" });
    assert.equal(ok.length, 2);
    assert.equal(reg.get("a").polarity, "deny");
    const checker = new TypeChecker(reg);
    assert.throws(() => checker.checkTree({ a: "x" }), XaiopTypeError);
    checker.checkTree({ a: 1, b: true });
  });
});

describe("async engine upload with typeCheck", () => {
  test("upload / inject async paths", async () => {
    const eng = new XaiopEngine();
    eng.registerType("k", TYPE.INT);
    eng.setTypeCheck(true);
    const id = await eng.upload(`>\nk:1\n`);
    await eng.uploadJson({ k: 2 });
    await eng.injectJson(id, { k: 3 });
    await assert.rejects(() => eng.upload(`>\nk:bad\n`), XaiopTypeError);
  });
});
