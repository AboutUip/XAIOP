import { DotCheckpointEngine } from "xaiop/checkpoint";
import { parseSync } from "xaiop/parse";
import { materializeSnapshot } from "xaiop/materialize";

/**
 * Browser stream simulator with Play (timed) and Step (debug) modes.
 * Feeds wire through DotCheckpointEngine — same phase semantics as XaiopStream.
 */
export class StreamSimulator {
  constructor() {
    /** @type {ReturnType<typeof setTimeout>|null} */
    this._timer = null;
    /** @type {(() => void)|null} */
    this._wake = null;
    this._aborted = false;
    /** @type {((sim: StreamSimulator) => void)|null} */
    this._onUpdate = null;
    this._chunkChars = 12;
    this._delayMs = 1000;
    this._playLoop = null;
    this.resetState();
  }

  resetState() {
    this.status = "idle";
    this.wire = "";
    this.received = "";
    this.cursor = 0;
    this.phases = [];
    this.latestPhase = undefined;
    /** Committed JSON — only advances at `.` phase / EOF, never mid-phase. */
    this.cumulative = null;
    this.final = null;
    this.committedAt = 0;
    /** SDK ParseHistory time-root (when historySnapshot is on). */
    this.historyNodes = [];
    this.historyInfo = null;
    this.error = "";
    this.startedAt = 0;
    this.finishedAt = 0;
    this.chunkCount = 0;
    this.lastChunk = "";
    /** @type {DotCheckpointEngine|null} */
    this._engine = null;
  }

  get elapsedMs() {
    if (!this.startedAt) return 0;
    const end = this.finishedAt || Date.now();
    return end - this.startedAt;
  }

  get progress() {
    if (!this.wire.length) return 0;
    return Math.min(1, this.cursor / this.wire.length);
  }

  get remaining() {
    return Math.max(0, this.wire.length - this.cursor);
  }

  get canStep() {
    return (
      (this.status === "ready" ||
        this.status === "paused" ||
        this.status === "stepping") &&
      this.cursor < this.wire.length
    );
  }

  get isBusy() {
    return this.status === "running";
  }

  /**
   * Arm a wire for Play / Step without consuming yet.
   * @param {string} wire
   * @param {{
   *   chunkChars?: number,
   *   delayMs?: number,
   *   onUpdate?: (sim: StreamSimulator) => void,
   * }} [opts]
   */
  arm(wire, opts = {}) {
    this.stop();
    this.resetState();
    this.wire = wire;
    this._chunkChars = Math.max(1, Math.floor(Number(opts.chunkChars ?? 12)));
    this._delayMs = Math.max(0, Number(opts.delayMs ?? 1000));
    this._onUpdate = opts.onUpdate || null;
    this._aborted = false;
    this.status = "ready";
    this._engine = new DotCheckpointEngine({
      compat: false,
      streamProcessing: true,
      // Playground uses SDK snapshot history (0.7.0+) for before/after per `.`
      historySnapshot: true,
      mergeChunkWindow: false,
      onChunk: (diff) => {
        const entry = {
          index: this.phases.length + 1,
          atMs: this.startedAt ? Date.now() - this.startedAt : 0,
          value: diff,
          json: stableStringify(diff),
        };
        this.phases.push(entry);
        this.latestPhase = diff;
        // Bind UI / cumulative JSON only when a phase is allocatable.
        this.cumulative = this._engine?.committedSnapshot ?? null;
        this.committedAt = this._engine?.committedAt ?? 0;
        this._syncHistory();
        this._emit();
      },
    });
    this._emit();
  }

  _syncHistory() {
    const h = this._engine?.history;
    if (!h) {
      this.historyNodes = [];
      this.historyInfo = null;
      return;
    }
    this.historyInfo = h.info();
    try {
      this.historyNodes = h.exportTimeRoot();
    } catch {
      this.historyNodes = [];
    }
  }

  setDelayMs(ms) {
    this._delayMs = Math.max(0, Number(ms) || 0);
  }

  setChunkChars(n) {
    this._chunkChars = Math.max(1, Math.floor(Number(n) || 1));
  }

  /**
   * Release exactly one network chunk (debug step).
   * @returns {boolean} true if more data remains after this step
   */
  step() {
    if (this.status === "completed" || this.status === "error") return false;
    if (this.status === "idle") return false;
    if (!this._engine) return false;

    if (!this.startedAt) this.startedAt = Date.now();
    this.status = "stepping";
    this._aborted = false;

    if (this.cursor >= this.wire.length) {
      this._finish();
      return false;
    }

    try {
      this._pushNextChunk();
      if (this.cursor >= this.wire.length) {
        this._finish();
        return false;
      }
      this.status = "paused";
      this._emit();
      return true;
    } catch (e) {
      this.error = e?.message || String(e);
      this.status = "error";
      this.finishedAt = Date.now();
      this._emit();
      return false;
    }
  }

  /**
   * Auto-play remaining chunks with delay between them.
   * @param {{ delayMs?: number, chunkChars?: number }} [opts]
   */
  async play(opts = {}) {
    if (opts.delayMs != null) this.setDelayMs(opts.delayMs);
    if (opts.chunkChars != null) this.setChunkChars(opts.chunkChars);

    if (this.status === "completed" || this.status === "error") return;
    if (this.status === "idle" || !this._engine) return;

    if (this._playLoop) {
      if (this.status === "paused" || this.status === "stepping" || this.status === "ready") {
        this._aborted = false;
        this.status = "running";
        if (!this.startedAt) this.startedAt = Date.now();
        this._clearTimer();
        this._emit();
      }
      await this._playLoop;
      return;
    }

    this._aborted = false;
    this.status = "running";
    if (!this.startedAt) this.startedAt = Date.now();
    this._emit();

    this._playLoop = (async () => {
      try {
        while (this.cursor < this.wire.length) {
          if (this._aborted) {
            this.status = "aborted";
            this.finishedAt = Date.now();
            this._emit();
            return;
          }
          if (this.status === "paused") {
            await this._waitWhilePaused();
            if (this._aborted) {
              this.status = "aborted";
              this.finishedAt = Date.now();
              this._emit();
              return;
            }
            if (this.status !== "running") return;
          }

          this._pushNextChunk();
          this._emit();

          if (this.cursor < this.wire.length && this._delayMs > 0) {
            await sleep(this._delayMs, this);
            this._timer = null;
          }
        }
        if (!this._aborted) this._finish();
      } catch (e) {
        this.error = e?.message || String(e);
        this.status = "error";
        this.finishedAt = Date.now();
        this._emit();
      } finally {
        this._playLoop = null;
      }
    })();

    await this._playLoop;
  }

  pause() {
    if (this.status === "running") {
      this.status = "paused";
      this._clearTimer();
      this._emit();
    }
  }

  resume() {
    if (this.status === "paused") {
      this.play();
    }
  }

  stop() {
    this._aborted = true;
    this._clearTimer();
    if (this.status === "running" || this.status === "paused" || this.status === "stepping") {
      this.status = "aborted";
      this.finishedAt = Date.now();
    }
  }

  _pushNextChunk() {
    const next = this.wire.slice(this.cursor, this.cursor + this._chunkChars);
    this.cursor += next.length;
    this.received += next;
    this.lastChunk = next;
    this.chunkCount += 1;
    this._engine.push(next);
    // Do NOT parse mid-phase buffer for UI — wait for onChunk (`.` / EOF).
  }

  _finish() {
    this._engine.finish();
    this.final = this._engine.snapshot ?? null;
    this.cumulative = this._engine.committedSnapshot ?? this.final;
    this.committedAt = this._engine.committedAt ?? this.received.length;
    this._syncHistory();
    this.status = "completed";
    this.finishedAt = Date.now();
    this._emit();
  }

  _emit() {
    this._onUpdate?.(this);
  }

  _clearTimer() {
    if (this._timer != null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._sleepResolve) {
      const r = this._sleepResolve;
      this._sleepResolve = null;
      r();
    }
    if (this._wake) {
      const w = this._wake;
      this._wake = null;
      w();
    }
  }

  async _waitWhilePaused() {
    while (this.status === "paused" && !this._aborted) {
      this._emit();
      await new Promise((resolve) => {
        this._wake = resolve;
        this._timer = setTimeout(() => {
          this._timer = null;
          if (this._wake === resolve) {
            this._wake = null;
            resolve();
          }
        }, 80);
      });
    }
  }
}

function sleep(ms, sim) {
  return new Promise((resolve) => {
    sim._sleepResolve = resolve;
    sim._timer = setTimeout(() => {
      sim._timer = null;
      if (sim._sleepResolve === resolve) {
        sim._sleepResolve = null;
        resolve();
      }
    }, ms);
  });
}

function stableStringify(value) {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, null, 2);
}

export function previewFinal(wire) {
  try {
    return {
      ok: true,
      value: materializeSnapshot(parseSync(wire)),
      error: "",
    };
  } catch (e) {
    return { ok: false, value: null, error: e?.message || String(e) };
  }
}

export function collectPhases(wire) {
  const phases = [];
  const eng = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    onChunk: (diff) => phases.push(diff),
  });
  eng.push(wire);
  eng.finish();
  return { phases, final: eng.snapshot ?? null };
}
