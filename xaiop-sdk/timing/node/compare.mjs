#!/usr/bin/env node
/**
 * Cross-scheme timing — five non-equivalent dimensions, same logical payload.
 *
 *   Full JSON  ·  NDJSON  ·  JSON Patch  ·  Protobuf  ·  XAIOP
 *
 * NOT LLM PERF-METRICS (docs/performance.md).
 *
 * Usage:
 *   node compare.mjs
 *   node compare.mjs --quick
 *   node compare.mjs --json
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import jsonpatch from "fast-json-patch";
import protobuf from "protobufjs";
import {
  DOT_POLICY,
  DotCheckpointEngine,
  encodeSync,
  parseSync,
  PROTOCOL_VERSION,
  SDK_VERSION,
  STREAM_MODES,
  TRANSPORT_KIND,
  XaiopStream,
} from "xaiop";

const { applyPatch, compare: jsonPatchCompare } = jsonpatch;
const __dir = dirname(fileURLToPath(import.meta.url));
const quick = process.argv.includes("--quick");
const asJson = process.argv.includes("--json");
const ITERS = Number(process.env.BENCH_ITERS) || (quick ? 60 : 200);
const WARMUP = Number(process.env.BENCH_WARMUP) || (quick ? 8 : 25);

/** @param {number} n */
function hrMs(n) {
  return n / 1e6;
}

/**
 * @template T
 * @param {() => T} fn
 * @param {{ iters?: number, warmup?: number }} [opt]
 */
function timeSync(fn, opt = {}) {
  const iters = opt.iters ?? ITERS;
  const warmup = opt.warmup ?? WARMUP;
  for (let i = 0; i < warmup; i++) fn();
  const t0 = process.hrtime.bigint();
  let last;
  for (let i = 0; i < iters; i++) last = fn();
  const ms = hrMs(Number(process.hrtime.bigint() - t0));
  return { iters, totalMs: ms, msPerOp: ms / iters, last };
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ iters?: number, warmup?: number }} [opt]
 */
async function timeAsync(fn, opt = {}) {
  const iters = opt.iters ?? ITERS;
  const warmup = opt.warmup ?? WARMUP;
  for (let i = 0; i < warmup; i++) await fn();
  const t0 = process.hrtime.bigint();
  let last;
  for (let i = 0; i < iters; i++) last = await fn();
  const ms = hrMs(Number(process.hrtime.bigint() - t0));
  return { iters, totalMs: ms, msPerOp: ms / iters, last };
}

/** Nested multi-section document (UI-ish). */
function buildDoc(sections = 6, itemsPer = 12) {
  /** @type {Record<string, unknown>} */
  const doc = {
    meta: { title: "compare-fixture", ver: 1, sections },
  };
  for (let s = 0; s < sections; s++) {
    const key = `sec${s}`;
    doc[key] = {
      id: key,
      title: `Section ${s}`,
      items: Array.from({ length: itemsPer }, (_, i) => ({
        id: `${key}-${i}`,
        score: i * 1.5,
        ok: i % 2 === 0,
        note: `n-${s}-${i}`,
      })),
      summary: { count: itemsPer, hot: s },
    };
  }
  return doc;
}

/** Protobuf-friendly shape (map → repeated sections). Same logical fields. */
function toProtoShape(doc) {
  const { meta, ...rest } = doc;
  return {
    meta,
    sections: Object.keys(rest)
      .sort()
      .map((k) => rest[k]),
  };
}

/** Inverse: rebuild keyed object for parity with JSON/XAIOP tree. */
function fromProtoShape(msg) {
  /** @type {Record<string, unknown>} */
  const out = { meta: msg.meta };
  for (const sec of msg.sections || []) {
    out[sec.id] = {
      id: sec.id,
      title: sec.title,
      items: (sec.items || []).map((it) => ({
        id: it.id,
        score: it.score,
        ok: it.ok,
        note: it.note,
      })),
      summary: {
        count: sec.summary?.count ?? 0,
        hot: sec.summary?.hot ?? 0,
      },
    };
  }
  return out;
}

const PROTO_SRC = `
syntax = "proto3";
message Meta {
  string title = 1;
  int32 ver = 2;
  int32 sections = 3;
}
message Item {
  string id = 1;
  double score = 2;
  bool ok = 3;
  string note = 4;
}
message Summary {
  int32 count = 1;
  int32 hot = 2;
}
message Section {
  string id = 1;
  string title = 2;
  repeated Item items = 3;
  Summary summary = 4;
}
message Doc {
  Meta meta = 1;
  repeated Section sections = 2;
}
`;

function buildProtobufType() {
  const root = protobuf.parse(PROTO_SRC).root;
  return root.lookupType("Doc");
}

/** Top-level keys as NDJSON records. */
function toNdjson(doc) {
  return Object.entries(doc)
    .map(([k, v]) => JSON.stringify({ [k]: v }))
    .join("\n");
}

/**
 * RFC 6902 ops that build `doc` from `{}` (one add per top-level key),
 * then a no-op-safe compare against empty for encode sizing of full patch set.
 * @param {Record<string, unknown>} doc
 */
function toJsonPatchOps(doc) {
  return Object.entries(doc).map(([k, v]) => ({
    op: "add",
    path: `/${escapePointer(k)}`,
    value: v,
  }));
}

/** @param {string} k */
function escapePointer(k) {
  return k.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * @param {string} text
 * @param {number} n
 */
function chunkText(text, n) {
  const size = Math.max(1, Math.ceil(text.length / n));
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function ingestFullJson(text) {
  const t0 = process.hrtime.bigint();
  const tree = JSON.parse(text);
  const completeMs = hrMs(Number(process.hrtime.bigint() - t0));
  return { firstUsableMs: completeMs, completeMs, tree, emits: 1 };
}

function ingestNdjson(text) {
  const t0 = process.hrtime.bigint();
  let firstUsable = -1;
  let buf = "";
  /** @type {Record<string, unknown>} */
  const tree = {};
  let emits = 0;
  for (const ch of chunkText(text, 8)) {
    buf += ch;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      Object.assign(tree, JSON.parse(line));
      emits++;
      if (firstUsable < 0) firstUsable = hrMs(Number(process.hrtime.bigint() - t0));
    }
  }
  const tail = buf.trim();
  if (tail) {
    Object.assign(tree, JSON.parse(tail));
    emits++;
    if (firstUsable < 0) firstUsable = hrMs(Number(process.hrtime.bigint() - t0));
  }
  return {
    firstUsableMs: firstUsable < 0 ? 0 : firstUsable,
    completeMs: hrMs(Number(process.hrtime.bigint() - t0)),
    tree,
    emits,
  };
}

/** Apply JSON Patch ops one-by-one (progressive document build). */
function ingestJsonPatch(ops) {
  const t0 = process.hrtime.bigint();
  let firstUsable = -1;
  /** @type {Record<string, unknown>} */
  let tree = {};
  let emits = 0;
  for (const op of ops) {
    applyPatch(tree, [op], true, true);
    emits++;
    if (firstUsable < 0) firstUsable = hrMs(Number(process.hrtime.bigint() - t0));
  }
  return {
    firstUsableMs: firstUsable < 0 ? 0 : firstUsable,
    completeMs: hrMs(Number(process.hrtime.bigint() - t0)),
    tree,
    emits,
  };
}

/**
 * Protobuf: decode full buffer (atomic — no progressive tree without custom framing).
 * @param {protobuf.Type} Doc
 * @param {Uint8Array} bytes
 */
function ingestProtobuf(Doc, bytes) {
  const t0 = process.hrtime.bigint();
  const msg = Doc.toObject(Doc.decode(bytes), {
    defaults: true,
    arrays: true,
    objects: true,
  });
  const tree = fromProtoShape(msg);
  const completeMs = hrMs(Number(process.hrtime.bigint() - t0));
  return { firstUsableMs: completeMs, completeMs, tree, emits: 1 };
}

function ingestXaiopOneShot(wire) {
  const t0 = process.hrtime.bigint();
  const tree = parseSync(wire);
  const completeMs = hrMs(Number(process.hrtime.bigint() - t0));
  return { firstUsableMs: completeMs, completeMs, tree, emits: 1 };
}

/**
 * @param {string} wire
 * @param {boolean} streamProcessing
 */
function ingestXaiopCheckpoint(wire, streamProcessing) {
  const t0 = process.hrtime.bigint();
  let firstUsable = -1;
  let emits = 0;
  /** @type {unknown} */
  let lastDiff;
  const eng = new DotCheckpointEngine({
    compat: false,
    streamProcessing,
    onChunk: (d) => {
      emits++;
      lastDiff = d;
      if (firstUsable < 0) {
        firstUsable = hrMs(Number(process.hrtime.bigint() - t0));
      }
    },
  });
  for (const ch of chunkText(wire, 8)) eng.push(ch);
  eng.finish();
  const completeMs = hrMs(Number(process.hrtime.bigint() - t0));
  if (firstUsable < 0) firstUsable = completeMs;
  return {
    firstUsableMs: firstUsable,
    completeMs,
    tree: eng.committedSnapshot ?? lastDiff,
    emits,
  };
}

/**
 * @param {Record<string, unknown>} doc
 * @param {*} wires
 * @param {protobuf.Type} Doc
 */
function stageProfile(doc, wires, Doc) {
  const protoShape = toProtoShape(doc);
  const stages = [];

  stages.push({
    id: "FullJSON.encode",
    ...timeSync(() => JSON.stringify(doc)),
    bytesOut: wires.fullJson.length,
  });
  stages.push({
    id: "FullJSON.decode",
    ...timeSync(() => JSON.parse(wires.fullJson)),
    bytesIn: wires.fullJson.length,
  });

  stages.push({
    id: "NDJSON.encode",
    ...timeSync(() => toNdjson(doc)),
    bytesOut: wires.ndjson.length,
  });
  stages.push({
    id: "NDJSON.decode",
    ...timeSync(() => {
      const t = {};
      for (const line of wires.ndjson.split("\n")) {
        if (line) Object.assign(t, JSON.parse(line));
      }
      return t;
    }),
    bytesIn: wires.ndjson.length,
  });

  stages.push({
    id: "JSONPatch.encode(compare)",
    ...timeSync(() => jsonPatchCompare({}, doc)),
    bytesOut: wires.jsonPatchText.length,
  });
  stages.push({
    id: "JSONPatch.decode(apply-all)",
    ...timeSync(() => {
      const t = {};
      applyPatch(t, wires.jsonPatchOps, true, true);
      return t;
    }),
    bytesIn: wires.jsonPatchText.length,
  });

  stages.push({
    id: "Protobuf.encode",
    ...timeSync(() => Doc.encode(Doc.create(protoShape)).finish()),
    bytesOut: wires.protobuf.length,
  });
  stages.push({
    id: "Protobuf.decode",
    ...timeSync(() =>
      fromProtoShape(
        Doc.toObject(Doc.decode(wires.protobuf), {
          defaults: true,
          arrays: true,
          objects: true,
        }),
      ),
    ),
    bytesIn: wires.protobuf.length,
  });

  stages.push({
    id: "XAIOP.encode/none",
    ...timeSync(() => encodeSync(doc, { dotPolicy: DOT_POLICY.NONE })),
    bytesOut: wires.xaiopNone.length,
  });
  stages.push({
    id: "XAIOP.encode/perTopLevelKey",
    ...timeSync(() =>
      encodeSync(doc, { dotPolicy: DOT_POLICY.PER_TOP_LEVEL_KEY }),
    ),
    bytesOut: wires.xaiopPhased.length,
  });
  stages.push({
    id: "XAIOP.parseSync",
    ...timeSync(() => parseSync(wires.xaiopPhased)),
    bytesIn: wires.xaiopPhased.length,
  });
  stages.push({
    id: "XAIOP.checkpoint/streamOn",
    ...timeSync(() => {
      const e = new DotCheckpointEngine({
        compat: false,
        streamProcessing: true,
        onChunk: () => {},
      });
      e.push(wires.xaiopPhased);
      e.finish();
      return e.committedSnapshot;
    }),
    bytesIn: wires.xaiopPhased.length,
  });
  stages.push({
    id: "XAIOP.checkpoint/streamOff",
    ...timeSync(() => {
      const e = new DotCheckpointEngine({
        compat: false,
        streamProcessing: false,
        onChunk: () => {},
      });
      e.push(wires.xaiopPhased);
      e.finish();
      return e.committedSnapshot;
    }),
    bytesIn: wires.xaiopPhased.length,
  });
  stages.push({
    id: "XAIOP.checkpoint/emitDiffOff",
    ...timeSync(() => {
      const e = new DotCheckpointEngine({
        compat: false,
        streamProcessing: true,
        emitDiff: false,
      });
      e.push(wires.xaiopPhased);
      e.finish();
      return e.committedSnapshot;
    }),
    bytesIn: wires.xaiopPhased.length,
  });

  return stages;
}

/**
 * @param {Record<string, unknown>} doc
 * @param {*} wires
 * @param {protobuf.Type} Doc
 */
function progressiveProfile(doc, wires, Doc) {
  /** @type {{ scheme: string, dimension: string, firstUsableMs: number, completeMs: number, emits: number, bytes: number, ratioFirstToComplete: number }[]} */
  const rows = [];

  const run = (scheme, dimension, bytes, fn) => {
    let firstSum = 0;
    let completeSum = 0;
    let emits = 0;
    for (let i = 0; i < WARMUP; i++) fn();
    for (let i = 0; i < ITERS; i++) {
      const r = fn();
      firstSum += r.firstUsableMs;
      completeSum += r.completeMs;
      emits = r.emits;
    }
    const firstUsableMs = firstSum / ITERS;
    const completeMs = completeSum / ITERS;
    rows.push({
      scheme,
      dimension,
      firstUsableMs,
      completeMs,
      emits,
      bytes,
      ratioFirstToComplete: completeMs > 0 ? firstUsableMs / completeMs : 0,
    });
  };

  run("FullJSON", "atomic-document", wires.fullJson.length, () =>
    ingestFullJson(wires.fullJson),
  );
  run("NDJSON", "line-records-merge", wires.ndjson.length, () =>
    ingestNdjson(wires.ndjson),
  );
  run("JSONPatch", "rfc6902-ops", wires.jsonPatchText.length, () =>
    ingestJsonPatch(wires.jsonPatchOps),
  );
  run("Protobuf", "atomic-binary", wires.protobuf.length, () =>
    ingestProtobuf(Doc, wires.protobuf),
  );
  run("XAIOP.parseSync", "atomic-IR", wires.xaiopPhased.length, () =>
    ingestXaiopOneShot(wires.xaiopPhased),
  );
  run("XAIOP.streamOn", "nested-IR-phases", wires.xaiopPhased.length, () =>
    ingestXaiopCheckpoint(wires.xaiopPhased, true),
  );
  run("XAIOP.streamOff", "IR-buffer-then-parse", wires.xaiopPhased.length, () =>
    ingestXaiopCheckpoint(wires.xaiopPhased, false),
  );

  return rows;
}

async function streamAsyncProfile(wires) {
  const opt = { iters: Math.max(20, Math.floor(ITERS / 2)), warmup: WARMUP };
  const phased = await timeAsync(async () => {
    const stream = new XaiopStream("raw://cmp", {
      modes: [STREAM_MODES.PROMISE],
    });
    return stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: (async function* () {
        for (const c of chunkText(wires.xaiopPhased, 8)) yield c;
      })(),
    });
  }, opt);
  const off = await timeAsync(async () => {
    const stream = new XaiopStream("raw://cmp", {
      modes: [STREAM_MODES.PROMISE],
      streamProcessing: false,
    });
    return stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: (async function* () {
        for (const c of chunkText(wires.xaiopPhased, 8)) yield c;
      })(),
    });
  }, opt);
  return [
    { id: "XaiopStream.send/streamOn", msPerOp: phased.msPerOp, iters: phased.iters },
    { id: "XaiopStream.send/streamOff", msPerOp: off.msPerOp, iters: off.iters },
  ];
}

function assertParity(doc, wires, Doc) {
  const expect = JSON.stringify(doc);
  const checks = [
    ["FullJSON", ingestFullJson(wires.fullJson).tree],
    ["NDJSON", ingestNdjson(wires.ndjson).tree],
    ["JSONPatch", ingestJsonPatch(wires.jsonPatchOps).tree],
    ["Protobuf", ingestProtobuf(Doc, wires.protobuf).tree],
    ["XAIOP.parseSync", ingestXaiopOneShot(wires.xaiopPhased).tree],
    ["XAIOP.streamOn", ingestXaiopCheckpoint(wires.xaiopPhased, true).tree],
    ["XAIOP.streamOff", ingestXaiopCheckpoint(wires.xaiopPhased, false).tree],
  ];
  return checks.map(([name, tree]) => ({
    name,
    ok: JSON.stringify(tree) === expect,
  }));
}

/** @param {*} report */
function analyze(report) {
  const byId = Object.fromEntries(report.stages.map((s) => [s.id, s]));
  const byScheme = Object.fromEntries(
    report.progressive.map((r) => [r.scheme, r]),
  );

  const fullDec = byId["FullJSON.decode"].msPerOp;
  const ndDec = byId["NDJSON.decode"].msPerOp;
  const patchDec = byId["JSONPatch.decode(apply-all)"].msPerOp;
  const pbDec = byId["Protobuf.decode"].msPerOp;
  const xParse = byId["XAIOP.parseSync"].msPerOp;
  const xOn = byId["XAIOP.checkpoint/streamOn"].msPerOp;
  const xOff = byId["XAIOP.checkpoint/streamOff"].msPerOp;

  const sizes = report.sizes;
  /** @type {string[]} */
  const bullets = [];

  bullets.push(
    `Decode (complete): FullJSON ${fullDec.toFixed(3)} · NDJSON ${ndDec.toFixed(3)} · JSONPatch ${patchDec.toFixed(3)} · Protobuf ${pbDec.toFixed(3)} · XAIOP.parseSync ${xParse.toFixed(3)} ms/op.`,
  );
  bullets.push(
    `Wire size: FullJSON ${sizes.fullJson}B · NDJSON ${sizes.ndjson}B · JSONPatch ${sizes.jsonPatch}B · Protobuf ${sizes.protobuf}B · XAIOP ${sizes.xaiopPhased}B.`,
  );
  bullets.push(
    `XAIOP streamOn ${xOn.toFixed(3)} vs streamOff ${xOff.toFixed(3)} ms/op (×${(xOn / Math.max(xOff, 1e-9)).toFixed(1)}); residual ≈ per-phase Diff parse + optional clone.`,
  );
  const xNoDiff = byId["XAIOP.checkpoint/emitDiffOff"]?.msPerOp;
  if (xNoDiff != null) {
    bullets.push(
      `XAIOP emitDiffOff ${xNoDiff.toFixed(3)} vs streamOn ${xOn.toFixed(3)} ms/op (×${(xOn / Math.max(xNoDiff, 1e-9)).toFixed(1)}); Commit-only skips Diff parse (0.14.3+).`,
    );
  }

  const fj = byScheme.FullJSON;
  const nd = byScheme.NDJSON;
  const jp = byScheme.JSONPatch;
  const pb = byScheme.Protobuf;
  const xo = byScheme["XAIOP.streamOn"];
  bullets.push(
    `First usable (CPU): FullJSON/Protobuf = complete (${fj.firstUsableMs.toFixed(3)} / ${pb.firstUsableMs.toFixed(3)}); NDJSON ${nd.firstUsableMs.toFixed(3)}; JSONPatch ${jp.firstUsableMs.toFixed(3)}; XAIOP.streamOn ${xo.firstUsableMs.toFixed(3)} ms.`,
  );

  /** @type {{ topic: string, advantage: string, weakness: string }[]} */
  const matrix = [
    {
      topic: "Full JSON",
      advantage: "最简单、生态最大、整包 decode 通常最快之一。",
      weakness: "收齐前无安全物化树；无原生增量修订语义。",
    },
    {
      topic: "NDJSON",
      advantage: "行级流、首行即可用；实现廉价（JSON.parse + merge）。",
      weakness: "适合记录/事件流；深层同树修订与定位弱于 Patch/XAIOP。",
    },
    {
      topic: "JSON Patch (RFC 6902)",
      advantage: "标准增量 ops；可对已有 JSON 做精确修改；首 op 后即可 progressive。",
      weakness: "大文档细粒度 op 时 apply 成本上升；JSON Pointer 繁琐；非嵌套 IR / 无 `=`/`!` 类定位。",
    },
    {
      topic: "Protobuf",
      advantage: "二进制紧凑、schema 约束、机机吞吐强。",
      weakness: "需 schema；默认同整包原子（无树渐进）；非人类可读；与 LLM 文本输出不对齐。",
    },
    {
      topic: "XAIOP",
      advantage: "嵌套 IR + `.` 相界 + `=`/`!`/`@`；streamOn 首相可用；线体可小于 JSON。",
      weakness: "解析器重于 JSON；streamOn 有相位 Diff 税；不适合纯机机总线替代 Protobuf/JSON。",
    },
  ];

  const fastestDecode = [
    ["FullJSON", fullDec],
    ["NDJSON", ndDec],
    ["JSONPatch", patchDec],
    ["Protobuf", pbDec],
    ["XAIOP", xParse],
  ].sort((a, b) => a[1] - b[1])[0];

  return {
    fastestDecode: { scheme: fastestDecode[0], msPerOp: fastestDecode[1] },
    streamTax: xOn / Math.max(xOff, 1e-9),
    bullets,
    matrix,
    bottleneck:
      xOn / Math.max(xOff, 1e-9) > 2.5
        ? "XAIOP streamOn 残余：相位 Diff parse（非前缀重 parse）"
        : "各方案 decode 常数差为主",
  };
}

function fmt(n, d = 4) {
  return Number(n).toFixed(d);
}

function printHuman(report) {
  console.log("Cross-scheme timing: Full JSON / NDJSON / JSON Patch / Protobuf / XAIOP");
  console.log("(Not LLM PERF-METRICS — local CPU. Fake network delay = 0.)");
  console.log(
    "(XAIOP regression microbench: npm run bench — baseline vs same machine.)\n",
  );
  console.log(
    `SDK ${report.sdk}  protocol ${report.protocol}  Node ${process.version}  iters=${ITERS}  warmup=${WARMUP}${quick ? "  --quick" : ""}`,
  );
  console.log(
    `fixture sections=${report.fixture.sections} itemsPer=${report.fixture.itemsPer}`,
  );
  const s = report.sizes;
  console.log(
    `sizes: FullJSON=${s.fullJson}B  NDJSON=${s.ndjson}B  JSONPatch=${s.jsonPatch}B  Protobuf=${s.protobuf}B  XAIOP=${s.xaiopPhased}B\n`,
  );

  console.log("=== A. Encode / decode microbench (ms/op) ===\n");
  console.log(
    "id".padEnd(36),
    "ms/op".padStart(10),
    "ops/s".padStart(10),
  );
  console.log("-".repeat(60));
  for (const st of report.stages) {
    console.log(
      st.id.padEnd(36),
      fmt(st.msPerOp).padStart(10),
      (1000 / st.msPerOp).toFixed(1).padStart(10),
    );
  }

  console.log("\n=== B. Progressive ingest (first usable vs complete) ===\n");
  console.log(
    "scheme".padEnd(20),
    "dimension".padEnd(22),
    "first".padStart(10),
    "done".padStart(10),
    "first/done".padStart(10),
    "emits".padStart(6),
  );
  console.log("-".repeat(84));
  for (const r of report.progressive) {
    console.log(
      r.scheme.padEnd(20),
      r.dimension.padEnd(22),
      fmt(r.firstUsableMs).padStart(10),
      fmt(r.completeMs).padStart(10),
      `${(r.ratioFirstToComplete * 100).toFixed(0)}%`.padStart(10),
      String(r.emits).padStart(6),
    );
  }

  console.log("\n=== C. XaiopStream async ===\n");
  for (const st of report.streamAsync) {
    console.log(`  ${st.id}: ${fmt(st.msPerOp)} ms/op (${st.iters} iters)`);
  }

  console.log("\n=== D. Parity (same logical JSON tree) ===\n");
  for (const p of report.parity) {
    console.log(`  ${p.name}: ${p.ok ? "OK" : "FAIL"}`);
  }

  console.log("\n=== E. Analysis ===\n");
  console.log(
    `Fastest decode: ${report.analysis.fastestDecode.scheme} (${fmt(report.analysis.fastestDecode.msPerOp)} ms/op)`,
  );
  console.log(`Bottleneck note: ${report.analysis.bottleneck}\n`);
  for (const b of report.analysis.bullets) console.log(`• ${b}`);

  console.log("\n=== F. Scheme matrix ===\n");
  for (const m of report.analysis.matrix) {
    console.log(`[${m.topic}]`);
    console.log(`  + ${m.advantage}`);
    console.log(`  − ${m.weakness}\n`);
  }
}

async function main() {
  const sections = quick ? 4 : 6;
  const itemsPer = quick ? 8 : 12;
  const doc = buildDoc(sections, itemsPer);
  const Doc = buildProtobufType();
  const protoShape = toProtoShape(doc);
  const protobufBytes = Doc.encode(Doc.create(protoShape)).finish();
  const jsonPatchOps = toJsonPatchOps(doc);
  const jsonPatchText = JSON.stringify(jsonPatchOps);

  const wires = {
    fullJson: JSON.stringify(doc),
    ndjson: toNdjson(doc),
    jsonPatchOps,
    jsonPatchText,
    protobuf: protobufBytes,
    xaiopNone: encodeSync(doc, { dotPolicy: DOT_POLICY.NONE }),
    xaiopPhased: encodeSync(doc, {
      dotPolicy: DOT_POLICY.PER_TOP_LEVEL_KEY,
    }),
  };

  const stages = stageProfile(doc, wires, Doc);
  const progressive = progressiveProfile(doc, wires, Doc);
  const streamAsync = await streamAsyncProfile(wires);
  const parity = assertParity(doc, wires, Doc);

  const report = {
    kind: "xaiop-cross-scheme-timing",
    schemes: ["FullJSON", "NDJSON", "JSONPatch", "Protobuf", "XAIOP"],
    not: "docs/performance.md PERF-METRICS",
    sdk: SDK_VERSION,
    protocol: PROTOCOL_VERSION,
    harness: "0.2.1",
    node: process.version,
    iters: ITERS,
    warmup: WARMUP,
    fixture: { sections, itemsPer },
    sizes: {
      fullJson: wires.fullJson.length,
      ndjson: wires.ndjson.length,
      jsonPatch: wires.jsonPatchText.length,
      protobuf: wires.protobuf.length,
      xaiopNone: wires.xaiopNone.length,
      xaiopPhased: wires.xaiopPhased.length,
    },
    stages: stages.map((st) => ({
      id: st.id,
      msPerOp: st.msPerOp,
      iters: st.iters,
      bytesIn: st.bytesIn,
      bytesOut: st.bytesOut,
    })),
    progressive,
    streamAsync,
    parity,
    analysis: /** @type {any} */ (null),
  };
  report.analysis = analyze(report);

  const outPath = join(__dir, "last-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  if (asJson) console.log(JSON.stringify(report, null, 2));
  else {
    printHuman(report);
    console.log(`\nWrote ${outPath}`);
  }

  if (parity.some((p) => !p.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
