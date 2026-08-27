import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DotCheckpointEngine,
  parseSync,
  PROTOCOL_VERSION,
  SDK_VERSION,
  XaiopSyntaxError,
  encodeSync,
  LiveXaiopParser,
} from "../dist/index.js";

/** @param {string[]} lines */
function wire(...lines) {
  return lines.join("\n");
}

describe("amp.delete ??versions", () => {
  test("protocol 0.7.0 / SDK 0.16.0", () => {
    assert.equal(PROTOCOL_VERSION, "0.7.0");
    assert.equal(SDK_VERSION, "0.16.0");
  });
});

describe("amp.delete ??core delete semantics", () => {
  test("deletes key; Cursor unchanged; later write is create", () => {
    const json = parseSync(wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3"));
    assert.deepEqual(json, { b: { y: 2, z: 3 } });
  });

  test("nested deepest key only; siblings kept", () => {
    const json = parseSync(
      wire(">", ">a", ">b", "x:1", "y:2", ".", ">c", "z:1", "&a>b", "keep:9"),
    );
    assert.deepEqual(json, { a: {}, c: { z: 1, keep: 9 } });
  });

  test("deleting nested path leaves parent object empty but present", () => {
    const json = parseSync(wire(">", ">a", ">b", "x:1", ".", ">keep", "v:1", "&a>b"));
    assert.deepEqual(json, { a: {}, keep: { v: 1 } });
  });

  test("missing key is silent no-op", () => {
    const json = parseSync(wire(">", ">a", "x:1", "&missing"));
    assert.deepEqual(json, { a: { x: 1 } });
  });

  test("missing nested mid-segment is no-op", () => {
    const json = parseSync(wire(">", ">a", "x:1", "&a>nope>z"));
    assert.deepEqual(json, { a: { x: 1 } });
  });

  test("& before any tree is no-op (docKind none)", () => {
    const json = parseSync(wire("&ghost", ">", "x:1"));
    assert.deepEqual(json, { x: 1 });
  });

  test("delete then recreate same address is fresh object", () => {
    const json = parseSync(
      wire(">", ">a", "old:1", ".", ">b", "t:1", "&a", ".", ">a", "new:2"),
    );
    assert.deepEqual(json, { b: { t: 1 }, a: { new: 2 } });
    assert.equal(/** @type {any} */ (json).a.old, undefined);
  });

  test("does not move Cursor: Content after & still writes at prior Cursor", () => {
    // Cursor at b when &a; z:3 must land on b, not root
    const json = parseSync(wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3"));
    assert.deepEqual(json, { b: { y: 2, z: 3 } });
    assert.equal(/** @type {any} */ (json).z, undefined);
  });

  test("multiple non-consecutive & across phases", () => {
    const json = parseSync(
      wire(
        ">",
        ">a",
        "x:1",
        ".",
        ">b",
        "y:1",
        ".",
        ">c",
        "z:1",
        "&a",
        ".",
        ">d",
        "w:1",
        "&b",
      ),
    );
    assert.deepEqual(json, { c: { z: 1 }, d: { w: 1 } });
  });

  test("consecutive & delete several keys", () => {
    const json = parseSync(
      wire(">", ">a", "x:1", ".", ">b", "y:1", ".", ">c", "z:1", "&a", "&b"),
    );
    assert.deepEqual(json, { c: { z: 1 } });
  });
});

describe("amp.delete ??arrays", () => {
  test("deletes whole named array", () => {
    const json = parseSync(
      wire(">", ">items-", ":1", ":2", ".", ">keep", "v:1", "&items"),
    );
    assert.deepEqual(json, { keep: { v: 1 } });
  });

  test("after deleting array, >name- creates a new empty array", () => {
    const json = parseSync(
      wire(">", ">items-", ":1", ".", ">k", "v:1", "&items", ".", ">items-", ":9"),
    );
    assert.deepEqual(json, { k: { v: 1 }, items: [9] });
  });

  test("array-index-like path does not delete elements (no-op; array intact)", () => {
    const json = parseSync(
      wire(">", ">items-", ":1", ":2", ".", ">k", "v:1", "&items>0"),
    );
    // No index addressing: cannot descend into array by name ??no-op
    assert.deepEqual(json, { items: [1, 2], k: { v: 1 } });
  });

  test("&items still deletes the whole array (not an element)", () => {
    const json = parseSync(
      wire(">", ">items-", ":1", ":2", ".", ">k", "v:1", "&items"),
    );
    assert.deepEqual(json, { k: { v: 1 } });
  });
});

describe("amp.delete ??document root constraints", () => {
  test("bare & is syntax error", () => {
    assert.throws(
      () => parseSync(wire(">", "&")),
      (e) =>
        e instanceof XaiopSyntaxError &&
        /empty & path|not an array element/.test(e.message),
    );
  });

  test("invalid path forms rejected", () => {
    for (const bad of ["&", "&>a", "&a>", "&a>>b", "&a> >b"]) {
      assert.throws(
        () => parseSync(wire(">", "x:1", bad)),
        (e) => e instanceof XaiopSyntaxError,
        bad,
      );
    }
  });

  test("fragment root rejects &", () => {
    assert.throws(
      () => parseSync(wire(">a", "x:1", "&a")),
      (e) =>
        e instanceof XaiopSyntaxError && /object document root/.test(e.message),
    );
  });

  test("array root rejects &", () => {
    assert.throws(
      () => parseSync(wire("-", ":1", "&a")),
      (e) =>
        e instanceof XaiopSyntaxError && /object document root/.test(e.message),
    );
  });

  test("& does not create nodes (unlike @)", () => {
    const json = parseSync(wire(">", "x:1", "&new>child"));
    assert.deepEqual(json, { x: 1 });
    assert.equal(/** @type {any} */ (json).new, undefined);
  });
});

describe("amp.delete ??Cursor chain", () => {
  test("deleting current Cursor node errors", () => {
    assert.throws(
      () => parseSync(wire(">", ">a", "x:1", "&a")),
      (e) => e instanceof XaiopSyntaxError && /Cursor chain/.test(e.message),
    );
  });

  test("deleting ancestor on Cursor chain errors", () => {
    assert.throws(
      () => parseSync(wire(">", ">a", ">b", "x:1", "&a")),
      (e) => e instanceof XaiopSyntaxError && /Cursor chain/.test(e.message),
    );
  });

  test("deleting sibling of Cursor is ok", () => {
    const json = parseSync(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a"));
    assert.deepEqual(json, { b: { y: 1 } });
  });

  test("deleting nested key under sibling is ok while Cursor elsewhere", () => {
    const json = parseSync(
      wire(">", ">a", ">b", "x:1", ".", ">c", "y:1", "&a>b"),
    );
    assert.deepEqual(json, { a: {}, c: { y: 1 } });
  });

  test("@ then & of that path while still inside errors", () => {
    assert.throws(
      () => parseSync(wire(">", "@a>b", "x:1", "&a>b")),
      (e) => e instanceof XaiopSyntaxError && /Cursor chain/.test(e.message),
    );
  });

  test(". then & of prior path is ok (Cursor at Root)", () => {
    const json = parseSync(wire(">", ">a", "x:1", ".", "&a", ">b", "y:1"));
    assert.deepEqual(json, { b: { y: 1 } });
  });
});

describe("amp.delete ??broadcast relative", () => {
  test("relative & deletes under each Cursor", () => {
    const json = parseSync(
      wire(
        ">",
        ">box",
        ">a",
        ">meta",
        "k:1",
        "drop:9",
        "<",
        "<",
        ">b",
        ">meta",
        "k:2",
        "drop:8",
        ".",
        "!meta",
        "&drop",
      ),
    );
    assert.deepEqual(json, {
      box: { a: { meta: { k: 1 } }, b: { meta: { k: 2 } } },
    });
  });

  test("per-Cursor missing is no-op; other Cursors still delete", () => {
    const json = parseSync(
      wire(
        ">",
        ">box",
        ">a",
        ">meta",
        "k:1",
        "drop:9",
        "<",
        "<",
        ">b",
        ">meta",
        "k:2",
        ".",
        "!meta",
        "&drop",
      ),
    );
    assert.deepEqual(json, {
      box: { a: { meta: { k: 1 } }, b: { meta: { k: 2 } } },
    });
  });

  test("broadcast still forbids @ = ! without .", () => {
    assert.throws(
      () =>
        parseSync(
          wire(
            ">",
            ">a",
            ">meta",
            "x:1",
            ".",
            ">b",
            ">meta",
            "y:1",
            ".",
            "!meta",
            "@a",
          ),
        ),
      (e) => e instanceof XaiopSyntaxError && /broadcast/.test(e.message),
    );
  });

  test("& is allowed in broadcast (does not require . first)", () => {
    const json = parseSync(
      wire(
        ">",
        ">a",
        ">meta",
        "drop:1",
        "k:1",
        ".",
        ">b",
        ">meta",
        "drop:2",
        "k:2",
        ".",
        "!meta",
        "&drop",
        "extra:3",
      ),
    );
    assert.deepEqual(json, {
      a: { meta: { k: 1, extra: 3 } },
      b: { meta: { k: 2, extra: 3 } },
    });
  });

  test("relative & does not use Root-absolute path", () => {
    // Under !meta, &box would look for meta.box (missing) ??no-op; box remains
    const json = parseSync(
      wire(
        ">",
        ">box",
        ">a",
        ">meta",
        "k:1",
        ".",
        "!meta",
        "&box",
      ),
    );
    assert.deepEqual(json, { box: { a: { meta: { k: 1 } } } });
  });

  test(". exits broadcast; following & is absolute again", () => {
    const json = parseSync(
      wire(
        ">",
        ">a",
        ">meta",
        "drop:1",
        "k:1",
        ".",
        ">b",
        ">meta",
        "drop:2",
        "k:2",
        ".",
        "!meta",
        ".",
        "&a",
      ),
    );
    assert.deepEqual(json, { b: { meta: { drop: 2, k: 2 } } });
  });
});

describe("amp.delete ??interactions with = @ ! .", () => {
  test("= locate then & absolute while Cursor elsewhere", () => {
    const json = parseSync(
      wire(">", ">a", "x:1", ".", ">b", "y:1", ".", "=b", "&a", "z:3"),
    );
    assert.deepEqual(json, { b: { y: 1, z: 3 } });
  });

  test("& then = still finds remaining nodes", () => {
    const json = parseSync(
      wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", ".", "=b", "z:2"),
    );
    assert.deepEqual(json, { b: { y: 1, z: 2 } });
  });

  test("& then ! no longer matches deleted fragment", () => {
    assert.throws(
      () =>
        parseSync(
          wire(">", ">a", ">t", "x:1", ".", ">b", "y:1", "&a", ".", "!t", "z:9"),
        ),
      (e) => e instanceof XaiopSyntaxError && /no match/.test(e.message),
    );
  });

  test("@ after & recreates path (create-or-enter)", () => {
    const json = parseSync(
      wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", ".", "@a", "z:2"),
    );
    assert.deepEqual(json, { b: { y: 1 }, a: { z: 2 } });
  });

  test(". does not undo &", () => {
    const json = parseSync(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", ".", "z:9"));
    assert.deepEqual(json, { b: { y: 1 }, z: 9 });
  });
});

describe("amp.delete ??must NOT happen (anti-semantics)", () => {
  test("must not delete sibling keys when deleting nested", () => {
    const json = parseSync(
      wire(">", ">a", "keep:1", ">b", "x:1", ".", ">c", "y:1", "&a>b"),
    );
    assert.deepEqual(json, { a: { keep: 1 }, c: { y: 1 } });
  });

  test("must not leave typed null in place of deleted key", () => {
    const json = parseSync(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a"));
    assert.ok(!("a" in /** @type {object} */ (json)));
    assert.notEqual(/** @type {any} */ (json).a, null);
  });

  test("must not treat Content key:null as delete", () => {
    const json = parseSync(wire(">", "a:null", "b:1"));
    assert.deepEqual(json, { a: null, b: 1 });
  });

  test("must not move Cursor to Root on &", () => {
    const live = new LiveXaiopParser();
    live.feedText(wire(">", ">a", "x:1", ".", ">b", "y:1"));
    const before = live.cursorRestoreLines();
    live.feedLine("&a");
    const after = live.cursorRestoreLines();
    assert.deepEqual(after, before);
    assert.deepEqual(after, [">b"]);
  });

  test("must not allow & while name contains operator chars", () => {
    assert.throws(
      () => parseSync(wire(">", "x:1", "&a@b")),
      (e) => e instanceof XaiopSyntaxError,
    );
  });

  test("encode must not emit keys with &", () => {
    assert.throws(
      () => encodeSync({ "a&b": 1 }),
      (e) => /operator character/.test(String(e.message)),
    );
  });
});

describe("amp.delete ??live / parseSync equivalence", () => {
  const corpus = [
    wire(">", ">a", "x:1", ".", ">b", "y:2", "&a"),
    wire(">", ">a", ">b", "x:1", ".", ">c", "z:1", "&a>b", "w:2"),
    wire(">", ">items-", ":1", ":2", ".", ">k", "v:1", "&items"),
    wire(">", ">a", "x:1", ".", ">b", "y:1", "&missing", "z:2"),
    wire(">", ">a", "x:1", ".", ">b", "y:1", ".", ">c", "z:1", "&a", "&b"),
  ];

  for (const [i, text] of corpus.entries()) {
    test(`LiveXaiopParser ??parseSync #${i}`, () => {
      const live = new LiveXaiopParser();
      live.feedText(text);
      assert.deepEqual(live.value(), parseSync(text));
    });
  }
});

describe("amp.delete ??stream non-cover", () => {
  test("prior Diff unchanged after later &", () => {
    /** @type {unknown[]} */
    const chunks = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      cover: false,
      onChunk: (d) => chunks.push(d),
    });
    eng.push(wire(">", ">a", "x:1", ".") + "\n");
    assert.equal(chunks.length, 1);
    const first = clone(chunks[0]);
    eng.push(wire(">", ">b", "y:2", "&a", ".") + "\n");
    eng.finish();
    assert.deepEqual(chunks[0], first);
    assert.deepEqual(first, { a: { x: 1 } });
    assert.deepEqual(eng.snapshot, { b: { y: 2 } });
  });

  test("committed reflects delete immediately; final ??parseSync", () => {
    const text = wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", ".") + "\n";
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      cover: false,
      onChunk: () => {},
    });
    eng.push(wire(">", ">a", "x:1", ".") + "\n");
    assert.deepEqual(eng.committedSnapshot, { a: { x: 1 } });
    eng.push(wire(">", ">b", "y:2", "&a", ".") + "\n");
    assert.deepEqual(eng.committedSnapshot, { b: { y: 2 } });
    eng.finish();
    assert.deepEqual(eng.snapshot, parseSync(text));
  });

  test("phase with & uses cumulative Diff (keys from prior phases visible in tree)", () => {
    /** @type {unknown[]} */
    const chunks = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      cover: false,
      onChunk: (d) => chunks.push(d),
    });
    eng.push(wire(">", ">a", "x:1", ".") + "\n");
    eng.push(wire(">", ">b", "y:1", "&a", ".") + "\n");
    eng.finish();
    // Second chunk is cumulative (has b, no a) ??not phase-local only {b:...} with a still present
    assert.deepEqual(chunks[1], { b: { y: 1 } });
    assert.ok(!("a" in /** @type {object} */ (chunks[1])));
  });

  test("char-chunked stream final ??parseSync", () => {
    const text = wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3", ".") + "\n";
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      cover: false,
      onChunk: () => {},
    });
    for (const ch of text) eng.push(ch);
    eng.finish();
    assert.deepEqual(eng.snapshot, parseSync(text));
  });
});

describe("amp.delete ??stream cover", () => {
  test("tombstone Diff then content; final ??parseSync", () => {
    /** @type {unknown[]} */
    const chunks = [];
    const text = wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", "z:2", ".") + "\n";
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      cover: true,
      historySnapshot: true,
      onChunk: (d) => chunks.push(d),
    });
    eng.push(text);
    eng.finish();
    assert.deepEqual(eng.snapshot, parseSync(text));
    assert.ok(chunks.some((c) => c && typeof c === "object" && /** @type {any} */ (c).a === null));
    const hist = eng.history;
    assert.ok(hist && hist.length >= 2);
    const allWire = [...Array(hist.length).keys()]
      .map((i) => hist.getNode(i)?.wire ?? "")
      .join("");
    assert.match(allWire, /&a/);
  });

  test("consecutive & merge into one tombstone Diff", () => {
    /** @type {unknown[]} */
    const chunks = [];
    const text =
      wire(">", ">a", "x:1", ".", ">b", "y:1", ".", ">c", "z:1", "&a", "&b", "w:9", ".") +
      "\n";
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      cover: true,
      onChunk: (d) => chunks.push(d),
    });
    eng.push(text);
    eng.finish();
    assert.deepEqual(eng.snapshot, parseSync(text));
    const tombs = chunks.filter(
      (c) =>
        c &&
        typeof c === "object" &&
        !Array.isArray(c) &&
        (/** @type {any} */ (c).a === null || /** @type {any} */ (c).b === null),
    );
    assert.ok(tombs.length >= 1);
    const merged = tombs.find(
      (c) =>
        /** @type {any} */ (c).a === null && /** @type {any} */ (c).b === null,
    );
    assert.ok(merged, "expected one merged tombstone with a:null and b:null");
  });

  test("nested & tombstone is deepest null only", () => {
    /** @type {unknown[]} */
    const chunks = [];
    const text =
      wire(">", ">a", ">b", "x:1", ".", ">c", "y:1", "&a>b", "z:2", ".") + "\n";
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      cover: true,
      onChunk: (d) => chunks.push(d),
    });
    eng.push(text);
    eng.finish();
    const tomb = chunks.find(
      (c) =>
        c &&
        typeof c === "object" &&
        /** @type {any} */ (c).a &&
        /** @type {any} */ (c).a.b === null,
    );
    assert.ok(tomb);
    assert.deepEqual(tomb, { a: { b: null } });
    assert.deepEqual(eng.snapshot, parseSync(text));
  });

  test("cover restore keeps post-& Content on prior Cursor path", () => {
    const text = wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", "z:2", ".") + "\n";
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      cover: true,
      onChunk: () => {},
    });
    eng.push(text);
    eng.finish();
    assert.deepEqual(eng.snapshot, { b: { y: 1, z: 2 } });
  });

  test("history nodes after cover are not rewritten by later &", () => {
    /** @type {unknown[]} */
    const afters = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      cover: true,
      historySnapshot: true,
      onChunk: () => {},
    });
    eng.push(wire(">", ">a", "x:1", ".") + "\n");
    const h = eng.history;
    assert.ok(h);
    afters.push(clone(h.getAfter(0)));
    eng.push(wire(">", ">b", "y:1", "&a", ".") + "\n");
    eng.finish();
    assert.deepEqual(h.getAfter(0), afters[0]);
    assert.deepEqual(afters[0], { a: { x: 1 } });
  });

  test("non-cover and cover finals match for same wire", () => {
    const text =
      wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", "&missing", "z:2", ".") + "\n";
    /** @param {boolean} cover */
    function run(cover) {
      const eng = new DotCheckpointEngine({
        streamProcessing: true,
        mergeChunkWindow: false,
        cover,
        onChunk: () => {},
      });
      eng.push(text);
      eng.finish();
      return eng.snapshot;
    }
    assert.deepEqual(run(false), run(true));
    assert.deepEqual(run(false), parseSync(text));
  });
});

/** @param {unknown} v */
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}
