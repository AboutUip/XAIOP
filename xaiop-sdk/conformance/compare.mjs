#!/usr/bin/env node
/**
 * Compare two XAIOP golden NDJSON dumps (Node vs Java).
 * Exit 0 on match; exit 1 with a clear message on mismatch.
 */
import { readFileSync } from "node:fs";

function loadNdjson(path) {
  let text = readFileSync(path, "utf8");
  // Strip UTF-8 / UTF-16 BOM if a shell redirect introduced one.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.startsWith("\u00ef\u00bb\u00bf")) text = text.slice(3);
  const map = new Map();
  let lineNo = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip leftover UTF-16 garbage markers
    if (trimmed.includes("\u0000")) {
      throw new Error(
        `${path}:${lineNo}: NUL bytes in line (save as UTF-8, not UTF-16)`,
      );
    }
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`${path}:${lineNo}: invalid JSON: ${e.message}`);
    }
    if (!obj || typeof obj.case !== "string") {
      throw new Error(`${path}:${lineNo}: missing string "case"`);
    }
    if (map.has(obj.case)) {
      throw new Error(`${path}: duplicate case "${obj.case}"`);
    }
    map.set(obj.case, obj);
  }
  return map;
}

function pathJoin(base, key) {
  return base ? `${base}.${key}` : key;
}

/** Structural deep equality with numeric tolerance for IEEE floats. */
function deepEqual(a, b, path = "$") {
  if (Object.is(a, b)) return null;
  if (a === null || b === null || a === undefined || b === undefined) {
    if (a !== b) return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
    return null;
  }
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return null;
    if (a === b) return null;
    // Allow tiny float drift from JSON round-trip only when both are non-integers
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      const scale = Math.max(1, Math.abs(a), Math.abs(b));
      if (Math.abs(a - b) / scale < 1e-12) return null;
    }
    return `${path}: number ${a} !== ${b}`;
  }
  if (typeof a !== typeof b) {
    return `${path}: type ${typeof a} !== ${typeof b}`;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return `${path}: array vs non-array`;
    }
    if (a.length !== b.length) {
      return `${path}: array length ${a.length} !== ${b.length}`;
    }
    for (let i = 0; i < a.length; i++) {
      const err = deepEqual(a[i], b[i], `${path}[${i}]`);
      if (err) return err;
    }
    return null;
  }
  if (typeof a === "object") {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    const all = new Set([...ak, ...bk]);
    for (const k of all) {
      if (!(k in a)) return `${pathJoin(path, k)}: missing on left`;
      if (!(k in b)) return `${pathJoin(path, k)}: missing on right`;
      const err = deepEqual(a[k], b[k], pathJoin(path, k));
      if (err) return err;
    }
    return null;
  }
  if (a !== b) return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  return null;
}

function compareRecords(left, right, caseId) {
  if (left.kind !== right.kind) {
    return `kind mismatch: ${left.kind} !== ${right.kind}`;
  }
  switch (left.kind) {
    case "encode": {
      if (typeof left.wire !== "string" || typeof right.wire !== "string") {
        return "encode: wire must be string";
      }
      if (left.wire !== right.wire) {
        return `wire byte mismatch\n  left:  ${JSON.stringify(left.wire)}\n  right: ${JSON.stringify(right.wire)}`;
      }
      return null;
    }
    case "parse": {
      return deepEqual(left.tree, right.tree, "tree");
    }
    case "stream": {
      const d = deepEqual(left.diffs, right.diffs, "diffs");
      if (d) return d;
      return deepEqual(left.snapshot, right.snapshot, "snapshot");
    }
    default:
      return `unknown kind "${left.kind}"`;
  }
}

function main() {
  const leftPath = process.argv[2];
  const rightPath = process.argv[3];
  if (!leftPath || !rightPath) {
    console.error(
      "usage: node compare.mjs <node.ndjson> <java.ndjson>",
    );
    process.exit(2);
  }

  const left = loadNdjson(leftPath);
  const right = loadNdjson(rightPath);

  const leftKeys = [...left.keys()].sort();
  const rightKeys = [...right.keys()].sort();

  const onlyLeft = leftKeys.filter((k) => !right.has(k));
  const onlyRight = rightKeys.filter((k) => !left.has(k));
  if (onlyLeft.length || onlyRight.length) {
    console.error("golden case set mismatch");
    if (onlyLeft.length) console.error("  only in left:", onlyLeft.join(", "));
    if (onlyRight.length) console.error("  only in right:", onlyRight.join(", "));
    process.exit(1);
  }

  let failures = 0;
  for (const caseId of leftKeys) {
    const err = compareRecords(left.get(caseId), right.get(caseId), caseId);
    if (err) {
      console.error(`FAIL ${caseId}: ${err}`);
      failures++;
    }
  }

  if (failures) {
    console.error(`\n${failures} case(s) mismatched (${leftKeys.length} total)`);
    process.exit(1);
  }

  console.log(`OK ${leftKeys.length} golden cases match`);
}

main();
