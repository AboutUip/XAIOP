"""Dot-checkpoint stream parser (XAIOP PROT-HIER / PROT-BOUND)."""

from __future__ import annotations

import threading
from typing import Any, Callable

from . import _checkpoint_ops as _ops
from .annotation_span import apply_annotation_spans
from .clone import clone_json
from .history import ParseHistory
from .line_intercept import run_line_intercept_chain
from .materialize import materialize_owned, materialize_snapshot
from .parse import LiveParser, parse_sync
from .schedule import schedule_immediate


class DotCheckpointEngine:
    def __init__(self, hooks: dict[str, Any]) -> None:
        self._hooks = hooks
        self._stream_processing = hooks.get("streamProcessing", hooks.get("stream_processing", True)) is not False
        self._emit_diff = hooks.get("emitDiff", hooks.get("emit_diff", True)) is not False
        self._merge_chunk_window = hooks.get("mergeChunkWindow", hooks.get("merge_chunk_window", True)) is not False
        self._cover = hooks.get("cover") is True
        self._buffer = ""
        self._segment_start = 0
        self._scan_at = 0
        self._saw_dot = False
        self._latest_snapshot: Any = None
        self._committed_at = 0
        self._committed_snapshot: Any | None = None
        self._commit_from_live = False
        self._closed = False
        self._live: LiveParser | None = None
        self._phase_lines: list[str] = []
        self._async_drain_scheduled = False
        self._async_drain_promise: threading.Event | None = None
        self._async_drain_cancel: Callable[[], None] | None = None

        snap = hooks.get("historySnapshot", hooks.get("history_snapshot")) is True
        live = hooks.get("historyRealtime", hooks.get("history_realtime")) is True
        self._history: ParseHistory | None = (
            ParseHistory(
                snapshot=snap,
                realtime=live,
                retain_wire=hooks.get("retainWireHistory", hooks.get("retain_wire_history", True)) is not False,
                compat=hooks.get("compat", False),
            )
            if snap or live
            else None
        )

        self._line_interceptors: list[Any] = []
        li = hooks.get("lineIntercept", hooks.get("line_intercept"))
        if li:
            init = li if isinstance(li, list) else [li]
            self._line_interceptors = [fn for fn in init if callable(fn)]

        self._annotation_span_handlers: list[Any] = []
        self._pending_type_check_escape: list[str] = []
        asp = hooks.get("annotationSpan", hooks.get("annotation_span"))
        if asp:
            init = asp if isinstance(asp, list) else [asp]
            self._annotation_span_handlers = [fn for fn in init if callable(fn)]

        self._phase_seq_enabled = hooks.get("phaseSeq", hooks.get("phase_seq", True)) is not False
        self._phase_seq = 0
        self._pending_seqs: list[int] = []
        self._log_seq_queue: list[int] = []
        self._pending_log_seqs: list[int] = []

    @property
    def buffer(self) -> str:
        return self._buffer

    @property
    def snapshot(self) -> Any:
        return self._latest_snapshot

    @property
    def committed_at(self) -> int:
        return self._committed_at

    @property
    def phase_seq(self) -> int:
        return self._phase_seq

    @property
    def stream_processing(self) -> bool:
        return self._stream_processing

    @property
    def merge_chunk_window(self) -> bool:
        return self._merge_chunk_window

    @property
    def history(self) -> ParseHistory | None:
        return self._history

    @property
    def line_intercept_count(self) -> int:
        return len(self._line_interceptors)

    @property
    def annotation_span_count(self) -> int:
        return len(self._annotation_span_handlers)

    @property
    def committed_snapshot(self) -> Any:
        if self._commit_from_live and self._live:
            self._committed_snapshot = materialize_snapshot(self._live.value())
            self._commit_from_live = False
        if self._committed_snapshot is None and not self._commit_from_live:
            return None
        return self._committed_snapshot

    def on_line_intercept(self, fn: Callable[..., Any]) -> DotCheckpointEngine:
        if not callable(fn):
            raise TypeError("on_line_intercept requires a function")
        self._line_interceptors.append(fn)
        return self

    def clear_line_intercepts(self) -> DotCheckpointEngine:
        self._line_interceptors.clear()
        return self

    def on_annotation_span(self, fn: Callable[..., Any]) -> DotCheckpointEngine:
        if not callable(fn):
            raise TypeError("on_annotation_span requires a function")
        self._annotation_span_handlers.append(fn)
        return self

    def clear_annotation_spans(self) -> DotCheckpointEngine:
        self._annotation_span_handlers.clear()
        return self

    def note_log_seq(self, seq: int) -> DotCheckpointEngine:
        n = int(seq)
        if n < 1:
            raise TypeError("note_log_seq requires seq >= 1")
        self._log_seq_queue.append(n)
        return self

    def buffer_stats(self) -> dict[str, Any]:
        length = len(self._buffer)
        committed_at = self._committed_at
        return {
            "length": length,
            "committedAt": committed_at,
            "pendingBytes": max(0, length - committed_at),
            "openPhase": self._segment_start < length,
        }

    def compact_committed(self, *, drop_history: bool = False) -> dict[str, int]:
        if self._closed:
            raise RuntimeError("compact_committed: checkpoint engine is closed")
        self._resolve_async_drain_early()
        if self._history:
            if (
                self._history.realtime_enabled
                and self._history.retain_wire_enabled
                and not drop_history
            ):
                raise RuntimeError(
                    "compact_committed conflicts with historyRealtime + "
                    "retainWireHistory; pass drop_history=True or disable retainWireHistory"
                )
            if self._history.length > 0 and not drop_history:
                raise RuntimeError(
                    "compact_committed invalidates history buffer indices; "
                    "pass drop_history=True"
                )
            if drop_history:
                self._history.clear()
        cut = self._committed_at
        if cut <= 0:
            return {"discardedBytes": 0, "length": len(self._buffer)}
        if cut > len(self._buffer):
            discarded = len(self._buffer)
            self._buffer = ""
            self._committed_at = 0
            self._segment_start = 0
            self._scan_at = 0
            self._phase_lines = []
            return {"discardedBytes": discarded, "length": 0}
        self._buffer = self._buffer[cut:]
        self._committed_at = 0
        self._segment_start = max(0, self._segment_start - cut)
        self._scan_at = max(0, self._scan_at - cut)
        self._phase_lines = []
        return {"discardedBytes": cut, "length": len(self._buffer)}

    def history_info(self) -> dict[str, Any]:
        if self._history:
            return self._history.info()
        return {
            "snapshot": False,
            "realtime": False,
            "length": 0,
            "liveCursor": -1,
            "sourceKey": None,
            "hasRangeView": False,
            "rangeView": None,
        }

    def jump_to(self, index: int) -> dict[str, Any]:
        if not self._history or not self._history.realtime_enabled:
            raise RuntimeError("jump_to requires historyRealtime")
        self._resolve_async_drain_early()
        result = self._history.jump_to(index)
        self._rebuild_from_history_jump(result)
        return result

    def push(self, chunk: str) -> None:
        if self._closed:
            raise RuntimeError("checkpoint engine is closed")
        if not isinstance(chunk, str):
            raise TypeError("stream chunk must be a string")
        if not chunk:
            return
        self._buffer += chunk
        self._resolve_async_drain_early()
        if self._stream_processing:
            self._scan_dots(False)

    def push_async(self, chunk: str) -> threading.Event:
        if self._closed:
            raise RuntimeError("checkpoint engine is closed")
        if not isinstance(chunk, str):
            raise TypeError("stream chunk must be a string")
        done = threading.Event()
        if not chunk:
            done.set()
            return done
        self._buffer += chunk
        if not self._stream_processing:
            done.set()
            return done
        return self._schedule_async_drain(done)

    def finish(self) -> None:
        if self._closed:
            return
        self._resolve_async_drain_early()
        self._finish_body()

    def finish_async(self, done: threading.Event | None = None) -> threading.Event:
        event = done or threading.Event()

        def _run() -> None:
            if self._async_drain_promise:
                self._async_drain_promise.wait()
            schedule_immediate(lambda: self._finish_async_body(event))

        threading.Thread(target=_run, daemon=True).start()
        return event

    def _finish_async_body(self, event: threading.Event) -> None:
        try:
            if not self._closed:
                self._finish_body()
            event.set()
        except Exception:
            event.set()
            raise

    def _finish_body(self) -> None:
        self._closed = True
        if not self._stream_processing:
            value = self._parse_owned(self._buffer)
            self._store_commit(len(self._buffer), value, False)
            self._alloc_phase_seq()
            self._emit_chunk(value)
            self._latest_snapshot = value
            self._segment_start = len(self._buffer)
            self._scan_at = len(self._buffer)
            self._phase_lines = []
            return
        self._scan_dots(True)
        self._flush_tail()
        if self._committed_at == len(self._buffer):
            self._latest_snapshot = self.committed_snapshot
        else:
            self._latest_snapshot = self._parse_owned(self._buffer)
            self._store_commit(len(self._buffer), self._latest_snapshot, False)

    def _schedule_async_drain(self, done: threading.Event) -> threading.Event:
        if self._async_drain_promise:
            return self._async_drain_promise

        cancelled = {"v": False}

        def cancel() -> None:
            cancelled["v"] = True

        self._async_drain_cancel = cancel
        evt = threading.Event()
        self._async_drain_promise = evt

        def drain() -> None:
            self._async_drain_scheduled = False
            self._async_drain_promise = None
            self._async_drain_cancel = None
            if cancelled["v"]:
                evt.set()
                done.set()
                return
            try:
                if not self._closed and self._stream_processing:
                    self._scan_dots(False)
            finally:
                evt.set()
                done.set()

        schedule_immediate(drain)
        return evt

    def _resolve_async_drain_early(self) -> None:
        if self._async_drain_cancel:
            self._async_drain_cancel()

    def _scan_dots(self, at_eof: bool) -> None:
        if self._merge_chunk_window:
            self._scan_dots_merged(at_eof)
            return
        while self._scan_at < len(self._buffer):
            info = _ops.read_line(self._buffer, self._scan_at, at_eof)
            if not info:
                break
            self._scan_at = info["end"]
            accepted = self._accept_line(info["line"])
            if accepted is None:
                if not info["consumed_newline"] and at_eof:
                    break
                continue
            self._phase_lines.append(accepted)
            if accepted == ".":
                self._emit_phase(info["end"])
            if not info["consumed_newline"] and at_eof:
                break

    def _scan_dots_merged(self, at_eof: bool) -> None:
        closed: list[dict[str, Any]] = []
        phase_lines = self._phase_lines
        segment_start = self._segment_start
        while self._scan_at < len(self._buffer):
            info = _ops.read_line(self._buffer, self._scan_at, at_eof)
            if not info:
                break
            self._scan_at = info["end"]
            accepted = self._accept_line(info["line"])
            if accepted is None:
                if not info["consumed_newline"] and at_eof:
                    break
                continue
            phase_lines.append(accepted)
            if accepted == ".":
                closed.append(
                    {
                        "end": info["end"],
                        "lines": phase_lines,
                        "start": segment_start,
                    }
                )
                phase_lines = []
                segment_start = info["end"]
            if not info["consumed_newline"] and at_eof:
                break
        self._phase_lines = phase_lines
        self._segment_start = segment_start
        if not closed:
            return
        self._emit_closed_window(closed)

    def _emit_closed_window(self, closed: list[dict[str, Any]]) -> None:
        last_end = closed[-1]["end"]
        if self._cover:
            for phase in closed:
                self._emit_cover_phase(phase["lines"], phase["start"], phase["end"])
            self._segment_start = last_end
            return

        for _ in closed:
            self._alloc_phase_seq()

        if self._history:
            for phase in closed:
                phase["lines"] = self._apply_annotation_spans(phase["lines"])
                before = (
                    self._history.peek_after(self._history.length - 1)
                    if self._history.length > 0
                    else self._peek_commit()
                )
                raw = self._phase_wire(phase["lines"], phase["start"], phase["end"])
                had_prior_dot = self._saw_dot
                self._feed_live_lines(phase["lines"])
                self._saw_dot = had_prior_dot
                diff, committed, from_live = self._build_diff(raw)
                self._saw_dot = True
                self._store_commit(phase["end"], committed, from_live)
                after = self._peek_commit()
                self._history.record_owned(
                    {
                        "kind": "dot",
                        "bufferStart": phase["start"],
                        "bufferEnd": phase["end"],
                        "wire": raw,
                        "before": before,
                        "after": after,
                        "diff": diff,
                    }
                )
            self._segment_start = last_end
            if not self._emit_diff:
                self._emit_chunk(None)
                return
            if len(closed) == 1:
                self._emit_chunk(self._history.peek_diff(self._history.length - 1))
                return
            self._emit_chunk(clone_json(self._peek_commit()))
            return

        all_lines: list[str] = []
        for phase in closed:
            lines = self._apply_annotation_spans(phase["lines"])
            phase["lines"] = lines
            all_lines.extend(lines)
        saw_dot_before = self._saw_dot
        self._feed_live_lines(all_lines)
        self._saw_dot = True
        self._segment_start = last_end
        if not self._emit_diff:
            self._store_commit(last_end, None, True)
            self._emit_chunk(None)
            return
        if len(closed) == 1:
            raw = self._phase_wire(
                closed[0]["lines"], closed[0]["start"], closed[0]["end"]
            )
            self._saw_dot = saw_dot_before
            diff, committed, from_live = self._build_diff(raw)
            self._saw_dot = True
            self._store_commit(last_end, committed, from_live)
            self._emit_chunk(diff)
            return
        self._store_commit(last_end, None, True)
        self._emit_chunk(materialize_snapshot(self._live.value()))

    def _emit_phase(self, end: int) -> None:
        start = self._segment_start
        lines = self._apply_annotation_spans(self._phase_lines)
        raw = self._phase_wire(lines, start, end)
        self._phase_lines = []
        if self._cover:
            self._emit_cover_phase(lines, start, end)
            self._segment_start = end
            return
        self._alloc_phase_seq()
        before = (
            (
                self._history.peek_after(self._history.length - 1)
                if self._history.length > 0
                else self._peek_commit()
            )
            if self._history
            else None
        )
        self._feed_live_lines(lines)
        diff, committed, from_live = self._build_diff(raw)
        self._saw_dot = True
        self._segment_start = end
        self._store_commit(end, committed, from_live)
        if self._history:
            self._history.record_owned(
                {
                    "kind": "dot",
                    "bufferStart": start,
                    "bufferEnd": end,
                    "wire": raw,
                    "before": before,
                    "after": self._peek_commit(),
                    "diff": diff,
                }
            )
        self._emit_chunk(diff)

    def _flush_tail(self) -> None:
        if self._segment_start < len(self._buffer):
            start = self._segment_start
            lines = self._apply_annotation_spans(self._phase_lines)
            raw = self._phase_wire(lines, start, len(self._buffer))
            self._phase_lines = []
            if self._cover:
                self._emit_cover_phase(lines, start, len(self._buffer), is_tail=True)
                self._segment_start = len(self._buffer)
                return
            self._alloc_phase_seq()
            before = (
                (
                    self._history.peek_after(self._history.length - 1)
                    if self._history.length > 0
                    else self._peek_commit()
                )
                if self._history
                else None
            )
            self._feed_live_lines(lines)
            if not self._saw_dot:
                if not self._emit_diff:
                    diff, committed, from_live = None, None, True
                elif _ops.is_empty_phase_wire(raw):
                    diff, committed, from_live = None, None, True
                else:
                    diff = materialize_snapshot(self._live.value())
                    committed, from_live = None, True
            else:
                diff, committed, from_live = self._build_diff(raw)
            self._segment_start = len(self._buffer)
            self._store_commit(len(self._buffer), committed, from_live)
            if self._history:
                self._history.record_owned(
                    {
                        "kind": "tail",
                        "bufferStart": start,
                        "bufferEnd": len(self._buffer),
                        "wire": raw,
                        "before": before,
                        "after": self._peek_commit(),
                        "diff": diff,
                    }
                )
            self._emit_chunk(diff)
            return
        if not self._saw_dot and len(self._buffer) == 0:
            self._phase_lines = []
            self._store_commit(0, None, False)
            self._emit_chunk(None)

    def _emit_cover_phase(
        self,
        lines: list[str],
        buffer_start: int,
        buffer_end: int,
        *,
        is_tail: bool = False,
    ) -> None:
        lines = self._apply_annotation_spans(lines)
        trailing_dot = bool(lines) and lines[-1] == "."
        body_len = len(lines) - (1 if trailing_dot else 0)
        pending_restore: list[str] = []
        i = 0
        any_emitted = False
        while i < body_len:
            j = i
            while j < body_len and not _ops.is_amp_line(lines[j]):
                j += 1
            if j < body_len:
                prefix = pending_restore + lines[i:j]
                pending_restore = []
                self._ensure_live()
                if prefix:
                    self._feed_live_lines(prefix)
                restore = self._live.cursor_restore_lines() if self._live else []
                if prefix:
                    self._feed_live_lines(["."])
                    self._emit_cover_chunk(
                        prefix + ["."], None, buffer_start, buffer_end, "dot"
                    )
                    any_emitted = True
                k = j
                while k < body_len and _ops.is_amp_line(lines[k]):
                    k += 1
                amps = lines[j:k]
                self._feed_live_lines(amps)
                tombstone = _ops.build_delete_tombstone(amps)
                self._feed_live_lines(["."])
                self._emit_cover_chunk(
                    amps + ["."], tombstone, buffer_start, buffer_end, "dot"
                )
                any_emitted = True
                pending_restore = restore
                i = k
                continue
            rest_body = pending_restore + lines[i:body_len]
            pending_restore = []
            if rest_body:
                self._feed_live_lines(rest_body)
            if trailing_dot:
                self._feed_live_lines(["."])
                wire_lines = rest_body + ["."]
                self._emit_cover_chunk(
                    wire_lines if wire_lines else ["."],
                    None,
                    buffer_start,
                    buffer_end,
                    "dot",
                )
                any_emitted = True
            elif rest_body:
                committed = materialize_snapshot(self._live.value())
                self._store_commit(buffer_end, committed, False)
                self._emit_cover_chunk(
                    rest_body,
                    None,
                    buffer_start,
                    buffer_end,
                    "tail" if is_tail else "dot",
                    committed_diff=True,
                )
                any_emitted = True
            i = body_len
        if pending_restore:
            self._feed_live_lines(pending_restore)
            committed = materialize_snapshot(self._live.value())
            self._store_commit(buffer_end, committed, False)
            self._saw_dot = True
        elif not any_emitted and trailing_dot:
            self._feed_live_lines(["."])
            self._saw_dot = True
            self._store_commit(buffer_end, None, True)
            if self._history:
                tip = (
                    self._history.peek_after(self._history.length - 1)
                    if self._history.length > 0
                    else self._peek_commit()
                )
                self._history.record_owned(
                    {
                        "kind": "dot",
                        "bufferStart": buffer_start,
                        "bufferEnd": buffer_end,
                        "wire": ".\n",
                        "before": tip,
                        "after": tip,
                        "diff": None,
                    }
                )
            self._alloc_phase_seq()
            self._emit_chunk(None)
        elif not any_emitted and is_tail and lines:
            self._feed_live_lines(lines)
            self._store_commit(buffer_end, None, True)
            self._alloc_phase_seq()
            diff = (
                materialize_snapshot(self._live.value())
                if self._emit_diff
                else None
            )
            self._emit_chunk(diff)
        self._saw_dot = self._saw_dot or trailing_dot or any_emitted

    def _emit_cover_chunk(
        self,
        wire_lines: list[str],
        tombstone: dict[str, Any] | None,
        buffer_start: int,
        buffer_end: int,
        kind: str,
        *,
        committed_diff: bool = False,
    ) -> None:
        self._alloc_phase_seq()
        before = (
            (
                self._history.peek_after(self._history.length - 1)
                if self._history.length > 0
                else self._peek_commit()
            )
            if self._history
            else None
        )
        self._saw_dot = True
        wire = _ops.lines_to_wire(wire_lines)
        diff = None
        if self._emit_diff:
            if tombstone:
                diff = clone_json(tombstone)
                self._store_commit(buffer_end, None, True)
            elif committed_diff:
                diff = materialize_snapshot(self._live.value())
                self._store_commit(buffer_end, None, True)
            else:
                built = self._build_diff(wire)
                diff = built[0]
                self._store_commit(buffer_end, built[1], built[2])
        else:
            self._store_commit(buffer_end, None, True)
        if self._history:
            self._history.record_owned(
                {
                    "kind": kind,
                    "bufferStart": buffer_start,
                    "bufferEnd": buffer_end,
                    "wire": wire,
                    "before": before,
                    "after": self._peek_commit(),
                    "diff": diff,
                }
            )
        self._emit_chunk(diff)

    def _apply_annotation_spans(self, lines: list[str]) -> list[str]:
        if not self._annotation_span_handlers:
            return lines
        result = apply_annotation_spans(lines, self._annotation_span_handlers)
        if result["escape_paths"]:
            self._pending_type_check_escape.extend(result["escape_paths"])
        return result["lines"]

    def _accept_line(self, line: str) -> str | None:
        if not self._line_interceptors:
            return line
        return run_line_intercept_chain(line, self._line_interceptors)

    def _phase_wire(self, lines: list[str], buffer_start: int, buffer_end: int) -> str:
        if self._line_interceptors or self._annotation_span_handlers:
            return _ops.lines_to_wire(lines)
        return self._buffer[buffer_start:buffer_end]

    def _alloc_phase_seq(self) -> int | None:
        if not self._phase_seq_enabled:
            return None
        self._phase_seq += 1
        self._pending_seqs.append(self._phase_seq)
        if self._log_seq_queue:
            self._pending_log_seqs.append(self._log_seq_queue.pop(0))
        return self._phase_seq

    def _emit_chunk(self, diff: Any) -> None:
        escapes = self._pending_type_check_escape
        self._pending_type_check_escape = []
        seqs = self._pending_seqs
        self._pending_seqs = []
        log_seqs = self._pending_log_seqs
        self._pending_log_seqs = []
        cb = self._hooks.get("onChunk", self._hooks.get("on_chunk"))
        if not callable(cb):
            return
        meta: dict[str, Any] = {}
        if escapes:
            meta["typeCheckEscapePaths"] = list(dict.fromkeys(escapes))
        if seqs:
            meta["seqs"] = seqs[:]
            meta["seq"] = seqs[-1]
        if log_seqs:
            meta["logSeqs"] = log_seqs[:]
            meta["logSeq"] = log_seqs[-1]
        if meta:
            cb(diff, meta)
        else:
            cb(diff)

    def _ensure_live(self) -> None:
        if not self._live:
            self._live = LiveParser(self._live_opts())

    def _live_opts(self) -> dict[str, Any]:
        return {
            "compat": self._hooks.get("compat", False),
            "symbolKeys": self._hooks.get("symbolKeys", self._hooks.get("symbol_keys", False))
            is True,
        }

    def _peek_commit(self) -> Any:
        if self._commit_from_live and self._live:
            return materialize_snapshot(self._live.value())
        if self._committed_snapshot is None and not self._commit_from_live:
            return None
        return self._committed_snapshot

    def _feed_live_lines(self, lines: list[str]) -> None:
        if not self._live:
            self._live = LiveParser(self._live_opts())
        self._committed_snapshot = None
        self._commit_from_live = True
        self._live.feed_lines(lines)

    def _build_diff(self, raw: str) -> tuple[Any, Any, bool]:
        if not self._emit_diff:
            return None, None, True
        if not self._saw_dot or _ops.phase_needs_prior_tree(raw):
            if _ops.is_empty_phase_wire(raw):
                return None, None, True
            return materialize_snapshot(self._live.value()), None, True
        try:
            text = _ops.with_leading_dot(
                _ops.ensure_diff_document_root(raw, self._live_root_kind())
            )
            diff = _ops.normalize_empty_phase(raw, self._parse_owned(text))
            return diff, None, True
        except Exception:
            if _ops.is_empty_phase_wire(raw):
                return None, None, True
            return materialize_snapshot(self._live.value()), None, True

    def _live_root_kind(self) -> str | None:
        if not self._live:
            return None
        inner = self._live._p
        doc_kind = getattr(inner, "doc_kind", None)
        if doc_kind in ("array", "fragment", "object"):
            return doc_kind
        try:
            v = self._live.value()
            if isinstance(v, list):
                return "array"
        except Exception:
            pass
        return "object"

    def _store_commit(self, at: int, snapshot: Any, from_live: bool) -> None:
        self._committed_at = at
        self._commit_from_live = from_live
        if from_live:
            self._committed_snapshot = None
        else:
            self._committed_snapshot = snapshot

    def _parse_owned(self, text: str) -> Any:
        if not text:
            return None
        return materialize_owned(
            parse_sync(text, self._live_opts())
        )

    def _rebuild_from_history_jump(self, result: dict[str, Any]) -> None:
        end = result["bufferEnd"]
        if result.get("wirePrefix") is not None:
            self._buffer = result["wirePrefix"]
        elif end <= len(self._buffer):
            self._buffer = self._buffer[:end]
        else:
            self._buffer = self._buffer[: min(end, len(self._buffer))]
        self._live = LiveParser(self._live_opts())
        if self._buffer:
            if self._line_interceptors:
                at = 0
                while at < len(self._buffer):
                    info = _ops.read_line(self._buffer, at, True)
                    if not info:
                        break
                    at = info["end"]
                    accepted = self._accept_line(info["line"])
                    if accepted is not None:
                        self._live.feed_line(accepted)
            else:
                self._live.feed_text(self._buffer)
        self._saw_dot = True
        self._segment_start = len(self._buffer)
        self._scan_at = len(self._buffer)
        self._phase_lines = []
        self._committed_at = len(self._buffer)
        self._committed_snapshot = result.get("after")
        self._commit_from_live = False
        self._latest_snapshot = None
        self._closed = False

