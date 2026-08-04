/**
 * symbolKeys / U+001F label-escape dialect — expanded coverage.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DotCheckpointEngine,
  LABEL_ESCAPE_INTRODUCER,
  LiveXaiopParser,
  XaiopEncodeError,
  XaiopWs,
  decodeWireLabel,
  encodeSync,
  encodeWireLabel,
  keyNeedsSymbolEscape,
  parseSync,
} from "../dist/index.js";
import { charChunks, runRawStream, sizedChunks } from "./helpers/stream.js";

const ESC = LABEL_ESCAPE_INTRODUCER;
const OPT = { dotPolicy: "none", symbolKeys: true };
const PARSE = { symbolKeys: true };

/** @param {unknown} value */
function roundTrip(value, enc = OPT) {
  return parseSync(encodeSync(value, enc), PARSE);
}

test("helpers: keyNeedsSymbolEscape / encodeWireLabel / decodeWireLabel", () => {
  assert.equal(keyNeedsSymbolEscape("#k"), true);
  assert.equal(keyNeedsSymbolEscape("@k"), true);
  assert.equal(keyNeedsSymbolEscape(">t"), true);
  assert.equal(keyNeedsSymbolEscape("<t"), true);
  assert.equal(keyNeedsSymbolEscape("=t"), true);
  assert.equal(keyNeedsSymbolEscape("!t"), true);
  assert.equal(keyNeedsSymbolEscape("&t"), true);
  assert.equal(keyNeedsSymbolEscape(`${ESC}x`), true);
  assert.equal(keyNeedsSymbolEscape(".k"), false);
  assert.equal(keyNeedsSymbolEscape("a#b"), false);
  assert.equal(keyNeedsSymbolEscape("normal"), false);

  assert.equal(encodeWireLabel("#k", false), "#k");
  assert.equal(encodeWireLabel("#k", true), `${ESC}#k`);
  assert.equal(encodeWireLabel(`${ESC}h`, true), `${ESC}${ESC}h`);
  assert.equal(encodeWireLabel("ok", true), "ok");

  assert.equal(decodeWireLabel(`${ESC}#k`, true), "#k");
  assert.equal(decodeWireLabel(`${ESC}${ESC}h`, true), `${ESC}h`);
  assert.equal(decodeWireLabel(`${ESC}#k`, false), `${ESC}#k`);
  assert.equal(decodeWireLabel("plain", true), "plain");
});

test("symbolKeys off: all operator heads + U+001F throw", () => {
  for (const key of ["#k", "@k", ">test", "<x", "=y", "!z", "&a", `${ESC}h`]) {
    assert.throws(
      () => encodeSync({ [key]: 1 }, { dotPolicy: "none" }),
      (err) => {
        assert.ok(err instanceof XaiopEncodeError);
        assert.match(err.message, /symbolKeys|U\+001F|line-operator/);
        return true;
      },
      key,
    );
  }
});

test("symbolKeys on: each operator-head key roundtrips alone", () => {
  const cases = {
    "#k": 1,
    "@m": 2,
    ">test": "test",
    "<pop": true,
    "=eq": null,
    "!bang": 0,
    "&amp": "x",
    [`${ESC}hello`]: 3,
  };
  for (const [key, val] of Object.entries(cases)) {
    assert.deepEqual(roundTrip({ [key]: val }), { [key]: val }, key);
  }
});

test("symbolKeys on: wire never starts Content line with bare #", () => {
  const wire = encodeSync({ "#k": 1, a: 2 }, OPT);
  for (const line of wire.split("\n")) {
    if (!line) continue;
    if (line.startsWith("#")) {
      assert.fail(`bare annotation-looking Content: ${JSON.stringify(line)}`);
    }
  }
  assert.ok(wire.includes(`${ESC}#k:1`));
  assert.deepEqual(parseSync(wire, PARSE), { "#k": 1, a: 2 });
});

test("symbolKeys on: nested object + named enter with # key", () => {
  const value = { "#root": { "@child": { x: 1 }, ok: 2 } };
  const wire = encodeSync(value, OPT);
  assert.ok(wire.includes(`>${ESC}#root`));
  assert.ok(wire.includes(`>${ESC}@child`) || wire.includes(`${ESC}@child`));
  assert.deepEqual(roundTrip(value), value);
});

test("symbolKeys on: array of objects with symbol keys", () => {
  const value = {
    items: [{ "#id": 1 }, { "@id": 2 }, { ">id": 3 }],
  };
  assert.deepEqual(roundTrip(value), value);
});

test("symbolKeys on: named array >name- with symbol key", () => {
  const value = { "#tags": ["a", "b"] };
  const wire = encodeSync(value, OPT);
  assert.ok(wire.includes(`>${ESC}#tags-`));
  assert.deepEqual(roundTrip(value), value);
});

test("symbolKeys on: perTopLevelKey phases still roundtrip", () => {
  const value = { "#a": 1, "@b": 2, c: 3 };
  const wire = encodeSync(value, { symbolKeys: true });
  assert.ok(wire.includes("\n.\n") || wire.split("\n").filter((l) => l === ".").length >= 1);
  assert.deepEqual(parseSync(wire, PARSE), value);
});

test("symbolKeys on: body still rejects Cursor chars after head", () => {
  assert.throws(() => encodeSync({ "a>b": 1 }, OPT), /operator/);
  assert.throws(() => encodeSync({ "#a>b": 1 }, OPT), /operator/);
  assert.throws(() => encodeSync({ "@a&b": 1 }, OPT), /operator/);
});

test("symbolKeys on encode / off parse keeps introducer", () => {
  const wire = encodeSync({ "#k": 1 }, OPT);
  assert.deepEqual(parseSync(wire), { [`${ESC}#k`]: 1 });
});

test("symbolKeys off encode cannot emit; parse of escaped wire without flag", () => {
  const wire = `>\n${ESC}#k:1\n`;
  assert.deepEqual(parseSync(wire), { [`${ESC}#k`]: 1 });
  assert.deepEqual(parseSync(wire, PARSE), { "#k": 1 });
});

test("mid-key # / .k still work without symbolKeys", () => {
  assert.deepEqual(roundTrip({ "a#b": 1 }, { dotPolicy: "none" }), {
    "a#b": 1,
  });
  assert.deepEqual(
    parseSync(encodeSync({ ".k": 1 }, { dotPolicy: "none" })),
    { ".k": 1 },
  );
});

test("true # annotation + symbolKeys Content coexist", () => {
  const wire = `>\n# human note\n${ESC}#k:1\na:2\n`;
  assert.deepEqual(parseSync(wire, PARSE), { "#k": 1, a: 2 });
  assert.deepEqual(parseSync(wire), { [`${ESC}#k`]: 1, a: 2 });
});

test("LiveXaiopParser with symbolKeys", () => {
  const live = new LiveXaiopParser({ symbolKeys: true });
  live.feedText(encodeSync({ "#k": 1, "@m": 2 }, OPT));
  assert.deepEqual(live.value(), { "#k": 1, "@m": 2 });
});

test("DotCheckpointEngine symbolKeys: phase Diff + commit", () => {
  /** @type {unknown[]} */
  const chunks = [];
  const eng = new DotCheckpointEngine({
    streamProcessing: true,
    mergeChunkWindow: false,
    symbolKeys: true,
    onChunk: (d) => chunks.push(d),
  });
  const wire = encodeSync({ "#a": 1, b: 2 }, { symbolKeys: true });
  eng.push(wire);
  eng.finish();
  assert.deepEqual(eng.committedSnapshot, { "#a": 1, b: 2 });
  assert.ok(chunks.length >= 1);
  assert.deepEqual(chunks[0], { "#a": 1 });
});

test("manual wire: @path and =path with escaped segments", () => {
  const wire = `>
>${ESC}#box
x:1
.
@${ESC}#box
y:2
.
=${ESC}#box
z:3
`;
  assert.deepEqual(parseSync(wire, PARSE), {
    "#box": { x: 1, y: 2, z: 3 },
  });
});

test("manual wire: <leave then >re-enter escaped name", () => {
  const wire = `>
>${ESC}#a
v:1
<
>${ESC}@b
w:2
`;
  assert.deepEqual(parseSync(wire, PARSE), {
    "#a": { v: 1 },
    "@b": { w: 2 },
  });
});

test("XaiopStream RAW + symbolKeys (whole + char + sized)", async () => {
  const value = { "#k": 1, "@m": { ">n": 2 } };
  const wire = encodeSync(value, OPT);
  for (const parts of [undefined, charChunks(wire), sizedChunks(wire, 3)]) {
    const { done } = await runRawStream(wire, parts, { symbolKeys: true });
    assert.deepEqual(done, value);
  }
});

test("WS connect symbolKeys roundtrip", async () => {
  const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
  try {
    /** @type {import("../dist/index.js").XaiopWsConnection|null} */
    let server = null;
    const ready = new Promise((resolve) => {
      hub.onConnection((c) => {
        server = c;
        resolve(c);
      });
    });
    const client = await XaiopWs.connect(hub.url(), {
      symbolKeys: true,
      onPhase: () => {},
    });
    await ready;
    assert.ok(server);
    const wire = encodeSync({ "#k": 1, "@m": 2 }, { ...OPT, finalDot: false });
    // final document without requiring trailing phase sep
    server.pushWire(wire.endsWith("\n") ? wire : `${wire}\n`);
    await server.end();
    assert.deepEqual(await client.done, { "#k": 1, "@m": 2 });
  } finally {
    await hub.close();
  }
});

test("double-escape only one layer on each decode", () => {
  // Logical key is U+001F + "#k" → wire U+001F U+001F # k
  const key = `${ESC}#k`;
  const wire = encodeSync({ [key]: 1 }, OPT);
  assert.ok(wire.includes(`${ESC}${ESC}#k:1`));
  assert.deepEqual(parseSync(wire, PARSE), { [key]: 1 });
  // Two peels would be wrong:
  assert.notDeepEqual(parseSync(wire, PARSE), { "#k": 1 });
});
