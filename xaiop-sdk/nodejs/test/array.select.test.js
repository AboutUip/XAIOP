import assert from "node:assert/strict";
import test from "node:test";
import { DotCheckpointEngine, LiveXaiopParser, XaiopSyntaxError, parseSync } from "../dist/index.js";

function wire(...lines) {
  return lines.join("\n");
}

test("?index then write", () => {
  assert.deepEqual(
    parseSync(wire(">", ">orders-", "id:A1", "id:A2", ".", "@orders", "?1", "status:shipped")),
    { orders: [{ id: "A1" }, { id: "A2", status: "shipped" }] },
  );
});

test("?predicate first match", () => {
  assert.deepEqual(
    parseSync(wire(">", ">orders-", "id:A1", "id:A2", ".", "@orders", "?id:A2", "status:shipped")),
    { orders: [{ id: "A1" }, { id: "A2", status: "shipped" }] },
  );
});

test("?predicate first of two same ids", () => {
  assert.deepEqual(
    parseSync(wire(">", ">orders-", "id:A", "id:A", ".", "@orders", "?id:A", "x:1")),
    { orders: [{ id: "A", x: 1 }, { id: "A" }] },
  );
});

test("?* predicate writes all matches", () => {
  assert.deepEqual(
    parseSync(
      wire(
        ">",
        ">orders-",
        ">",
        "id:A1",
        "status:pending",
        "<",
        ">",
        "id:A2",
        "status:pending",
        "<",
        ">",
        "id:A3",
        "status:done",
        ".",
        "@orders",
        "?*status:pending",
        "checked:true",
      ),
    ),
    {
      orders: [
        { id: "A1", status: "pending", checked: true },
        { id: "A2", status: "pending", checked: true },
        { id: "A3", status: "done" },
      ],
    },
  );
});

test("?* all elements then write", () => {
  assert.deepEqual(
    parseSync(wire(">", ">tags-", "id:a", "id:b", ".", "@tags", "?*", "ok:true")),
    { tags: [{ id: "a", ok: true }, { id: "b", ok: true }] },
  );
});

test("bare & after > deletes that element", () => {
  assert.deepEqual(
    parseSync(wire(">", ">items-", ">", "id:keep", "<", ">", "id:drop", "&")),
    { items: [{ id: "keep" }] },
  );
});

test("bare & after ?predicate", () => {
  assert.deepEqual(
    parseSync(wire(">", ">orders-", "id:A1", "id:A2", "id:A3", ".", "@orders", "?id:A2", "&")),
    { orders: [{ id: "A1" }, { id: "A3" }] },
  );
});

test("?* then & deletes all elements", () => {
  assert.deepEqual(parseSync(wire(">", ">orders-", "id:A1", "id:A2", ".", "@orders", "?*", "&")), {
    orders: [],
  });
});

test("?2 scalar then &", () => {
  assert.deepEqual(parseSync(wire(">", ">n-", ":a", ":b", ":c", ".", "@n", "?1", "&")), {
    n: ["a", "c"],
  });
});

test("?0 nested array then append", () => {
  assert.deepEqual(
    parseSync(wire(">", ">wrap-", "-", ":a", ":b", ".", "@wrap", "?0", ":c")),
    { wrap: [["a", "b", "c"]] },
  );
});

test("numeric and bool predicates", () => {
  assert.deepEqual(
    parseSync(wire(">", ">rows-", "n:1", "n:2", ".", "@rows", "?n:1", "hit:true")),
    { rows: [{ n: 1, hit: true }, { n: 2 }] },
  );
  assert.deepEqual(
    parseSync(wire(">", ">rows-", "ok:true", "ok:false", ".", "@rows", "?ok:true", "x:1")),
    { rows: [{ ok: true, x: 1 }, { ok: false }] },
  );
});

test("forced-string and Content-escape predicates", () => {
  assert.deepEqual(
    parseSync(wire(">", ">rows-", "id: 1", "id:2", ".", "@rows", "?id: 1", "hit:true")),
    { rows: [{ id: "1", hit: true }, { id: 2 }] },
  );
  assert.deepEqual(
    parseSync(wire(">", ">rows-", "t:a\\nb", "t:plain", ".", "@rows", "?t:a\\nb", "hit:true")),
    { rows: [{ t: "a\nb", hit: true }, { t: "plain" }] },
  );
});

test("root array ?index", () => {
  assert.deepEqual(parseSync(wire("-", "id:A", "id:B", "?1", "x:1")), [
    { id: "A" },
    { id: "B", x: 1 },
  ]);
});

test("< after ? then append", () => {
  assert.deepEqual(
    parseSync(wire(">", ">orders-", "id:A1", ".", "@orders", "?0", "x:1", "<", "id:A2")),
    { orders: [{ id: "A1", x: 1 }, { id: "A2" }] },
  );
});

test("live chunks ? then write", () => {
  const live = new LiveXaiopParser();
  live.feedText(">\n>orders-\nid:A1\nid:A2\n.\n");
  live.feedText("@orders\n?id:A2\nstatus:ok\n");
  assert.deepEqual(live.value(), { orders: [{ id: "A1" }, { id: "A2", status: "ok" }] });
});

test("? errors", () => {
  const fails = [
    wire(">", "?0"),
    wire(">", ">a", "x:1", "?0"),
    wire(">", ">n-", ":a", ".", "@n", "?"),
    wire(">", ">n-", ":a", ".", "@n", "?9"),
    wire(">", ">n-", "id:A", ".", "@n", "?id:Z"),
    wire(">", ">n-", ".", "@n", "?*"),
    wire(">", ">n-", ":a", ".", "@n", "?01"),
    wire(">", ">n-", ":a", ".", "@n", "?00"),
    wire(">", ">n-", ":a", ".", "@n", "?-1"),
    wire(">", ">n-", ":a", ".", "@n", "?*2"),
    wire(">", ">n-", ":a", ".", "@n", "?:x"),
    wire(">", ">n-", ":a", ".", "@n", "?0", "k:v"),
    wire(">", ">a", "x:1", ".", "!a", "?0"),
    wire(">", "&"),
    wire(">", ">n-", ":a", ".", "@n", "&"),
    wire(">", ">n-", ":a", ":b", ".", "@n", "?*", "?0"),
    wire(">", ">n-", ":a", ":b", ".", "@n", "?0", "?0"),
    wire(">", ">n-", ":a", ":b", ".", "@n", "?id:A"),
    wire(">", ">rows-", "ok:1", ".", "@rows", "?ok:true"),
    wire(">", ">n-", ":a", ":b", ".", "@n", "? 1"),
    wire(">", ">n-", ":a", ".", "@n", "?+1"),
    wire(">", ">n-", ":a", ":b", ".", "@n", "?1.5"),
  ];
  for (const src of fails) {
    assert.throws(() => parseSync(src), XaiopSyntaxError, src);
  }
});

test("@ mid-path array becomes object key, not index", () => {
  assert.deepEqual(parseSync(wire(">", ">orders-", "id:A1", ".", "@orders>0", "x:1")), {
    orders: { 0: { x: 1 } },
  });
});

test("&path does not walk array indices", () => {
  assert.deepEqual(
    parseSync(wire(">", ">orders-", "id:A1", "id:A2", ".", "&orders>0")),
    { orders: [{ id: "A1" }, { id: "A2" }] },
  );
});

test("?* then &path deletes keys on each element", () => {
  assert.deepEqual(
    parseSync(
      wire(
        ">",
        ">orders-",
        ">",
        "id:A1",
        "status:pending",
        "<",
        ">",
        "id:A2",
        "status:pending",
        ".",
        "@orders",
        "?*",
        "&status",
      ),
    ),
    { orders: [{ id: "A1" }, { id: "A2" }] },
  );
});

test("=orders then ?index", () => {
  assert.deepEqual(
    parseSync(wire(">", ">orders-", "id:A1", "id:A2", ".", "=orders", "?1", "status:ok")),
    { orders: [{ id: "A1" }, { id: "A2", status: "ok" }] },
  );
});

test("?* one match still forbids nested ?", () => {
  assert.throws(
    () =>
      parseSync(
        wire(
          ">",
          ">orders-",
          ">",
          "id:A1",
          "status:pending",
          "<",
          ">",
          "id:A2",
          "status:done",
          ".",
          "@orders",
          "?*status:pending",
          "?0",
        ),
      ),
    XaiopSyntaxError,
  );
});

test("stream later phase >name- then ? uses cumulative tree", () => {
  const eng = new DotCheckpointEngine({
    streamProcessing: true,
    mergeChunkWindow: false,
    cover: false,
    onChunk: () => {},
  });
  eng.push(wire(">", ">orders-", "id:A1", "id:A2", ".") + "\n");
  eng.push(wire(">orders-", "?1", "status:ok", ".") + "\n");
  eng.finish();
  assert.deepEqual(eng.snapshot, {
    orders: [{ id: "A1" }, { id: "A2", status: "ok" }],
  });
});
