import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LiveXaiopParser,
  XaiopEncodeError,
  XaiopFragment,
  XaiopSyntaxError,
  encodeSync,
  materializeSnapshot,
  parseSync,
} from "../dist/index.js";

const CORE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../conformance/core-wire",
);
const CASES = JSON.parse(
  fs.readFileSync(path.join(CORE, "cases.json"), "utf8"),
).cases;

function numEq(a, b) {
  if (typeof a === "number" && typeof b === "number") return a === b;
  return Object.is(a, b);
}

function deepEq(a, b) {
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return false;
      }
      return a.every((x, i) => deepEq(x, b[i]));
    }
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEq(a[k], b[k]));
  }
  return numEq(a, b);
}

function encodeOpts(c) {
  return {
    root: c.root || "auto",
    keyOrder: c.key_order || "sorted",
    dotPolicy: "none",
    style: "relative",
  };
}

for (const c of CASES) {
  test(`core-wire ${c.id}`, () => {
    switch (c.kind) {
      case "parse": {
        const parsed = parseSync(c.wire);
        assert.equal(parsed instanceof XaiopFragment, Boolean(c.fragment));
        assert.ok(deepEq(materializeSnapshot(parsed), c.expect), c.id);
        break;
      }
      case "parse_file": {
        const wire = fs.readFileSync(path.join(CORE, c.file), "utf8");
        const expect = JSON.parse(
          fs.readFileSync(path.join(CORE, c.expect_file), "utf8"),
        );
        assert.ok(deepEq(materializeSnapshot(parseSync(wire)), expect), c.id);
        break;
      }
      case "parse_error": {
        assert.throws(() => parseSync(c.wire), XaiopSyntaxError);
        break;
      }
      case "live": {
        const live = new LiveXaiopParser();
        for (const chunk of c.chunks) live.feedText(chunk);
        assert.ok(deepEq(materializeSnapshot(live.value()), c.expect), c.id);
        break;
      }
      case "encode": {
        if (c.root === "fragment") return; // Node encode has no fragment root (Python↔Go dump still covers)
        assert.equal(encodeSync(c.value, encodeOpts(c)), c.expect_wire);
        break;
      }
      case "encode_error": {
        assert.throws(
          () => encodeSync(c.value, { root: c.root || "auto" }),
          XaiopEncodeError,
        );
        break;
      }
      case "roundtrip": {
        const wire = encodeSync(c.value, encodeOpts(c));
        assert.ok(deepEq(materializeSnapshot(parseSync(wire)), c.value), c.id);
        break;
      }
      default:
        throw new Error(`unknown kind ${c.kind}`);
    }
  });
}
