/**
 * Shared helpers for stream tests.
 */

import assert from "node:assert/strict";
import {
  materializeSnapshot,
  parseSync,
  STREAM_STATUS,
  TRANSPORT_KIND,
  XaiopStream,
} from "../../dist/index.js";

/**
 * @param {...string} parts
 * @returns {AsyncGenerator<string>}
 */
export async function* chunksOf(...parts) {
  for (const p of parts) {
    yield p;
    await Promise.resolve();
  }
}

/**
 * Yield one character at a time (stress network framing).
 * @param {string} text
 */
export async function* charChunks(text) {
  for (const ch of text) {
    yield ch;
    await Promise.resolve();
  }
}

/**
 * Yield fixed-size slices.
 * @param {string} text
 * @param {number} size
 */
export async function* sizedChunks(text, size) {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
    await Promise.resolve();
  }
}

/**
 * @param {import("../../src/stream/XaiopStream.js").XaiopStream} stream
 * @param {string} status
 * @param {number} [timeoutMs]
 */
export function waitStatus(stream, status, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (stream.status === status) return resolve();
      if (stream.status === STREAM_STATUS.ERROR) {
        return reject(stream.lastError ?? new Error("stream error"));
      }
      if (Date.now() - t0 > timeoutMs) {
        return reject(
          new Error(`timeout waiting for ${status}, got ${stream.status}`),
        );
      }
      setTimeout(tick, 4);
    };
    tick();
  });
}

/**
 * Expected final JSON for a full XAIOP document (strict parse, materialized).
 * @param {string} source
 */
export function expectedJson(source) {
  return materializeSnapshot(parseSync(source));
}

/**
 * Run a raw stream to completion; return { chunks, done, stream }.
 * @param {string} source
 * @param {AsyncIterable<string>} [parts]
 * @param {object} [streamOpts]
 */
export async function runRawStream(source, parts, streamOpts = {}) {
  const stream = new XaiopStream("raw://test", streamOpts);
  /** @type {unknown[]} */
  const chunks = [];
  /** @type {unknown} */
  let done;
  stream.onChunk((d) => chunks.push(d));
  stream.onDone((j) => {
    done = j;
  });
  stream.onError((e) => {
    throw e;
  });

  const sourceIter = parts ?? chunksOf(source);
  stream.send({ transport: TRANSPORT_KIND.RAW, source: sourceIter });
  await waitStatus(stream, STREAM_STATUS.COMPLETED);
  return { chunks, done, stream, source };
}

/**
 * Core consistency: stream done === one-shot parse(source).
 * @param {string} source
 * @param {AsyncIterable<string>} [parts]
 * @param {object} [streamOpts]
 */
export async function assertStreamMatchesOneShot(source, parts, streamOpts) {
  const { done, stream } = await runRawStream(source, parts, streamOpts);
  const expected = expectedJson(source);
  assert.deepEqual(done, expected, "done JSON must match one-shot parse");
  assert.deepEqual(
    stream.getSnapshot(),
    expected,
    "getSnapshot must match one-shot parse",
  );
  assert.equal(stream.getBufferedText(), source, "buffer must retain full wire");
  return { done, expected, stream };
}
