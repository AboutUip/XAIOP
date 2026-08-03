import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROTOCOL_VERSION,
  XaiopEngine,
  XaiopFragment,
  XaiopSyntaxError,
  parseSync,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureXaiop = path.resolve(
  here,
  "../../../docs/examples/complex.xaiop",
);
const fixtureJson = path.resolve(
  here,
  "../../../docs/examples/complex.expected.json",
);

test("protocol version", () => {
  assert.equal(PROTOCOL_VERSION, "0.4.0");
});

test("named array >name- re-enters and appends (with .)", () => {
  const v = parseSync(`>
>tags-
:a
.
>
>tags-
:b
`);
  assert.deepEqual(v, { tags: ["a", "b"] });
});

test("named array >name- re-enters and appends (leave then reopen)", () => {
  const v = parseSync(`>
>tags-
:a
<
>tags-
:b
`);
  assert.deepEqual(v, { tags: ["a", "b"] });
});

test("named array >name- after object at same key replaces type", () => {
  const v = parseSync(`>
>tags
x:1
<
>tags-
:a
`);
  assert.deepEqual(v, { tags: ["a"] });
});

test("complex fixture", () => {
  const source = fs.readFileSync(fixtureXaiop, "utf8");
  const expected = JSON.parse(fs.readFileSync(fixtureJson, "utf8"));
  assert.deepEqual(parseSync(source), expected);
});

test("forced string and types", () => {
  const v = parseSync(">\nn:5\ns: 5\nflag:true\ntext:hi");
  assert.deepEqual(v, { n: 5, s: "5", flag: true, text: "hi" });
});

test("float typing and forced string", () => {
  const v = parseSync(
    ">\na:1.5\nb:-2.25\nc:.5\nd:5.\ne:1e3\nf:-2.5E-2\ng: 1.5\nh:1e3x\ni:NaN\nj:Infinity",
  );
  assert.strictEqual(typeof v.a, "number");
  assert.equal(v.a, 1.5);
  assert.equal(v.b, -2.25);
  assert.equal(v.c, 0.5);
  assert.equal(v.d, 5);
  assert.equal(v.e, 1000);
  assert.equal(v.f, -0.025);
  assert.equal(v.g, "1.5");
  assert.equal(v.h, "1e3x");
  assert.equal(v.i, "NaN");
  assert.equal(v.j, "Infinity");
});

test("float binary64 precision smoke", () => {
  const v = parseSync(">\nx:0.1\ny:0.2\nz:0.30000000000000004");
  assert.equal(v.x + v.y, v.z);
});

test("null typing and forced string", () => {
  const v = parseSync(">\na:null\nb: null\nc:true\n>arr-\n:null\n:1\n<");
  assert.equal(v.a, null);
  assert.equal(v.b, "null");
  assert.equal(v.c, true);
  assert.deepEqual(v.arr, [null, 1]);
});

test("root array", () => {
  assert.deepEqual(parseSync("-\n:a\n:b"), ["a", "b"]);
});

test("anonymous root then named child → JSON object", () => {
  assert.deepEqual(parseSync(">\n>a"), { a: {} });
});

test("named child without anonymous root → fragment \"a\":{}", () => {
  const f = parseSync(">a");
  assert.equal(f.isFragment, true);
  assert.deepEqual(f.entries, { a: {} });
  assert.equal(f.notation(), '"a":{}');
});

test("no root opener meta → fragment (no outer wrap)", () => {
  const f = parseSync(">meta\nname:demo");
  assert.equal(f.isFragment, true);
  assert.deepEqual(f.entries, { meta: { name: "demo" } });
  assert.equal(f.notation(), '"meta":{"name":"demo"}');
});

test("named array must be >name- (reject name: then -)", () => {
  assert.throws(
    () => parseSync(">\ntags:\n-\n:a"),
    XaiopSyntaxError,
  );
});

test("bare label rejected", () => {
  assert.throws(() => parseSync("data"), XaiopSyntaxError);
});

test("engine upload / get async + sync", async () => {
  const eng = new XaiopEngine();
  const id = await eng.upload(">\nx:1");
  assert.equal(typeof id, "string");
  assert.deepEqual(await eng.get(id), { x: 1 });

  const id2 = eng.uploadSync("-\n:a");
  assert.deepEqual(eng.getSync(id2), ["a"]);
});

test("static parse async + sync", async () => {
  assert.deepEqual(await XaiopEngine.parse(">\na:b"), { a: "b" });
  assert.deepEqual(XaiopEngine.parseSync(">\na:b"), { a: "b" });
});

test("compatibility mode defaults off; can be enabled", async () => {
  const eng = new XaiopEngine();
  assert.equal(eng.compatibilityMode, false);
  eng.setCompatibilityMode(true);
  assert.equal(eng.compatibilityMode, true);

  const engOn = new XaiopEngine({ compatibilityMode: true });
  assert.equal(engOn.compatibilityMode, true);

  assert.deepEqual(XaiopEngine.parseSync(">\nx:1"), { x: 1 });
  assert.deepEqual(XaiopEngine.parseSync(">\nx:1", false), { x: 1 });
  assert.deepEqual(XaiopEngine.parseSync(">\nx:1", true), { x: 1 });
  assert.deepEqual(await XaiopEngine.parse(">\nx:1", true), { x: 1 });
  assert.deepEqual(parseSync(">\nx:1", true), { x: 1 });

  const id = engOn.uploadSync(">\ny:2");
  assert.deepEqual(engOn.getSync(id), { y: 2 });
});

test("compatibility mode forces object root so bare > array elements work", () => {
  // Opens with >meta (fragment under strict) then >characters- + element `>`
  const source = `>meta
name:demo
.
>characters-
>
name:alice
<
`;
  const strictFrag = parseSync(`>meta\nname:demo`);
  assert.equal(strictFrag.isFragment, true);
  assert.throws(() => parseSync(source), XaiopSyntaxError);

  const v = parseSync(source, true);
  assert.deepEqual(v, {
    meta: { name: "demo" },
    characters: [{ name: "alice" }],
  });
});

test("compatibility mode keeps array root when first line is -", () => {
  assert.deepEqual(parseSync("-\n:a\n:b", true), ["a", "b"]);
});

test("compatibility mode does not inject when first line is >", () => {
  assert.deepEqual(parseSync(">\nx:1", true), { x: 1 });
});

test("bare > on object Cursor re-enters (modify); same keys overwrite", () => {
  const v = parseSync(`>
id:1
name:a
.
>
id:2
name:b
`);
  assert.deepEqual(v, { id: 2, name: "b" });
});

test("bare > inside array still creates a new element", () => {
  const v = parseSync(`>
>items-
>
i:1
<
>
i:2
<
`);
  assert.deepEqual(v, { items: [{ i: 1 }, { i: 2 }] });
});

test("compatibility mode recovers missing leave-array before >name-", () => {
  const source = `>
>tags-
:alpha
:beta
>users-
>
id:1
name:alice
<
`;
  assert.throws(() => parseSync(source), XaiopSyntaxError);
  assert.throws(() => parseSync(source, false), XaiopSyntaxError);
  const v = parseSync(source, true);
  assert.deepEqual(v, {
    tags: ["alpha", "beta"],
    users: [{ id: 1, name: "alice" }],
  });
});

test("compatibility mode rewrites bare name- to >name-", () => {
  const source = `>
>characters-
>
name:江辞
aliases-
:绝世神医
:楚家大少
<
gender:男
<
`;
  assert.throws(() => parseSync(source), /Bare Label/);
  assert.throws(() => parseSync(source, false), /Bare Label/);
  const v = parseSync(source, true);
  assert.deepEqual(v, {
    characters: [
      {
        name: "江辞",
        aliases: ["绝世神医", "楚家大少"],
        gender: "男",
      },
    ],
  });
});

test("compatibility mode does not rewrite bare name without trailing -", () => {
  const source = `>
>meta
aliases
`;
  assert.throws(() => parseSync(source, true), /Bare Label/);
});

test("compatibility mode rewrites > with only whitespace to bare >", () => {
  const source = `>  
id:wideflat-bench  
ok:true
`;
  assert.throws(() => parseSync(source), /invalid label name/);
  const v = parseSync(source, true);
  assert.deepEqual(v, { id: "wideflat-bench", ok: true });
});

test("compatibility mode strips > glued onto key:value Content", () => {
  const source = `>
>shard_index:1
>shard_total:3
>characters-
>
name:江辞
<
`;
  assert.throws(() => parseSync(source), /invalid label name/);
  const v = parseSync(source, true);
  assert.deepEqual(v, {
    shard_index: 1,
    shard_total: 3,
    characters: [{ name: "江辞" }],
  });
});

test("compatibility mode ignores bare < at Root after .", () => {
  const source = `>
>beats-
>
kind:dialogue
text:hi
<
.
<
>
id:23-1
location:神医大会
`;
  assert.throws(() => parseSync(source), /< at Root is illegal/);
  const v = parseSync(source, true);
  assert.deepEqual(v, {
    beats: [{ kind: "dialogue", text: "hi" }],
    id: "23-1",
    location: "神医大会",
  });
});

test("compatibility mode does not ignore <name at Root", () => {
  const source = `>
id:1
.
<meta
`;
  assert.throws(() => parseSync(source, true), /< at Root is illegal/);
});

test("under-pop before bare > re-enters current object (protocol overwrite, not array sibling)", () => {
  // Only two `<` after nested/b — still on element 0; bare `>` re-enters element 0.
  const source = `>
>siblings-
>
i:1
>nested
a:1
>b
c:1
<
<
>
i:2
label:S-2
<
`;
  const v = parseSync(source);
  assert.equal(Array.isArray(v.siblings), true);
  assert.equal(v.siblings.length, 1);
  assert.equal(v.siblings[0].i, 2);
  assert.equal(v.siblings[0].label, "S-2");
  assert.deepEqual(v.siblings[0].nested, { a: 1, b: { c: 1 } });
});

test("array sibling after correct leave still uses bare > as create", () => {
  const source = `>
>siblings-
>
i:1
>nested
a:1
<
<
>
i:2
label:S-2
<
`;
  const v = parseSync(source);
  assert.equal(v.siblings.length, 2);
  assert.equal(v.siblings[0].i, 1);
  assert.equal(v.siblings[1].i, 2);
});

test("compatibility mode recovers two sequential Cursor errors in one document", () => {
  // Error 1: >features- while still inside tags-
  // Error 2: >meta while still inside features-
  const source = `>
>tags-
:a
>features-
:x
>meta
name:demo
.`;
  assert.throws(() => parseSync(source), /inside an array/);
  const v = parseSync(source, true);
  assert.deepEqual(v, {
    tags: ["a"],
    features: ["x"],
    meta: { name: "demo" },
  });
});

test("compatibility mode recovers leave-array then named section", () => {
  // Kind: >meta while still inside array (after leaving element with <)
  const source = `>
>siblings-
>
i:1
>nested
a:1
<
<
>
i:2
label:S-2
<
>meta
ok:1
.`;
  assert.throws(() => parseSync(source), /inside an array/);
  const v = parseSync(source, true);
  assert.equal(Array.isArray(v.siblings), true);
  assert.equal(v.siblings.length, 2);
  assert.equal(v.siblings[0].i, 1);
  assert.equal(v.siblings[0].nested.a, 1);
  assert.equal(v.siblings[1].i, 2);
  assert.equal(v.siblings[1].label, "S-2");
  assert.deepEqual(v.meta, { ok: 1 });
});

test("compatibility mode strips spaces in =path once on not found", () => {
  const source = `>
>meta
a:1
.
= meta
b:2
`;
  assert.throws(() => parseSync(source), /=path not found/);
  const v = parseSync(source, true);
  assert.deepEqual(v, { meta: { a: 1, b: 2 } });
});

test("compatibility mode maps =name- to array key name when value is array", () => {
  // LLM reused >name- create postfix on locate (=siblings- vs =siblings)
  const source = `>
>siblings-
>
i:1
<
.
=siblings-
>
i:2
label:S-2
<
`;
  assert.throws(() => parseSync(source), /=path not found: siblings-/);
  const v = parseSync(source, true);
  assert.equal(v.siblings.length, 2);
  assert.equal(v.siblings[0].i, 1);
  assert.equal(v.siblings[1].i, 2);
  assert.equal(v.siblings[1].label, "S-2");
});

test("compatibility mode maps =a>b- nested array create-suffix on locate", () => {
  const source = `>
>wrap
>items-
>
id:1
<
.
=wrap>items-
>
id:2
<
`;
  assert.throws(() => parseSync(source), /=path not found/);
  const v = parseSync(source, true);
  assert.deepEqual(v, {
    wrap: { items: [{ id: 1 }, { id: 2 }] },
  });
});

test("compatibility mode does not map =name- onto object key name", () => {
  // Trailing - only means array create postfix — never strip onto an object
  assert.throws(
    () =>
      parseSync(
        `>
>meta
a:1
.
=meta-
b:2
`,
        true,
      ),
    /=path not found: meta-/,
  );
});

test("compatibility mode strips all interior spaces in =path on second retry", () => {
  // Spaces around `>` survive trim; all-space strip yields child>inner
  const source = `>
>child
>inner
a:1
.
=child > inner
b:2
`;
  assert.throws(() => parseSync(source), /=path not found/);
  const v = parseSync(source, true);
  assert.deepEqual(v, { child: { inner: { a: 1, b: 2 } } });
});

test("compatibility mode still throws =path not found after space strip", () => {
  assert.throws(
    () => parseSync(">\na:1\n= missing", true),
    /=path not found:  missing/,
  );
});

test("compatibility mode stops when error changes after pop", () => {
  // After pops, bare label still invalid — error changes or remains unrecoverable
  assert.throws(() => parseSync(">\ndata", true), XaiopSyntaxError);
});

test("unknown data id", () => {
  const eng = new XaiopEngine();
  assert.throws(() => eng.getSync("missing"), /unknown data id/);
});

test("compat fix APIs: require compatibility mode; default all on", () => {
  const eng = new XaiopEngine();
  assert.equal(eng.compatibilityMode, false);
  assert.equal(eng.compatForcedRoot, true);
  assert.equal(eng.compatPopAndRetry, true);
  assert.equal(eng.setCompatForcedRoot(false), false);
  assert.equal(eng.compatForcedRoot, true); // unchanged while compat off

  eng.setCompatibilityMode(true);
  assert.equal(eng.setCompatForcedRoot(false), true);
  assert.equal(eng.compatForcedRoot, false);
  assert.equal(eng.setCompatForcedRoot(true), true);
  assert.equal(eng.compatForcedRoot, true);

  assert.equal(eng.setCompatPopAndRetry("yes"), false); // non-boolean rejected
  assert.equal(eng.compatPopAndRetry, true);
});

test("compat fix APIs: disabling popAndRetry fails like strict on that slip", () => {
  const source = `>
>tags-
:a
>users-
>
id:1
<
`;
  const eng = new XaiopEngine({ compatibilityMode: true });
  assert.equal(eng.setCompatPopAndRetry(false), true);
  assert.throws(() => eng.uploadSync(source), XaiopSyntaxError);

  assert.equal(eng.setCompatPopAndRetry(true), true);
  const id = eng.uploadSync(source);
  assert.deepEqual(eng.getSync(id), {
    tags: ["a"],
    users: [{ id: 1 }],
  });
});

test("compat fix APIs: disable rewriteBareNameArray only", () => {
  const eng = new XaiopEngine({ compatibilityMode: true });
  assert.equal(eng.setCompatRewriteBareNameArray(false), true);
  assert.throws(() => eng.uploadSync(">\ntags-\n:a"), XaiopSyntaxError);

  assert.equal(eng.setCompatRewriteBareNameArray(true), true);
  assert.deepEqual(eng.getSync(eng.uploadSync(">\ntags-\n:a")), {
    tags: ["a"],
  });
});

test("compat fix APIs: disable forcedRoot keeps strict fragment path", () => {
  const eng = new XaiopEngine({ compatibilityMode: true });
  assert.equal(eng.setCompatForcedRoot(false), true);
  // Other fixes still on, but no injected root → fragment like strict for >meta alone
  const id = eng.uploadSync(">meta\nname:demo");
  const v = eng.getSync(id);
  assert.equal(v.isFragment, true);
  assert.deepEqual(v.entries, { meta: { name: "demo" } });
});

test("compat fix APIs: disable locatePathTrim only", () => {
  const base = `>
>meta
name:demo
.
`;
  const eng = new XaiopEngine({ compatibilityMode: true });
  assert.equal(eng.setCompatLocatePathTrim(false), true);
  assert.throws(
    () => eng.uploadSync(`${base}= meta\nx:1`),
    /=path not found/,
  );
  assert.equal(eng.setCompatLocatePathTrim(true), true);
  assert.deepEqual(eng.getSync(eng.uploadSync(`${base}= meta\nx:1`)), {
    meta: { name: "demo", x: 1 },
  });
});

test("parseSync accepts fine-grained policy object", () => {
  // All fixes except popAndRetry — missing leave-array must fail
  assert.throws(
    () =>
      parseSync(
        `>
>tags-
:a
>users-
>
id:1
`,
        { popAndRetry: false },
      ),
    XaiopSyntaxError,
  );

  // Forced root alone on fragment-shaped stream
  const v = parseSync(`>meta\nname:demo`, {
    forcedRoot: true,
    rewriteBareNameArray: false,
    rewriteEnterLine: false,
    ignoreBareLeaveAtRoot: false,
    popAndRetry: false,
    locatePathTrim: false,
    locatePathStripSpaces: false,
    locatePathArraySuffix: false,
  });
  assert.deepEqual(v, { meta: { name: "demo" } });
});
