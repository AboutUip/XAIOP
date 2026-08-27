import assert from "node:assert/strict";
import test from "node:test";
import {
  LiveXaiopParser,
  XaiopSyntaxError,
  encodeSync,
  mergeToJson,
  parseSync,
} from "../dist/index.js";

function roundTrip(value) {
  return parseSync(encodeSync(value, { dotPolicy: "none" }));
}

test("round-trip LF / CR / CRLF / backslash", () => {
  assert.deepEqual(roundTrip({ t: "hello\nworld" }), { t: "hello\nworld" });
  assert.deepEqual(roundTrip({ t: "a\rb" }), { t: "a\rb" });
  assert.deepEqual(roundTrip({ t: "a\r\nb" }), { t: "a\r\nb" });
  assert.deepEqual(roundTrip({ t: "a\\b" }), { t: "a\\b" });
  assert.deepEqual(roundTrip({ t: "a\\nb" }), { t: "a\\nb" });
});

test("literal backslash-n is not a newline", () => {
  const twoChar = "a" + "\\" + "n" + "b";
  const got = roundTrip({ t: twoChar });
  assert.equal(got.t, twoChar);
  assert.notEqual(got.t, "a\nb");
});

test("real newline vs two-char \\n are distinct on the wire", () => {
  const nl = encodeSync({ t: "a\nb" }, { dotPolicy: "none" });
  const lit = encodeSync({ t: "a\\nb" }, { dotPolicy: "none" });
  assert.match(nl, /t:a\\nb/);
  assert.match(lit, /t:a\\\\nb/);
  assert.notEqual(nl, lit);
});

test("empty, only-newline, consecutive newlines, unicode", () => {
  assert.deepEqual(roundTrip({ t: "" }), { t: "" });
  assert.deepEqual(roundTrip({ t: "\n" }), { t: "\n" });
  assert.deepEqual(roundTrip({ t: "\n\n" }), { t: "\n\n" });
  assert.deepEqual(roundTrip({ t: "你好\n世界" }), { t: "你好\n世界" });
});

test("array scalar and first-colon split keep later colons", () => {
  assert.deepEqual(roundTrip(["line1\nline2"]), ["line1\nline2"]);
  assert.deepEqual(roundTrip({ t: "a:b\nc" }), { t: "a:b\nc" });
});

test("typing still applies after unescape; int/bool/null unchanged", () => {
  assert.deepEqual(parseSync(">\nn:1\n"), { n: 1 });
  assert.deepEqual(parseSync(">\nf:true\n"), { f: true });
  assert.deepEqual(parseSync(">\nz:null\n"), { z: null });
  assert.equal(typeof parseSync(">\ns:1\\n2\n").s, "string");
  assert.equal(parseSync(">\ns:1\\n2\n").s, "1\n2");
});

test("forced-string space then unescape", () => {
  assert.equal(parseSync(">\ns: hello\\nworld\n").s, "hello\nworld");
});

test("tab stays literal; leading space still rejected on encode", () => {
  assert.deepEqual(roundTrip({ t: "a\tb" }), { t: "a\tb" });
  assert.throws(() => encodeSync({ t: " spaced" }), /U\+0020 SPACE/);
});

test("unknown escape and trailing backslash are syntax errors", () => {
  assert.throws(() => parseSync(">\na:x\\ty\n"), (e) => {
    return e instanceof XaiopSyntaxError && /unknown Content escape/.test(e.message);
  });
  assert.throws(() => parseSync(">\na:end\\\n"), (e) => {
    return (
      e instanceof XaiopSyntaxError &&
      /incomplete Content escape/.test(e.message)
    );
  });
});

test("physical LF still starts a new line (not a value continuation)", () => {
  assert.throws(() => parseSync(">\na:hello\nworld\n"), XaiopSyntaxError);
});

test("complete trailing backslash and doubled backslash", () => {
  assert.equal(parseSync(">\na:end\\\\\n").a, "end\\");
  assert.deepEqual(roundTrip({ t: "\\" }), { t: "\\" });
  assert.deepEqual(roundTrip({ t: "\\\\" }), { t: "\\\\" });
});

test("unknown escapes \\t \\x \\N \\0", () => {
  for (const wire of [
    ">\na:x\\ty\n",
    ">\na:x\\xy\n",
    ">\na:x\\Ny\n",
    ">\na:x\\0y\n",
  ]) {
    assert.throws(() => parseSync(wire), (e) => {
      return e instanceof XaiopSyntaxError && /unknown Content escape/.test(e.message);
    });
  }
});

test("escapes at start, middle, end; mixed backslash+newline", () => {
  assert.deepEqual(roundTrip({ t: "\nstart" }), { t: "\nstart" });
  assert.deepEqual(roundTrip({ t: "end\n" }), { t: "end\n" });
  assert.deepEqual(roundTrip({ t: "a\\\nb" }), { t: "a\\\nb" });
});

test("forced-string then unescape; true/false/null tokens after unescape", () => {
  assert.equal(parseSync(">\ns: true\\n\n").s, "true\n");
  assert.equal(parseSync(">\ns:true\n").s, true);
});

test("encode keeps LF inside the Content token, not as a new physical line", () => {
  const wire = encodeSync({ t: "a\nb" }, { dotPolicy: "none" });
  const lines = wire.split(/\r?\n/).filter((l) => l.length > 0);
  const content = lines.find((l) => l.startsWith("t:"));
  assert.equal(content, "t:a\\nb");
});

test("payload starting with escape; LiveParser concat", () => {
  assert.equal(parseSync(">\na:\\nhey\n").a, "\nhey");
  const live = new LiveXaiopParser();
  live.feedText(encodeSync({ t: "p1\np2" }, { dotPolicy: "none" }));
  assert.equal(live.value().t, "p1\np2");
});

test("feedLine of one escaped Content line", () => {
  const live = new LiveXaiopParser();
  live.feedLine(">");
  live.feedLine("t:a\\nb");
  assert.equal(live.value().t, "a\nb");
});

test("emoji, consecutive escapes, unknown quote", () => {
  assert.deepEqual(roundTrip({ t: "🙂\n🎉" }), { t: "🙂\n🎉" });
  assert.equal(parseSync(">\ns:a\\n\\nb\n").s, "a\n\nb");
  assert.throws(() => parseSync(">\na:x\\\"y\n"), XaiopSyntaxError);
});

test("merge overlay unescapes Content", () => {
  const got = mergeToJson({ a: 1 }, ">\ns:hello\\nworld\n");
  assert.deepEqual(got, { a: 1, s: "hello\nworld" });
});
