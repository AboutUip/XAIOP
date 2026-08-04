/**
 * Native WebSocket session tests — listen/push + connect/consume loopback.
 * Coverage focus: skeleton stream, phases, framing, lifecycle, errors.
 */
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  encodePhaseJson,
  STREAM_STATUS,
  TRANSPORT_KIND,
  XaiopEncodeError,
  XaiopStream,
  XaiopWs,
} from "../dist/index.js";
import { waitStatus } from "./helpers/stream.js";

/**
 * Loopback with client handlers registered at connect-time (survives sync
 * server push in `connection`), then optional clientReady gate before push.
 *
 * @param {(ctx: {
 *   server: import("../dist/index.js").XaiopWsConnection,
 *   client: import("../dist/index.js").XaiopWsConnection,
 *   phases: unknown[],
 *   committed: unknown[],
 * }) => void|Promise<void>} run
 * @param {object} [opts]
 */
async function withLoopback(run, opts = {}) {
  const hub = await XaiopWs.listen({
    port: 0,
    host: "127.0.0.1",
    ...opts,
  });
  /** @type {unknown[]} */
  const phases = [];
  /** @type {unknown[]} */
  const committed = [];

  /** @type {import("../dist/index.js").XaiopWsConnection|null} */
  let serverConn = null;
  const serverReady = new Promise((resolve) => {
    hub.onConnection((conn) => {
      serverConn = conn;
      resolve(conn);
    });
  });

  try {
    /** @type {import("../dist/index.js").XaiopWsConnection} */
    let client;
    client = await XaiopWs.connect(hub.url(), {
      ...opts,
      onPhase: (d) => {
        phases.push(d);
        committed.push(client.getCommittedSnapshot());
      },
    });
    const server = await serverReady;
    assert.ok(serverConn);
    await run({ server, client, phases, committed });
  } finally {
    await hub.close();
  }
}

/** @param {number} ms */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test("ws: listen+connect skeleton 3+5 → full Snapshot", async () => {
  await withLoopback(async ({ server, client, phases, committed }) => {
    const pieces = {
      skeleton1: { title: "A" },
      skeleton2: { title: "B" },
      skeleton3: { title: "C" },
      mod1: { rows: [1, 2] },
      mod2: { ok: true },
      mod3: { nested: { z: 3 } },
      mod4: { tags: ["x", "y"] },
      mod5: { done: true },
    };
    const keys = Object.keys(pieces);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const final = i === keys.length - 1;
      assert.equal(server.pushJson(key, pieces[key], { final }), true);
    }
    await server.end();
    const done = await client.done;
    assert.equal(phases.length, 8);
    assert.deepEqual(phases[0], { skeleton1: { title: "A" } });
    assert.deepEqual(committed[0], { skeleton1: { title: "A" } });
    assert.deepEqual(committed[2], {
      skeleton1: { title: "A" },
      skeleton2: { title: "B" },
      skeleton3: { title: "C" },
    });
    assert.deepEqual(done, {
      skeleton1: { title: "A" },
      skeleton2: { title: "B" },
      skeleton3: { title: "C" },
      mod1: { rows: [1, 2] },
      mod2: { ok: true },
      mod3: { nested: { z: 3 } },
      mod4: { tags: ["x", "y"] },
      mod5: { done: true },
    });
    assert.deepEqual(committed[committed.length - 1], {
      skeleton1: { title: "A" },
      skeleton2: { title: "B" },
      skeleton3: { title: "C" },
      mod1: { rows: [1, 2] },
      mod2: { ok: true },
      mod3: { nested: { z: 3 } },
      mod4: { tags: ["x", "y"] },
      mod5: { done: true },
    });
  });
});

test("ws: later-wins same key across phases", async () => {
  await withLoopback(async ({ server, client }) => {
    server.pushJson("meta", { v: 1 });
    server.pushJson("meta", { v: 2 }, { final: true });
    await server.end();
    assert.deepEqual(await client.done, { meta: { v: 2 } });
  });
});

test("ws: named array append across phases (re-enter, not replace)", async () => {
  await withLoopback(async ({ server, client, phases }) => {
    server.pushJson("items", [{ id: 1 }]);
    server.pushJson("items", [{ id: 2 }, { id: 3 }], { final: true });
    await server.end();
    const done = await client.done;
    assert.deepEqual(phases[0], { items: [{ id: 1 }] });
    assert.deepEqual(phases[1], { items: [{ id: 2 }, { id: 3 }] });
    assert.deepEqual(done, {
      items: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
  });
});

test("ws: pushObject multi-key phase", async () => {
  await withLoopback(async ({ server, client }) => {
    server.pushObject({ a: 1, b: 2 });
    server.pushJson("c", 3, { final: true });
    await server.end();
    assert.deepEqual(await client.done, { a: 1, b: 2, c: 3 });
  });
});

test("ws: fragmented frames across messages still parse", async () => {
  await withLoopback(async ({ server, client }) => {
    const wire = encodePhaseJson("part", { n: 1 }, { final: true });
    const mid = Math.max(2, Math.floor(wire.length / 2));
    assert.equal(server.pushWire(wire.slice(0, mid)), true);
    await delay(10);
    assert.equal(server.pushWire(wire.slice(mid)), true);
    await server.end();
    assert.deepEqual(await client.done, { part: { n: 1 } });
  });
});

test("ws: binary UTF-8 frames decode", async () => {
  await withLoopback(async ({ server, client }) => {
    const wire = encodePhaseJson("bin", { ok: true }, { final: true });
    server._ws.send(Buffer.from(wire, "utf8"));
    await server.end();
    assert.deepEqual(await client.done, { bin: { ok: true } });
  });
});

test("ws: getCommittedSnapshot mid-stream before final", async () => {
  await withLoopback(async ({ server, client, phases, committed }) => {
    server.pushJson("a", 1);
    for (let i = 0; i < 50 && phases.length < 1; i++) await delay(2);
    assert.equal(phases.length >= 1, true);
    assert.deepEqual(client.getCommittedSnapshot(), { a: 1 });
    assert.equal(client.getSnapshot(), undefined);
    server.pushJson("b", 2, { final: true });
    await server.end();
    assert.deepEqual(await client.done, { a: 1, b: 2 });
    assert.deepEqual(committed[0], { a: 1 });
  });
});

test("ws: push after end returns false", async () => {
  await withLoopback(async ({ server, client }) => {
    await server.end();
    await delay(30);
    assert.equal(server.pushJson("x", 1), false);
    assert.equal(server.pushWire(">\nx:1\n"), false);
    await client.closed;
  });
});

test("ws: encode error on pushJson does not send", async () => {
  await withLoopback(async ({ server, client }) => {
    assert.throws(() => server.pushJson("bad-", 1), (err) => {
      assert.ok(err instanceof XaiopEncodeError);
      return true;
    });
    server.pushJson("ok", 1, { final: true });
    await server.end();
    assert.deepEqual(await client.done, { ok: 1 });
  });
});

test("ws: empty phase via consecutive .", async () => {
  await withLoopback(
    async ({ server, client, phases }) => {
      server.pushWire(">\na:1\n.\n.\n");
      await server.end();
      await client.done;
      assert.deepEqual(phases[0], { a: 1 });
      assert.equal(phases[1], null);
    },
    { mergeChunkWindow: false },
  );
});

test("ws: streamProcessing false → one phase at close", async () => {
  await withLoopback(
    async ({ server, client, phases }) => {
      server.pushWire(">\na:1\n.\n>b\nc:2\n");
      await server.end();
      const done = await client.done;
      assert.equal(phases.length, 1);
      assert.deepEqual(phases[0], done);
      assert.deepEqual(done, { a: 1, b: { c: 2 } });
    },
    { streamProcessing: false },
  );
});

test("ws: client abort closes peer", async () => {
  const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
  try {
    const serverClosed = new Promise((resolve) => {
      hub.onConnection((conn) => {
        void conn.closed.then(resolve);
      });
    });
    const client = await XaiopWs.connect(hub.url());
    assert.equal(client.abort(), true);
    await Promise.race([
      serverClosed,
      delay(3000).then(() => {
        throw new Error("server did not close");
      }),
    ]);
  } finally {
    await hub.close();
  }
});

test("ws: connect bad port rejects", async () => {
  await assert.rejects(
    () => XaiopWs.connect("ws://127.0.0.1:1", { handshakeTimeoutMs: 2000 }),
    /ECONNREFUSED|WebSocket|timeout|connect/i,
  );
});

test("ws: attach to existing http.Server", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = /** @type {{ port: number }} */ (server.address());
  const hub = await XaiopWs.listen({ server, path: "/xaiop" });
  try {
    hub.onConnection(async (conn) => {
      // Defer so client handlers from connect options are live.
      await Promise.resolve();
      conn.pushJson("via", "http", { final: true });
      await conn.end();
    });
    const client = await XaiopWs.connect(`ws://127.0.0.1:${addr.port}/xaiop`);
    assert.deepEqual(await client.done, { via: "http" });
  } finally {
    await hub.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("ws: multi-connection hub serves two clients", async () => {
  const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
  try {
    hub.onConnection(async (conn) => {
      await Promise.resolve();
      conn.pushJson("hello", true, { final: true });
      await conn.end();
    });
    const [a, b] = await Promise.all([
      XaiopWs.connect(hub.url()),
      XaiopWs.connect(hub.url()),
    ]);
    const [ja, jb] = await Promise.all([a.done, b.done]);
    assert.deepEqual(ja, { hello: true });
    assert.deepEqual(jb, { hello: true });
  } finally {
    await hub.close();
  }
});

test("ws: XaiopStream websocket transport uses ws fallback", async () => {
  const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
  try {
    hub.onConnection(async (conn) => {
      await Promise.resolve();
      conn.pushJson("via", "stream", { final: true });
      await conn.end();
    });
    const stream = new XaiopStream(hub.url());
    let done;
    stream.onDone((j) => {
      done = j;
    });
    stream.send({ transport: TRANSPORT_KIND.WEBSOCKET });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.deepEqual(done, { via: "stream" });
  } finally {
    await hub.close();
  }
});

test("ws: mid-stream getSnapshot undefined; committed set", async () => {
  const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
  try {
    const serverReady = new Promise((resolve) => {
      hub.onConnection((conn) => resolve(conn));
    });
    /** @type {((v?: unknown) => void)|null} */
    let firstPhaseResolve = null;
    const firstPhase = new Promise((resolve) => {
      firstPhaseResolve = resolve;
    });
    const client = await XaiopWs.connect(hub.url(), {
      onPhase: () => {
        firstPhaseResolve?.();
      },
    });
    const serverConn = await serverReady;
    serverConn.pushJson("early", 1);
    await firstPhase;
    assert.equal(client.getSnapshot(), undefined);
    assert.deepEqual(client.getCommittedSnapshot(), { early: 1 });
    serverConn.pushJson("late", 2, { final: true });
    await serverConn.end();
    const done = await client.done;
    assert.deepEqual(done, { early: 1, late: 2 });
    assert.deepEqual(client.getSnapshot(), done);
  } finally {
    await hub.close();
  }
});

test("ws: pushWire TypeError for non-string", async () => {
  await withLoopback(async ({ server, client }) => {
    assert.throws(() => server.pushWire(/** @type {any} */ (1)), /string/);
    await server.end();
    await client.closed;
  });
});

test("ws: pushWireLn appends LF when missing; leaves existing LF", async () => {
  await withLoopback(async ({ server, client }) => {
    assert.throws(() => server.pushWireLn(/** @type {any} */ (1)), /string/);
    // Missing trailing LF → append; already-terminated frame → unchanged.
    assert.equal(server.pushWireLn(">\na:1\n."), true);
    assert.equal(server.pushWireLn(">b\nc:2\n"), true);
    await server.end();
    assert.deepEqual(await client.done, { a: 1, b: { c: 2 } });
  });
});

test("ws: connect locks handlers; listen-accept stays mutable", async () => {
  const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
  try {
    /** @type {import("../dist/index.js").XaiopWsConnection|null} */
    let server = null;
    const serverReady = new Promise((resolve) => {
      hub.onConnection((conn) => {
        server = conn;
        resolve(conn);
      });
    });
    const client = await XaiopWs.connect(hub.url(), {
      onPhase: () => {},
    });
    await serverReady;
    assert.ok(server);
    assert.equal(client.handlersLocked, true);
    assert.equal(server.handlersLocked, false);
    assert.throws(() => client.onPhase(() => {}), /locked/);
    assert.throws(() => client.onDone(() => {}), /locked/);
    assert.throws(() => client.onError(() => {}), /locked/);
    assert.throws(() => client.onLineIntercept(() => {}), /locked/);
    assert.throws(() => client.clearLineIntercepts(), /locked/);
    assert.throws(() => client.onAnnotationSpan(() => {}), /locked/);
    assert.throws(() => client.clearAnnotationSpans(), /locked/);
    assert.throws(() => client.onResume(() => {}), /locked/);
    assert.throws(() => client.onSession(() => {}), /locked/);
    assert.throws(() => client.onAck(() => {}), /locked/);
    assert.throws(() => client.onSnapshot(() => {}), /locked/);
    assert.throws(() => client.onControlError(() => {}), /locked/);
    // Accept side may still register after accept.
    server.onPhase(() => {});
    server.pushJson("ok", 1, { final: true });
    await server.end();
    assert.deepEqual(await client.done, { ok: 1 });
  } finally {
    await hub.close();
  }
});

test("ws: connect rejects empty url", async () => {
  await assert.rejects(() => XaiopWs.connect(""), /url/);
});

test("ws: sync server push in connection is not lost", async () => {
  const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
  try {
    hub.onConnection((conn) => {
      // Intentionally synchronous — the historical race.
      conn.pushJson("sync", 1, { final: true });
      void conn.end();
    });
    const client = await XaiopWs.connect(hub.url());
    assert.deepEqual(await client.done, { sync: 1 });
  } finally {
    await hub.close();
  }
});
