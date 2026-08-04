/**
 * Annotation Span (§6.5) — breadth + depth coverage.
 * Product rule: Span runs before typeCheck; handled same-level region escapes.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  SDK_VERSION,
  PROTOCOL_VERSION,
  DotCheckpointEngine,
  TypeFreezeSession,
  TYPE,
  TypeRegistry,
  applyAnnotationSpans,
  encodeAsSiblingLines,
  pathEscapesTypeCheck,
  XaiopWs,
  XaiopTypeError,
  XaiopStream,
  XaiopEngine,
  parseSync,
  LINE_KIND,
  TRANSPORT_KIND,
  STREAM_STATUS,
} from "../dist/index.js";
import {
  chunksOf,
  charChunks,
  sizedChunks,
  runRawStream,
  waitStatus,
} from "./helpers/stream.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * @param {object} [hooks]
 * @param {import("../dist/index.js").AnnotationSpanHandler|import("../dist/index.js").AnnotationSpanHandler[]} [hooks.annotationSpan]
 */
function eng(hooks = {}) {
  /** @type {Array<{ diff: unknown, meta?: { typeCheckEscapePaths?: string[] } }>} */
  const records = [];
  const engine = new DotCheckpointEngine({
    streamProcessing: true,
    compat: false,
    mergeChunkWindow: false,
    cover: false,
    ...hooks,
    onChunk: (diff, meta) => {
      records.push({ diff, meta });
      if (typeof hooks.onChunk === "function") hooks.onChunk(diff, meta);
    },
  });
  return { engine, records };
}

function schema(map) {
  const r = new TypeRegistry();
  for (const [k, t] of Object.entries(map)) r.register(k, t);
  return r;
}

// ===========================================================================
describe("annotation span — versions + exports", () => {
  test("SDK / protocol", () => {
    assert.equal(PROTOCOL_VERSION, "0.6.0");
    assert.equal(SDK_VERSION, "0.13.0");
  });

  test("helpers exported", () => {
    assert.equal(typeof applyAnnotationSpans, "function");
    assert.equal(typeof encodeAsSiblingLines, "function");
    assert.equal(typeof pathEscapesTypeCheck, "function");
  });
});

// ===========================================================================
describe("annotation span — pathEscapesTypeCheck / encodeAsSiblingLines", () => {
  test("exact, descendant, bracket, escape-all", () => {
    assert.equal(pathEscapesTypeCheck("flex", ["flex"]), true);
    assert.equal(pathEscapesTypeCheck("flex.x", ["flex"]), true);
    assert.equal(pathEscapesTypeCheck("flex[0]", ["flex"]), true);
    assert.equal(pathEscapesTypeCheck("other", ["flex"]), false);
    assert.equal(pathEscapesTypeCheck("fle", ["flex"]), false);
    assert.equal(pathEscapesTypeCheck("anything", [""]), true);
  });

  test("encodeAsSiblingLines — object strips outer >", () => {
    const lines = encodeAsSiblingLines({ a: 1, b: { c: 2 } });
    assert.ok(!lines.includes(">"));
    assert.ok(lines.some((l) => l.startsWith("a:")));
  });

  test("encodeAsSiblingLines — array root", () => {
    const lines = encodeAsSiblingLines([1, 2]);
    assert.ok(lines[0] === "-" || lines.some((l) => l === "-" || l.startsWith("-")));
  });

  test("encodeAsSiblingLines — rejects scalar", () => {
    assert.throws(() => encodeAsSiblingLines(1), TypeError);
  });
});

// ===========================================================================
describe("annotation span — applyAnnotationSpans core", () => {
  test("no handlers → identity, empty escapes", () => {
    const lines = [">", "a:1", "#x", "b:2", "."];
    const out = applyAnnotationSpans(lines, []);
    assert.deepEqual(out.lines, lines);
    assert.deepEqual(out.escapePaths, []);
  });

  test("empty capture after # still invokes handler", () => {
    let seen = null;
    const { lines, escapePaths } = applyAnnotationSpans(
      [">", "a:1", "# lone", "."],
      [
        (ann, view) => {
          seen = { ann, json: view.json };
          return undefined;
        },
      ],
    );
    assert.equal(seen.ann, " lone");
    assert.deepEqual(seen.json, {});
    assert.ok(lines.includes("# lone"));
    assert.deepEqual(escapePaths, []);
  });

  test("view template fields + nested path", () => {
    applyAnnotationSpans(
      [">", ">outer", "# note", "k:1", "<", "."],
      [
        (ann, view) => {
          assert.equal(ann, " note");
          assert.equal(view.annotationRaw, "# note");
          assert.equal(view.path, "outer");
          assert.ok(view.depth >= 1);
          assert.equal(view.json.k, 1);
          assert.equal(typeof view.jsonText, "string");
          assert.ok(view.jsonText.includes("k"));
          return null;
        },
      ],
    );
  });

  test("remount via JSON text string", () => {
    const { lines } = applyAnnotationSpans(
      [">", "# t", "a:1", "."],
      [() => '{"z":9}'],
    );
    assert.ok(!lines.some((l) => l.startsWith("#")));
    assert.ok(lines.some((l) => l.startsWith("z:")));
  });

  test("invalid remount type throws", () => {
    assert.throws(
      () =>
        applyAnnotationSpans([">", "# t", "a:1", "."], [() => 42]),
      TypeError,
    );
  });

  test("handler chain: first undefined, second wins; later skipped", () => {
    const order = [];
    const { lines } = applyAnnotationSpans([">", "#x", "a:1", "."], [
      () => {
        order.push(1);
        return undefined;
      },
      () => {
        order.push(2);
        return { a: 2 };
      },
      () => {
        order.push(3);
        return { a: 3 };
      },
    ]);
    assert.deepEqual(order, [1, 2]);
    assert.ok(lines.some((l) => l === "a:2" || l.startsWith("a:2")));
  });

  test("handler chain: null short-circuits", () => {
    const order = [];
    applyAnnotationSpans([">", "#x", "a:1", "."], [
      () => {
        order.push(1);
        return null;
      },
      () => {
        order.push(2);
        return { a: 9 };
      },
    ]);
    assert.deepEqual(order, [1]);
  });

  test("keys before # preserved; capture dropped on null", () => {
    const { lines, escapePaths } = applyAnnotationSpans(
      [">", "keep:1", "#d", "gone:2", ">n", "x:1", "<", "."],
      [() => null],
    );
    assert.ok(lines.includes("keep:1"));
    assert.equal(lines.filter((l) => l === "gone:2").length, 0);
    assert.deepEqual(escapePaths, []);
  });

  test("undefined keeps # + capture; still escapes capture keys", () => {
    const { lines, escapePaths } = applyAnnotationSpans(
      [">", "a:1", "# x", "b:2", ">c", "z:1", "<", "."],
      [() => undefined],
    );
    assert.ok(lines.includes("# x"));
    assert.ok(lines.includes("b:2"));
    assert.ok(escapePaths.includes("b"));
    assert.ok(escapePaths.includes("c"));
    assert.ok(!escapePaths.includes("a"));
  });

  test("capture stops at relocate = / @ / ! — second # can run", () => {
    const anns = [];
    const { lines } = applyAnnotationSpans(
      [">", "#one", "b:1", "@c", "c:2", "#two", "d:3", "."],
      [
        (ann) => {
          anns.push(ann.trim());
          if (ann.includes("one")) return { b: 10 };
          if (ann.includes("two")) return { d: 30 };
          return undefined;
        },
      ],
    );
    assert.deepEqual(anns, ["one", "two"]);
    assert.ok(lines.some((l) => l.startsWith("b:")));
    assert.ok(lines.some((l) => l.startsWith("@")));
    assert.ok(lines.some((l) => l.startsWith("d:")));
  });

  test("capture stops at leave < at same level", () => {
    let json = null;
    applyAnnotationSpans(
      [">", ">box", "#in", "x:1", "<", "after:2", "."],
      [
        (_a, view) => {
          json = view.json;
          return undefined;
        },
      ],
    );
    assert.deepEqual(json, { x: 1 });
  });

  test("first # swallows later same-level # into capture (no second invoke)", () => {
    const anns = [];
    applyAnnotationSpans(
      [">", "#first", "a:1", "#second", "b:2", "."],
      [
        (ann, view) => {
          anns.push(ann.trim());
          assert.equal(view.json.a, 1);
          assert.equal(view.json.b, 2);
          return undefined;
        },
      ],
    );
    assert.deepEqual(anns, ["first"]);
  });

  test("& delete line is included in capture (not a relocate stop)", () => {
    let json = null;
    const { lines } = applyAnnotationSpans(
      [">", "a:1", "#m", "b:2", "&c", "."],
      [
        (_a, view) => {
          json = view.json;
          return undefined;
        },
      ],
    );
    // & ignored by materialize; b present; & line kept on undefined
    assert.equal(json.b, 2);
    assert.ok(lines.includes("&c"));
  });

  test("drop then following same-level lines still apply (stack not advanced)", () => {
    const { lines } = applyAnnotationSpans(
      [">", "#drop", "x:1", "y:2", "."],
      [() => null],
    );
    // After drop, nothing left — but if we had post-capture lines...
    // Use relocate-separated trailing content:
    const { lines: L2 } = applyAnnotationSpans(
      [">", "#drop", "x:1", "=z", "z:9", "."],
      [() => null],
    );
    assert.ok(!L2.some((l) => l.startsWith("x:")));
    assert.ok(L2.some((l) => l.startsWith("z:") || l === "z:9"));
  });

  test("nested remount under parent path → escapePaths prefixed", () => {
    const { escapePaths } = applyAnnotationSpans(
      [">", ">p", "#t", "k:1", "<", "."],
      [() => ({ k: "str" })],
    );
    assert.ok(escapePaths.includes("p.k") || escapePaths.some((p) => p.endsWith(".k")));
  });

  test("array remount at root reports escape-all or indices", () => {
    const { escapePaths, lines } = applyAnnotationSpans(
      ["-", "#t", ":1", ":2", "."],
      [
        (_a, view) => {
          assert.ok(Array.isArray(view.json));
          assert.deepEqual(view.json, [1, 2]);
          return ["a", "b"];
        },
      ],
    );
    assert.ok(
      escapePaths.includes("") ||
        escapePaths.includes("[0]") ||
        escapePaths.length > 0,
    );
    assert.ok(lines.some((l) => l.includes("a") || l === "-"));
  });

  test("engine: array-root span remount", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan((_a, view) => {
      assert.ok(Array.isArray(view.json));
      return ["x", "y"];
    });
    engine.push(`-
# arr
:1
:2
.
`);
    engine.finish();
    assert.deepEqual(records[0].diff, ["x", "y"]);
  });
  test("ctor annotationSpan + array; count; clear; TypeError", () => {
    const { engine } = eng({
      annotationSpan: [() => undefined, () => undefined],
    });
    assert.equal(engine.annotationSpanCount, 2);
    engine.onAnnotationSpan(() => null);
    assert.equal(engine.annotationSpanCount, 3);
    engine.clearAnnotationSpans();
    assert.equal(engine.annotationSpanCount, 0);
    assert.throws(() => engine.onAnnotationSpan(/** @type {any} */ (1)), TypeError);
  });

  test("remount before Diff; keys before # intact", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan(() => ({ rewritten: true }));
    engine.push(`>
keep:1
# meta
drop:9
.
`);
    engine.finish();
    assert.equal(records[0].diff.keep, 1);
    assert.equal(records[0].diff.rewritten, true);
    assert.equal(records[0].diff.drop, undefined);
  });

  test("meta.typeCheckEscapePaths on remount", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan(() => ({ flex: "x" }));
    engine.push(`>
# s
flex:1
.
`);
    engine.finish();
    assert.ok(records[0].meta?.typeCheckEscapePaths?.includes("flex"));
  });

  test("meta.typeCheckEscapePaths on undefined keep", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan(() => undefined);
    engine.push(`>
# s
flex:1
.
`);
    engine.finish();
    assert.ok(records[0].meta?.typeCheckEscapePaths?.includes("flex"));
  });

  test("null drop → no escape meta (or empty)", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan(() => null);
    engine.push(`>
keep:1
# s
flex:1
.
`);
    engine.finish();
    const esc = records[0].meta?.typeCheckEscapePaths ?? [];
    assert.equal(esc.length, 0);
    assert.equal(records[0].diff.keep, 1);
    assert.equal(records[0].diff.flex, undefined);
  });

  test("fragmented push across # boundary", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan(() => ({ a: 7 }));
    engine.push(">\n#");
    engine.push(" tag\n");
    engine.push("a:1\n.\n");
    engine.finish();
    assert.equal(records[0].diff.a, 7);
  });

  test("multi-phase: independent spans per phase", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan((ann) => {
      if (ann.includes("p1")) return { x: 1 };
      if (ann.includes("p2")) return { y: 2 };
      return undefined;
    });
    engine.push(`>
# p1
x:0
.
>
# p2
y:0
.
`);
    engine.finish();
    assert.equal(records.length, 2);
    assert.equal(records[0].diff.x, 1);
    assert.equal(records[1].diff.y, 2);
  });

  test("mergeChunkWindow ON: spans in both phases; escapes accumulate", () => {
    /** @type {string[][]} */
    const escapes = [];
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      compat: false,
      mergeChunkWindow: true,
      onChunk: (_d, meta) => {
        escapes.push(meta?.typeCheckEscapePaths ?? []);
      },
    });
    engine.onAnnotationSpan((ann) => {
      if (ann.includes("a")) return { a: "s" };
      if (ann.includes("b")) return { b: "t" };
      return undefined;
    });
    engine.push(`>
# a
a:1
.
>
# b
b:2
.
`);
    engine.finish();
    const flat = escapes.flat();
    assert.ok(flat.includes("a"));
    assert.ok(flat.includes("b"));
  });

  test("cover mode still remounts span before cover split", () => {
    const diffs = [];
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      compat: false,
      mergeChunkWindow: false,
      cover: true,
      onChunk: (d) => diffs.push(d),
    });
    engine.onAnnotationSpan(() => ({ keep: 1, gone: 2 }));
    engine.push(`>
# c
keep:0
&gone
.
`);
    engine.finish();
    const merged = Object.assign({}, ...diffs.filter((d) => d && typeof d === "object"));
    assert.equal(merged.keep, 1);
  });

  test("historyRealtime: jumpTo rebuild still applies span", () => {
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      compat: false,
      mergeChunkWindow: false,
      historyRealtime: true,
      historySnapshot: true,
      onChunk: () => {},
    });
    engine.onAnnotationSpan(() => ({ v: 99 }));
    engine.push(`>
# h
v:1
.
>
later:1
.
`);
    engine.finish();
    assert.equal(engine.committedSnapshot.v, 99);
    assert.equal(engine.committedSnapshot.later, 1);
    assert.ok(engine.history);
    assert.ok(engine.history.canJumpTo(0));
    engine.jumpTo(0);
    assert.equal(engine.committedSnapshot.v, 99);
    assert.equal(engine.committedSnapshot.later, undefined);
  });

  test("streamProcessing false: span does not run (parity with line intercept)", () => {
    const { engine, records } = eng({ streamProcessing: false });
    engine.onAnnotationSpan(() => ({ a: 5 }));
    engine.push(`>
# x
a:1
`);
    engine.finish();
    const last = records[records.length - 1]?.diff;
    assert.ok(last);
    assert.equal(last.a, 1);
  });
});

// ===========================================================================
describe("annotation span — typeCheck escape semantics", () => {
  test("before-# keys still freeze; span keys escape (remount)", () => {
    const session = new TypeFreezeSession({ schema: schema({ keep: TYPE.INT, flex: TYPE.INT }) });
    /** @type {string[]} */
    let escapes = [];
    const { engine } = eng({
      onChunk: (diff, meta) => {
        escapes = meta?.typeCheckEscapePaths ?? [];
        session.observeTree(diff, { escapePaths: escapes });
      },
    });
    engine.onAnnotationSpan(() => ({ flex: "nope" }));
    engine.push(`>
keep:1
# s
flex:2
.
`);
    engine.finish();
    assert.ok(escapes.includes("flex"));
    assert.doesNotThrow(() =>
      session.observeTree({ keep: 1, flex: "again" }, { escapePaths: escapes }),
    );
    assert.throws(
      () => session.observeTree({ keep: "bad" }, { escapePaths: escapes }),
      XaiopTypeError,
    );
  });

  test("undefined keep: wire types may mismatch schema but escape", () => {
    const session = new TypeFreezeSession({
      schema: schema({ flex: TYPE.INT }),
    });
    const { engine } = eng({
      onChunk: (diff, meta) => {
        // Simulate "string already in tree" by remount-less keep of int,
        // then second observe with string under escape.
        session.observeTree(diff, {
          escapePaths: meta?.typeCheckEscapePaths ?? [],
        });
      },
    });
    engine.onAnnotationSpan(() => undefined);
    engine.push(`>
# s
flex:2
.
`);
    engine.finish();
    assert.doesNotThrow(() =>
      session.observeTree(
        { flex: "string-ok-when-escaped" },
        { escapePaths: ["flex"] },
      ),
    );
  });

  test("descendant escape: parent prefix skips child freeze mismatch", () => {
    const session = new TypeFreezeSession();
    session.observeTree({ box: { n: 1 } }); // freeze box.n as int
    assert.throws(
      () => session.observeTree({ box: { n: "str" } }),
      XaiopTypeError,
    );
    assert.doesNotThrow(() =>
      session.observeTree({ box: { n: "str" } }, { escapePaths: ["box"] }),
    );
  });

  test("escape-all empty string skips entire tree", () => {
    const session = new TypeFreezeSession();
    session.observeTree([1, 2], { escapePaths: [""] });
    assert.doesNotThrow(() =>
      session.observeTree(["a", "b"], { escapePaths: [""] }),
    );
  });

  test("without escapePaths, same remount value would fail schema", () => {
    const session = new TypeFreezeSession({
      schema: schema({ flex: TYPE.INT }),
    });
    assert.throws(
      () => session.observeTree({ flex: "bad" }),
      XaiopTypeError,
    );
  });
});

// ===========================================================================
describe("annotation span × line intercept combinations", () => {
  test("lineIntercept skips # → span never sees it", () => {
    let spanCalls = 0;
    const { engine, records } = eng();
    engine.onLineIntercept(({ view }) =>
      view.kind === LINE_KIND.ANNOTATION ? null : undefined,
    );
    engine.onAnnotationSpan(() => {
      spanCalls += 1;
      return { x: 9 };
    });
    engine.push(`>
# hidden
x:1
.
`);
    engine.finish();
    assert.equal(spanCalls, 0);
    assert.equal(records[0].diff.x, 1);
  });

  test("lineIntercept rewrites content; span remounts capture", () => {
    const { engine, records } = eng();
    engine.onLineIntercept(({ view }) =>
      view.kind === LINE_KIND.CONTENT && view.key === "x" ? "x:42" : undefined,
    );
    engine.onAnnotationSpan((_a, view) => {
      assert.equal(view.json.x, 42);
      return { x: 100 };
    });
    engine.push(`>
# s
x:1
.
`);
    engine.finish();
    assert.equal(records[0].diff.x, 100);
  });

  test("lineIntercept rewrites # text; span sees new annotation", () => {
    let seen = "";
    const { engine } = eng();
    engine.onLineIntercept(({ raw }) =>
      raw.startsWith("#") ? "#rewritten" : undefined,
    );
    engine.onAnnotationSpan((ann) => {
      seen = ann;
      return undefined;
    });
    engine.push(`>
# original
a:1
.
`);
    engine.finish();
    assert.equal(seen, "rewritten");
  });
});

// ===========================================================================
describe("annotation span — XaiopStream RAW", () => {
  test("stream option annotationSpan remount", async () => {
    const source = `>
a:1
# t
b:2
.
`;
    const { done, chunks } = await runRawStream(source, chunksOf(source), {
      annotationSpan: () => ({ b: 99 }),
      mergeChunkWindow: false,
      typeCheck: false,
    });
    assert.equal(done.a, 1);
    assert.equal(done.b, 99);
    assert.ok(chunks.length >= 1);
  });

  test("char-chunked wire + span", async () => {
    const source = `>
# c
v:1
.
`;
    const { done } = await runRawStream(source, charChunks(source), {
      annotationSpan: () => ({ v: 8 }),
      mergeChunkWindow: false,
    });
    assert.equal(done.v, 8);
  });

  test("sized chunks + span + typeCheck escape", async () => {
    const source = `>
ok:1
# s
flex:2
.
`;
    const reg = schema({ ok: TYPE.INT, flex: TYPE.INT });
    const { done } = await runRawStream(source, sizedChunks(source, 3), {
      annotationSpan: () => ({ flex: "escaped" }),
      typeCheck: true,
      typeSchema: reg,
      mergeChunkWindow: false,
    });
    assert.equal(done.ok, 1);
    assert.equal(done.flex, "escaped");
  });

  test("onAnnotationSpan after construct, before send", async () => {
    const source = `>
# z
a:1
.
`;
    const stream = new XaiopStream("raw://late", {
      mergeChunkWindow: false,
    });
    stream.onAnnotationSpan(() => ({ a: 3 }));
    /** @type {unknown} */
    let done;
    stream.onDone((j) => {
      done = j;
    });
    stream.onError((e) => {
      throw e;
    });
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(source),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.equal(done.a, 3);
  });
});

// ===========================================================================
describe("annotation span — WS surfaces + hard combos", () => {
  test("connect annotationSpan remount + typeCheck", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      hub.onConnection(async (conn) => {
        conn.pushWire(`>
ok:1
# note
weird:2
.
`);
        await conn.end();
      });
      const client = await XaiopWs.connect(hub.url(), {
        typeCheck: true,
        typeSchema: schema({ ok: TYPE.INT, weird: TYPE.INT }),
        annotationSpan: () => ({ weird: "escaped-string" }),
      });
      const json = await client.done;
      assert.equal(json.ok, 1);
      assert.equal(json.weird, "escaped-string");
    } finally {
      await hub.close();
    }
  });

  test("multi-phase WS: escape accumulates; early key still checked", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      hub.onConnection(async (conn) => {
        conn.pushWire(`>
ok:1
# p1
flex:1
.
`);
        conn.pushWire(`>
ok:2
# p2
flex:2
.
`);
        await conn.end();
      });
      const client = await XaiopWs.connect(hub.url(), {
        typeCheck: true,
        typeSchema: schema({ ok: TYPE.INT, flex: TYPE.INT }),
        annotationSpan: () => ({ flex: "s" }),
        mergeChunkWindow: false,
      });
      const json = await client.done;
      assert.equal(json.ok, 2);
      assert.equal(json.flex, "s");
    } finally {
      await hub.close();
    }
  });

  test("WS: non-escaped key type violation still fails", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      hub.onConnection(async (conn) => {
        conn.pushWire(`>
ok:1
.
`);
        conn.pushWire(`>
ok:oops
.
`);
        await conn.end();
      });
      const client = await XaiopWs.connect(hub.url(), {
        typeCheck: true,
        typeSchema: schema({ ok: TYPE.INT }),
        annotationSpan: () => undefined, // registered but no # → no escape
      });
      let err = null;
      try {
        await client.done;
      } catch (e) {
        err = e;
      }
      assert.ok(err instanceof XaiopTypeError || err);
    } finally {
      await hub.close();
    }
  });

  test("WS: lineIntercept + annotationSpan + typeCheck together", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      hub.onConnection(async (conn) => {
        conn.pushWire(`>
ok:1
# tag
raw:2
skip:9
.
`);
        await conn.end();
      });
      const client = await XaiopWs.connect(hub.url(), {
        typeCheck: true,
        typeSchema: schema({ ok: TYPE.INT, raw: TYPE.INT }),
        lineIntercept: ({ view }) =>
          view.key === "skip" ? null : undefined,
        annotationSpan: (_a, view) => {
          assert.equal(view.json.skip, undefined);
          assert.equal(view.json.raw, 2);
          return { raw: "escaped" };
        },
      });
      const json = await client.done;
      assert.equal(json.ok, 1);
      assert.equal(json.raw, "escaped");
      assert.equal(json.skip, undefined);
    } finally {
      await hub.close();
    }
  });

  test("WS: onAnnotationSpan after connect is locked; use connect options", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      /** @type {import("../dist/index.js").XaiopWsConnection|null} */
      let serverConn = null;
      hub.onConnection((conn) => {
        serverConn = conn;
      });
      const client = await XaiopWs.connect(hub.url(), {
        mergeChunkWindow: false,
        annotationSpan: () => ({ late: true }),
      });
      assert.equal(client.handlersLocked, true);
      assert.throws(() => client.onAnnotationSpan(() => ({ x: 1 })), /locked/);
      for (let i = 0; i < 50 && !serverConn; i++) {
        await new Promise((r) => setTimeout(r, 5));
      }
      assert.ok(serverConn);
      serverConn.pushWire(`>
# x
late:0
.
`);
      await serverConn.end();
      const json = await client.done;
      assert.equal(json.late, true);
    } finally {
      await hub.close();
    }
  });

  test("WS: null drop span removes capture from commit", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      hub.onConnection(async (conn) => {
        conn.pushWire(`>
keep:1
# dropme
secret:99
.
`);
        await conn.end();
      });
      const client = await XaiopWs.connect(hub.url(), {
        annotationSpan: () => null,
      });
      const json = await client.done;
      assert.equal(json.keep, 1);
      assert.equal(json.secret, undefined);
    } finally {
      await hub.close();
    }
  });

  test("WS: relocate-separated dual spans in one phase", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      hub.onConnection(async (conn) => {
        // #one capture ends at @b; #two runs under created b
        conn.pushWire(`>
#one
a:0
@b
#two
c:0
.
`);
        await conn.end();
      });
      const client = await XaiopWs.connect(hub.url(), {
        annotationSpan: (ann) => {
          if (ann.includes("one")) return { a: 1 };
          if (ann.includes("two")) return { c: 3 };
          return undefined;
        },
      });
      const json = await client.done;
      assert.equal(json.a, 1);
      assert.equal(json.b.c, 3);
    } finally {
      await hub.close();
    }
  });
});

// ===========================================================================
describe("annotation span — nested / array / empty / stress", () => {
  test("deep nest remount", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan((_a, view) => {
      assert.equal(view.json.leaf, 1);
      return { leaf: 2, extra: true };
    });
    engine.push(`>
>a
>b
# deep
leaf:1
<
<
.
`);
    engine.finish();
    assert.equal(records[0].diff.a.b.leaf, 2);
    assert.equal(records[0].diff.a.b.extra, true);
  });

  test("empty annotation # alone with remount", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan((ann) => {
      assert.equal(ann, "");
      return { e: 1 };
    });
    engine.push(`>
#
e:0
.
`);
    engine.finish();
    assert.equal(records[0].diff.e, 1);
  });

  test("multiple handlers via ctor array order", () => {
    const { engine, records } = eng({
      annotationSpan: [
        () => undefined,
        () => ({ hit: 2 }),
        () => ({ hit: 3 }),
      ],
    });
    engine.push(`>
# x
hit:0
.
`);
    engine.finish();
    assert.equal(records[0].diff.hit, 2);
  });

  test("content key:null inside capture is real null, not drop", () => {
    let json = null;
    applyAnnotationSpans([">", "#t", "k:null", "."], [
      (_a, view) => {
        json = view.json;
        return undefined;
      },
    ]);
    assert.equal(json.k, null);
  });

  test("pushAsync coalescing + span", async () => {
    const records = [];
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      compat: false,
      mergeChunkWindow: true,
      onChunk: (d, meta) => records.push({ d, meta }),
    });
    engine.onAnnotationSpan(() => ({ a: 11 }));
    await engine.pushAsync(`>
# x
a:1
.
`);
    await engine.finishAsync();
    assert.ok(records.length >= 1);
    assert.equal(records[0].d.a, 11);
  });

  test("clearAnnotationSpans mid-stream: later # not processed", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan(() => ({ a: 9 }));
    engine.push(`>
# first
a:0
.
`);
    engine.clearAnnotationSpans();
    engine.push(`>
# second
b:0
.
`);
    engine.finish();
    assert.equal(records[0].diff.a, 9);
    assert.equal(records[1].diff.b, 0);
    assert.equal(records[1].diff.a, undefined);
  });

  test("capture stops at ! broadcast", () => {
    const anns = [];
    applyAnnotationSpans(
      [">", "#one", "a:1", "!b", "b:2", "#two", "c:3", "."],
      [
        (ann) => {
          anns.push(ann.trim());
          return undefined;
        },
      ],
    );
    assert.deepEqual(anns, ["one", "two"]);
  });

  test("emitDiff false: span still mutates commit; chunk null", () => {
    const { engine, records } = eng({ emitDiff: false });
    engine.onAnnotationSpan(() => ({ a: 7 }));
    engine.push(`>
# x
a:1
.
`);
    engine.finish();
    assert.equal(records[0].diff, null);
    assert.equal(engine.committedSnapshot.a, 7);
  });

  test("WS typeCheck freeze-only (no schema): escaped key can change type", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      hub.onConnection(async (conn) => {
        conn.pushWire(`>
flex:1
.
`);
        conn.pushWire(`>
# s
flex:2
.
`);
        await conn.end();
      });
      const client = await XaiopWs.connect(hub.url(), {
        typeCheck: true,
        mergeChunkWindow: false,
        annotationSpan: () => ({ flex: "now-string" }),
      });
      const json = await client.done;
      assert.equal(json.flex, "now-string");
    } finally {
      await hub.close();
    }
  });

  test("compatibilityMode + annotationSpan still remounts", async () => {
    const source = `>
# c
a:1
.
`;
    const { done } = await runRawStream(source, chunksOf(source), {
      compatibilityMode: true,
      annotationSpan: () => ({ a: 4 }),
      mergeChunkWindow: false,
    });
    assert.equal(done.a, 4);
  });
});

// ===========================================================================
// 坑：协议「自定义注解传递」# × SDK Annotation Span（应用层自定义小协议）
// 协议：# 无树副作用；Span：可消费同一行并改树 / 逃逸 typeCheck
// ===========================================================================
describe("pitfalls — custom annotation protocol (#) × Annotation Span", () => {
  /**
   * Mini custom protocol over # lines:
   *   #xaiop/v1 <op> [json]
   * ops: ignore | drop | set | patch | tag
   */
  function customProtoHandler(ann, view) {
    const t = ann.trim();
    if (!t.startsWith("xaiop/v1")) return undefined;
    const rest = t.slice("xaiop/v1".length).trim();
    const sp = rest.indexOf(" ");
    const op = sp < 0 ? rest : rest.slice(0, sp);
    const arg = sp < 0 ? "" : rest.slice(sp + 1).trim();
    if (op === "ignore") return undefined;
    if (op === "drop") return null;
    if (op === "set") return JSON.parse(arg || "{}");
    if (op === "patch") {
      const patch = JSON.parse(arg || "{}");
      return { ...view.json, ...patch };
    }
    if (op === "tag") {
      return { ...view.json, _tag: arg || "tagged" };
    }
    return undefined;
  }

  test("PIT: same wire — protocol ignore vs Span remount diverge", () => {
    const wire = `>
#xaiop/v1 set {"secret":99}
visible:1
.
`;
    const plain = eng();
    plain.engine.push(wire);
    plain.engine.finish();
    // no Span → # ignored; "visible" + no secret key from annotation text
    assert.equal(plain.records[0].diff.visible, 1);
    assert.equal(plain.records[0].diff.secret, undefined);

    const withSpan = eng();
    withSpan.engine.onAnnotationSpan(customProtoHandler);
    withSpan.engine.push(wire);
    withSpan.engine.finish();
    // Span remount replaces capture (visible) with {secret:99}
    assert.equal(withSpan.records[0].diff.secret, 99);
    assert.equal(withSpan.records[0].diff.visible, undefined);
  });

  test("PIT: # before payload swallows following siblings (drop wipes data)", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan(customProtoHandler);
    engine.push(`>
keep:1
#xaiop/v1 drop
wiped:2
also:3
.
`);
    engine.finish();
    assert.equal(records[0].diff.keep, 1);
    assert.equal(records[0].diff.wiped, undefined);
    assert.equal(records[0].diff.also, undefined);
  });

  test("PIT: bare # / ignore-op still escapes following keys for typeCheck", () => {
    /** @type {string[]} */
    let escapes = [];
    const session = new TypeFreezeSession({
      schema: schema({ keep: TYPE.INT, flex: TYPE.INT }),
    });
    const { engine } = eng({
      onChunk: (diff, meta) => {
        escapes = meta?.typeCheckEscapePaths ?? [];
        session.observeTree(diff, { escapePaths: escapes });
      },
    });
    engine.onAnnotationSpan(customProtoHandler);
    engine.push(`>
keep:1
#xaiop/v1 ignore
flex:2
.
`);
    engine.finish();
    // ignore → keep wire, but flex still escaped
    assert.ok(escapes.includes("flex"));
    assert.doesNotThrow(() =>
      session.observeTree({ keep: 1, flex: "str" }, { escapePaths: escapes }),
    );
    assert.throws(
      () => session.observeTree({ keep: "bad" }, { escapePaths: escapes }),
      XaiopTypeError,
    );
  });

  test("PIT: Content value with # is NOT custom annotation — Span never fires", () => {
    let calls = 0;
    const { engine, records } = eng();
    engine.onAnnotationSpan(() => {
      calls += 1;
      return { hijacked: true };
    });
    engine.push(`>
cmd:#run-now
note:#not-a-line
.
`);
    engine.finish();
    assert.equal(calls, 0);
    assert.equal(records[0].diff.cmd, "#run-now");
    assert.equal(records[0].diff.note, "#not-a-line");
  });

  test("PIT: leading whitespace before # is not annotation (may become Content if ':' present)", () => {
    let spanCalls = 0;
    const { engine, records } = eng();
    engine.onAnnotationSpan(() => {
      spanCalls += 1;
      return { x: 1 };
    });
    // Space + # + payload containing ':' → Content key, NOT custom annotation, Span silent
    engine.push(`>
 #xaiop/v1 set {"x":1}
.
`);
    engine.finish();
    assert.equal(spanCalls, 0);
    assert.equal(records[0].diff.x, undefined);
    const keys = Object.keys(records[0].diff);
    assert.ok(keys.some((k) => k.includes("#") || k.trimStart().startsWith("#")));

    // Without ':' → bare/illegal under parseSync (protocol)
    assert.throws(() => parseSync(`>\n #bare\n`));
  });
  test("custom proto: patch merges capture JSON; set replaces", () => {
    const { engine, records } = eng();
    engine.onAnnotationSpan(customProtoHandler);
    engine.push(`>
#xaiop/v1 patch {"role":"sys"}
msg:hi
n:1
.
`);
    engine.finish();
    assert.equal(records[0].diff.msg, "hi");
    assert.equal(records[0].diff.n, 1);
    assert.equal(records[0].diff.role, "sys");
  });

  test("custom proto: limit capture with @ so typed keys stay before framing", () => {
    /** @type {string[]} */
    let escapes = [];
    const session = new TypeFreezeSession({
      schema: schema({ id: TYPE.INT }),
    });
    const { engine, records } = eng({
      onChunk: (diff, meta) => {
        escapes = meta?.typeCheckEscapePaths ?? [];
        session.observeTree(diff, { escapePaths: escapes });
      },
    });
    engine.onAnnotationSpan(customProtoHandler);
    // id before @body/# stays type-checked; Span runs inside body
    engine.push(`>
id:1
@body
#xaiop/v1 tag loose
text:hello
.
`);
    engine.finish();
    assert.equal(records[0].diff.id, 1);
    assert.equal(records[0].diff.body.text, "hello");
    assert.equal(records[0].diff.body._tag, "loose");
    assert.ok(!escapes.includes("id"));
    assert.ok(
      escapes.some((p) => p === "body" || p.startsWith("body.") || p.endsWith("text") || p.includes("_tag")),
    );
  });

  test("PIT: leading # before > swallows whole phase (later # commands never run)", () => {
    const ops = [];
    const { engine, records } = eng();
    engine.onAnnotationSpan((ann, view) => {
      ops.push(ann.trim());
      return customProtoHandler(ann, view);
    });
    engine.push(`#xaiop/v1 session=demo
>
id:1
#xaiop/v1 patch {"role":"assistant"}
text:hi
.
`);
    engine.finish();
    // Only the first # is invoked; patch line is inside its capture
    assert.deepEqual(ops, ["xaiop/v1 session=demo"]);
    assert.equal(records[0].diff.id, 1);
    assert.equal(records[0].diff.role, undefined);
    assert.equal(records[0].diff.text, "hi");
  });

  test("custom proto: multi-command stream with @ separators", () => {
    const ops = [];
    const { engine, records } = eng();
    engine.onAnnotationSpan((ann, view) => {
      const r = customProtoHandler(ann, view);
      ops.push(ann.trim());
      return r;
    });
    engine.push(`>
#xaiop/v1 set {"a":1}
@b
#xaiop/v1 set {"c":3}
.
`);
    engine.finish();
    assert.deepEqual(ops, ["xaiop/v1 set {\"a\":1}", "xaiop/v1 set {\"c\":3}"]);
    assert.equal(records[0].diff.a, 1);
    assert.equal(records[0].diff.b.c, 3);
  });

  test("custom proto: JSON blob entirely inside annotation text (empty capture)", () => {
    let seen = null;
    const { engine, records } = eng();
    engine.onAnnotationSpan((ann, view) => {
      seen = { ann: ann.trim(), json: view.json };
      if (ann.includes("{")) {
        const i = ann.indexOf("{");
        return JSON.parse(ann.slice(i));
      }
      return undefined;
    });
    engine.push(`>
#{"op":"inject","v":42}
.
`);
    engine.finish();
    assert.deepEqual(seen.json, {});
    assert.equal(records[0].diff.op, "inject");
    assert.equal(records[0].diff.v, 42);
  });

  test("PIT: # after . is first line of next phase — swallows later # in that phase", () => {
    const anns = [];
    const { engine, records } = eng();
    engine.onAnnotationSpan((ann) => {
      anns.push(ann.trim());
      return undefined;
    });
    engine.push(`>
#xaiop/v1 tag p1
a:1
.
# between-phases-becomes-next-phase-head
>
#xaiop/v1 tag p2
b:2
.
`);
    engine.finish();
    // Second phase starts with framing # → only that Span runs; tag p2 is captured, not invoked
    assert.deepEqual(anns, [
      "xaiop/v1 tag p1",
      "between-phases-becomes-next-phase-head",
    ]);
    assert.equal(records[0].diff.a, 1);
    assert.equal(records[1].diff.b, 2);
  });

  test("WS: peer custom-protocol # after keep keys (safe framing)", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      hub.onConnection(async (conn) => {
        conn.pushWire(`>
id:1
#xaiop/v1 patch {"role":"assistant"}
text:hello
.
`);
        await conn.end();
      });
      const client = await XaiopWs.connect(hub.url(), {
        typeCheck: true,
        typeSchema: schema({
          id: TYPE.INT,
          text: TYPE.STRING,
          role: TYPE.STRING,
        }),
        annotationSpan: customProtoHandler,
      });
      const json = await client.done;
      assert.equal(json.id, 1);
      assert.equal(json.text, "hello");
      assert.equal(json.role, "assistant");
    } finally {
      await hub.close();
    }
  });
  test("WS PIT: custom # header before fields + drop → empty commit keys", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      hub.onConnection(async (conn) => {
        conn.pushWire(`>
#xaiop/v1 drop
should:go
.
`);
        await conn.end();
      });
      const client = await XaiopWs.connect(hub.url(), {
        annotationSpan: customProtoHandler,
      });
      const json = await client.done;
      assert.deepEqual(json, {});
    } finally {
      await hub.close();
    }
  });

  test("lineIntercept can rewrite custom-proto # before Span sees it", () => {
    let seen = "";
    const { engine, records } = eng();
    engine.onLineIntercept(({ raw }) =>
      raw === "#xaiop/v1 drop" ? "#xaiop/v1 tag rescued" : undefined,
    );
    engine.onAnnotationSpan((ann, view) => {
      seen = ann.trim();
      return customProtoHandler(ann, view);
    });
    engine.push(`>
#xaiop/v1 drop
k:1
.
`);
    engine.finish();
    assert.equal(seen, "xaiop/v1 tag rescued");
    assert.equal(records[0].diff.k, 1);
    assert.equal(records[0].diff._tag, "rescued");
  });

  test("parseSync / engine upload: # custom annotation still tree-noop without Span", () => {
    const v = parseSync(`>
#xaiop/v1 set {"never":1}
k:2
`);
    assert.deepEqual(v, { k: 2 });
    const e = new XaiopEngine();
    const id = e.uploadSync(`#xaiop/v1 session
>
z:9
`);
    assert.deepEqual(e.getSync(id), { z: 9 });
  });
});
