#!/usr/bin/env node
/**
 * Compare Python ↔ Go core-wire NDJSON dumps.
 * Trees: deep-equal with int/float numeric equivalence.
 * Wire / encode: byte-equal.
 * Error cases: both must report ok:true (message text need not match).
 */
import { readFileSync } from "node:fs";

function loadNdjson(path) {
  let text = readFileSync(path, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const map = new Map();
  let lineNo = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;
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

function asNumber(n) {
  if (typeof n === "number") return n;
  return null;
}

function deepEqual(a, b, path = "$") {
  if (Object.is(a, b)) return null;
  if (a === null || b === null || a === undefined || b === undefined) {
    if (a !== b) return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
    return null;
  }
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) {
    if (na === nb) return null;
    const scale = Math.max(1, Math.abs(na), Math.abs(nb));
    if (Math.abs(na - nb) / scale < 1e-12) return null;
    return `${path}: number ${na} !== ${nb}`;
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
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length) {
      return `${path}: key count ${ak.length} !== ${bk.length}`;
    }
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) {
        return `${path}: keys diverge at ${ak[i]} vs ${bk[i]}`;
      }
      const err = deepEqual(a[ak[i]], b[bk[i]], `${path}.${ak[i]}`);
      if (err) return err;
    }
    return null;
  }
  if (a !== b) return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  return null;
}

function compareCase(a, b) {
  const id = a.case;
  if (a.kind !== b.kind) {
    return `${id}: kind ${a.kind} !== ${b.kind}`;
  }
  if (a.error || b.error) {
    if (a.error && b.error) return null; // both failed the dump step similarly
    return `${id}: dump error asymmetry: ${JSON.stringify(a.error)} vs ${JSON.stringify(b.error)}`;
  }

  switch (a.kind) {
    case "parse":
    case "parse_file":
    case "live":
    case "roundtrip": {
      if (!!a.fragment !== !!b.fragment) {
        return `${id}: fragment ${a.fragment} !== ${b.fragment}`;
      }
      const err = deepEqual(a.tree, b.tree, `${id}.tree`);
      if (err) return err;
      if (a.kind === "roundtrip" || a.kind === "encode") {
        // also compare wire for roundtrip
      }
      if (a.wire != null || b.wire != null) {
        if (a.wire !== b.wire) {
          return `${id}: wire mismatch\n--- py ---\n${a.wire}\n--- go ---\n${b.wire}`;
        }
      }
      return null;
    }
    case "encode": {
      if (a.wire !== b.wire) {
        return `${id}: wire mismatch\n--- py ---\n${a.wire}\n--- go ---\n${b.wire}`;
      }
      return null;
    }
    case "parse_error":
    case "encode_error": {
      if (a.ok !== true || b.ok !== true) {
        return `${id}: expected ok:true on both sides (${JSON.stringify(a)} vs ${JSON.stringify(b)})`;
      }
      return null;
    }
    default:
      return `${id}: unknown kind ${a.kind}`;
  }
}

function main() {
  const [, , leftPath, rightPath] = process.argv;
  if (!leftPath || !rightPath) {
    console.error("usage: node compare-core.mjs <python.ndjson> <go.ndjson>");
    process.exit(2);
  }
  const left = loadNdjson(leftPath);
  const right = loadNdjson(rightPath);
  const ids = new Set([...left.keys(), ...right.keys()]);
  const missing = [];
  for (const id of ids) {
    if (!left.has(id)) missing.push(`missing in ${leftPath}: ${id}`);
    if (!right.has(id)) missing.push(`missing in ${rightPath}: ${id}`);
  }
  if (missing.length) {
    console.error(missing.join("\n"));
    process.exit(1);
  }
  const failures = [];
  for (const id of [...left.keys()].sort()) {
    const err = compareCase(left.get(id), right.get(id));
    if (err) failures.push(err);
  }
  if (failures.length) {
    console.error(`FAIL ${failures.length}/${left.size} cases`);
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(`OK ${left.size} core-wire cases (Python ↔ Go)`);
}

main();
