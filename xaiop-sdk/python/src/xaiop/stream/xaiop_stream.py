"""XaiopStream — independent streaming client for XAIOP over the network."""

from __future__ import annotations

import queue
import threading
from concurrent.futures import Future
from typing import Any, Callable, Iterator

from ..checkpoint import DotCheckpointEngine
from ..clone import clone_json
from ..compat import CompatPolicy
from ..control import ControlPlaneHost, XaiopControlError
from ..modes import ALL_STREAM_MODES, STREAM_MODES, normalize_modes
from ..states import STREAM_STATUS, is_stream_busy
from ..types import TypeFreezeSession
from .transport import TRANSPORT_KIND, TransportHandlers, TransportRequest, open_transport


class XaiopStream:
  def __init__(self, url: str, **options: Any) -> None:
    if not isinstance(url, str) or not url:
      raise TypeError("XaiopStream requires a non-empty url")
    self._url = url
    self._stream_processing = options.get("stream_processing", options.get("streamProcessing", True)) is not False
    self._compatibility_mode = bool(options.get("compatibility_mode", options.get("compatibilityMode")))
    self._merge_chunk_window = options.get("merge_chunk_window", options.get("mergeChunkWindow", True)) is not False
    self._async_parse = options.get("async_parse", options.get("asyncParse")) is True
    self._history_snapshot = options.get("history_snapshot", options.get("historySnapshot")) is True
    self._history_realtime = options.get("history_realtime", options.get("historyRealtime")) is True
    self._retain_wire_history = options.get("retain_wire_history", options.get("retainWireHistory", True)) is not False
    self._cover = options.get("cover") is True
    self._symbol_keys = options.get("symbol_keys", options.get("symbolKeys")) is True
    self._type_check = bool(options.get("type_check", options.get("typeCheck"))) and not self._compatibility_mode
    self._compat = CompatPolicy()
    self._type_session: TypeFreezeSession | None = (
      TypeFreezeSession(schema=options.get("type_schema", options.get("typeSchema")))
      if self._type_check
      else None
    )
    self._modes = normalize_modes(options.get("modes"))
    self._auto_ack = options.get("auto_ack", options.get("autoAck")) is True

    self._control = ControlPlaneHost(
      send=lambda _t: False,
      get_committed_snapshot=self.get_committed_snapshot,
      session=options.get("session", False),
      auto_ack=self._auto_ack,
      on_control_error=options.get("on_control_error", options.get("onControlError")),
      on_session=options.get("on_session", options.get("onSession")),
      on_resume=options.get("on_resume", options.get("onResume")),
      on_ack=options.get("on_ack", options.get("onAck")),
      on_snapshot=options.get("on_snapshot", options.get("onSnapshot")),
      on_types=lambda snap, _f: self._type_session.apply_schema(snap) if self._type_session else None,
    )

    self._status = STREAM_STATUS["IDLE"]
    self._last_error: Exception | None = None
    self._snapshot: Any = None
    self._committed_snapshot: Any = None
    self._committed_available = False
    self._buffer = ""

    self._on_chunk: Callable[[Any, Any], None] | None = None
    self._on_done: Callable[[Any], None] | None = None
    self._on_error: Callable[[Exception], None] | None = None

    self._line_interceptors: list[Any] = []
    li = options.get("line_intercept", options.get("lineIntercept"))
    if li:
      init = li if isinstance(li, list) else [li]
      self._line_interceptors = [fn for fn in init if callable(fn)]

    self._annotation_span_handlers: list[Any] = []
    asp = options.get("annotation_span", options.get("annotationSpan"))
    if asp:
      init = asp if isinstance(asp, list) else [asp]
      self._annotation_span_handlers = [fn for fn in init if callable(fn)]

    self._type_check_escape_paths: list[str] = []
    self._listeners: dict[str, set[Callable[..., None]]] = {}
    self._iter_queue: queue.Queue[Any] = queue.Queue()
    self._iter_done = False
    self._iter_error: Exception | None = None
    self._promise: Future[Any] | None = None
    self._aborted = threading.Event()
    self._transport_handle: Any = None
    self._engine: DotCheckpointEngine | None = None
    self._lock = threading.RLock()
    self._async_ingest_chain: Future[None] | None = None

  @property
  def url(self) -> str:
    return self._url

  @property
  def status(self) -> str:
    return self._status

  @property
  def stream_processing(self) -> bool:
    return self._stream_processing

  @property
  def merge_chunk_window(self) -> bool:
    return self._merge_chunk_window

  @property
  def async_parse(self) -> bool:
    return self._async_parse

  @property
  def history_snapshot(self) -> bool:
    return self._history_snapshot

  @property
  def history_realtime(self) -> bool:
    return self._history_realtime

  @property
  def history(self):
    return self._engine.history if self._engine else None

  @property
  def compatibility_mode(self) -> bool:
    return self._compatibility_mode

  @property
  def last_error(self) -> Exception | None:
    return self._last_error

  def get_modes(self) -> list[str]:
    return sorted(self._modes)

  def get_snapshot(self) -> Any:
    return None if self._snapshot is None else clone_json(self._snapshot)

  def get_committed_snapshot(self) -> Any:
    if self._committed_snapshot is None:
      if not self._committed_available or not self._engine:
        return None
      c = self._engine.committed_snapshot
      if c is None:
        return None
      self._committed_snapshot = c
    return clone_json(self._committed_snapshot)

  def buffer_stats(self) -> dict[str, Any]:
    if not self._engine:
      return {"length": 0, "committedAt": 0, "pendingBytes": 0, "openPhase": False}
    return self._engine.buffer_stats()

  def compact_committed(self, **options: Any) -> dict[str, int]:
    if not self._engine:
      raise RuntimeError("XaiopStream.compact_committed requires an active send/engine")
    return self._engine.compact_committed(options)

  @property
  def session_id(self) -> str | None:
    return self._control.session_id

  @property
  def phase_seq(self) -> int:
    return self._engine.phase_seq if self._engine else 0

  @property
  def log_seq(self) -> int:
    return self._control.phase_seq

  @property
  def acked_seq(self) -> int:
    return self._control.acked_seq

  def get_resume_state(self) -> dict[str, Any] | None:
    base = self._control.get_resume_state(self.get_committed_snapshot())
    if not base:
      return None
    return {**base, "logSeq": base.get("seq"), "inboundSeq": self.phase_seq}

  def get_buffered_text(self) -> str:
    return self._buffer

  def is_busy(self) -> bool:
    return is_stream_busy(self._status)

  def get_status(self) -> dict[str, Any]:
    return {
      "status": self._status,
      "url": self._url,
      "streamProcessing": self._stream_processing,
      "compatibilityMode": self._compatibility_mode,
      "mergeChunkWindow": self._merge_chunk_window,
      "asyncParse": self._async_parse,
      "modes": self.get_modes(),
      "busy": self.is_busy(),
      "hasSnapshot": self._snapshot is not None,
      "hasCommittedSnapshot": self._committed_available or self._committed_snapshot is not None,
      "bufferLength": len(self._buffer),
      "lastError": str(self._last_error) if self._last_error else None,
    }

  def set_url(self, url: str) -> bool:
    if self.is_busy():
      return False
    if not isinstance(url, str) or not url:
      return False
    prev = self._url
    self._url = url
    if prev != url and self._history_snapshot:
      h = self._engine.history if self._engine else None
      if h and h.snapshot_enabled:
        h.set_source(url)
    return True

  def jump_to(self, index: int):
    if not self._engine:
      raise RuntimeError("XaiopStream.jump_to requires an active send/engine")
    result = self._engine.jump_to(index)
    self._buffer = self._engine.buffer
    self._committed_snapshot = self._engine.committed_snapshot
    self._committed_available = self._committed_snapshot is not None
    self._snapshot = None
    return result

  def set_modes(self, modes) -> bool:
    if self.is_busy():
      return False
    try:
      self._modes = normalize_modes(modes)
      return True
    except TypeError:
      return False

  def on_chunk(self, fn: Callable[[Any, Any], None]) -> XaiopStream:
    if not callable(fn):
      raise TypeError("on_chunk requires a function")
    self._on_chunk = fn
    return self

  def on_done(self, fn: Callable[[Any], None]) -> XaiopStream:
    if not callable(fn):
      raise TypeError("on_done requires a function")
    self._on_done = fn
    return self

  def on_error(self, fn: Callable[[Exception], None]) -> XaiopStream:
    if not callable(fn):
      raise TypeError("on_error requires a function")
    self._on_error = fn
    return self

  def on(self, event: str, listener: Callable[..., None]) -> XaiopStream:
    if not callable(listener):
      raise TypeError("listener must be a function")
    self._listeners.setdefault(event, set()).add(listener)
    return self

  def off(self, event: str, listener: Callable[..., None]) -> XaiopStream:
    self._listeners.get(event, set()).discard(listener)
    return self

  def chunks(self) -> Iterator[Any]:
    if STREAM_MODES["ASYNC_ITERATOR"] not in self._modes:
      raise RuntimeError("asyncIterator mode is not enabled")
    while True:
      if self._iter_error is not None:
        raise self._iter_error
      if self._iter_done and self._iter_queue.empty():
        return
      try:
        item = self._iter_queue.get(timeout=0.05)
        yield item
      except queue.Empty:
        if self._iter_done:
          return
        if self._iter_error is not None:
          raise self._iter_error

  def send(self, **options: Any) -> Future[Any] | None:
    with self._lock:
      if self.is_busy():
        err = RuntimeError("XaiopStream is busy; abort or wait before send")
        if STREAM_MODES["PROMISE"] in self._modes:
          fut: Future[Any] = Future()
          fut.set_exception(err)
          return fut
        raise err

      url = options.get("url", self._url)
      if not isinstance(url, str) or not url:
        raise TypeError("send requires a url")
      self._url = url
      self._reset_cycle()
      self._status = STREAM_STATUS["CONNECTING"]
      self._emit_status()

      promise: Future[Any] | None = None
      if STREAM_MODES["PROMISE"] in self._modes:
        promise = Future()
        self._promise = promise

      self._aborted.clear()
      engine_hooks = {
        "streamProcessing": self._stream_processing,
        "compat": self._compat.snapshot() if self._compatibility_mode else False,
        "symbolKeys": self._symbol_keys,
        "emitDiff": self._wants_phase_diff(),
        "mergeChunkWindow": self._merge_chunk_window,
        "historySnapshot": self._history_snapshot,
        "historyRealtime": self._history_realtime,
        "retainWireHistory": self._retain_wire_history,
        "cover": self._cover,
        "lineIntercept": self._line_interceptors[:],
        "annotationSpan": self._annotation_span_handlers[:],
        "onChunk": self._deliver_chunk,
      }
      self._engine = DotCheckpointEngine(engine_hooks)
      self._control.bind_checkpoint(self._engine)
      if self._history_snapshot and self._engine.history:
        self._engine.history.set_source(url)

      transport = options.get("transport", TRANSPORT_KIND["HTTP"])
      source = options.get("source")
      req = TransportRequest(
        url=url,
        transport=transport,
        method=options.get("method", "GET"),
        headers=options.get("headers"),
        body=options.get("body"),
        timeout_ms=options.get("timeout_ms", options.get("timeoutMs")),
        sse_events=options.get("sse_events", options.get("sseEvents")),
        source=source,
        aborted=self._aborted,
      )
      self._run_transport(req)
      return promise

  def send_raw(self, chunks: Iterable[str]) -> Future[Any] | None:
    return self.send(transport=TRANSPORT_KIND["RAW"], source=chunks)

  def abort(self) -> bool:
    with self._lock:
      if not self.is_busy() and not self._transport_handle:
        return False
      self._aborted.set()
      if self._transport_handle:
        try:
          self._transport_handle.abort()
        except Exception:
          pass
      if self.is_busy() or self._status == STREAM_STATUS["CONNECTING"]:
        self._status = STREAM_STATUS["ABORTED"]
        self._last_error = RuntimeError("aborted")
        self._reject_promise(self._last_error)
        self._reject_iterators(self._last_error)
        self._deliver_error(self._last_error)
        self._emit_status()
        self._clear_transport()
        return True
      return False

  def _run_transport(self, req: TransportRequest) -> None:
    handlers = TransportHandlers(
      on_text=self._ingest_text,
      on_done=self._complete_successfully,
      on_error=self._fail,
    )
    self._transport_handle = open_transport(req, handlers)

  def _ingest_text(self, text: str) -> None:
    with self._lock:
      if self._status == STREAM_STATUS["CONNECTING"]:
        self._status = STREAM_STATUS["STREAMING"]
        self._emit_status()
      try:
        wire = self._control.push(text)
        if not wire or not self._engine:
          return
        if self._async_parse:
          self._schedule_async_ingest(wire)
        else:
          self._engine.push(wire)
          self._buffer = self._engine.buffer
          self._sync_committed_from_engine()
          if self._engine.snapshot is not None:
            self._snapshot = self._engine.snapshot
      except Exception as err:
        self._fail(err)

  def _schedule_async_ingest(self, wire: str) -> None:
    def work() -> None:
      if self._engine:
        self._engine.push_async(wire).wait()
        self._buffer = self._engine.buffer
        self._sync_committed_from_engine()
        if self._engine.snapshot is not None:
          self._snapshot = self._engine.snapshot

    fut = threading.Thread(target=work, daemon=True)
    fut.start()

  def _complete_successfully(self) -> None:
    with self._lock:
      self._status = STREAM_STATUS["COMPLETING"]
      self._emit_status()

    def finish() -> None:
      with self._lock:
        if not self._engine:
          return
        try:
          wire = self._control.flush()
          if wire:
            if self._async_parse:
              self._engine.push_async(wire).wait()
            else:
              self._engine.push(wire)
            self._buffer = self._engine.buffer
            self._sync_committed_from_engine()
          if self._async_parse:
            self._engine.finish_async().wait()
          else:
            self._engine.finish()
          self._buffer = self._engine.buffer
          self._sync_committed_from_engine()
          self._snapshot = self._engine.snapshot
          final_json = {} if self._snapshot is None else clone_json(self._snapshot)
          self._deliver_done(final_json)
          self._status = STREAM_STATUS["COMPLETED"]
          self._emit_status()
          self._clear_transport()
        except Exception as err:
          self._fail(err)

    threading.Thread(target=finish, daemon=True).start()

  def _reset_cycle(self) -> None:
    self._last_error = None
    self._snapshot = None
    self._committed_snapshot = None
    self._committed_available = False
    self._buffer = ""
    self._iter_queue = queue.Queue()
    self._iter_done = False
    self._iter_error = None
    self._promise = None
    self._engine = None
    self._clear_transport()

  def _clear_transport(self) -> None:
    self._transport_handle = None

  def _sync_committed_from_engine(self) -> None:
    if not self._engine or self._engine.committed_at <= 0:
      return
    self._committed_snapshot = None
    self._committed_available = True

  def _wants_phase_diff(self) -> bool:
    if STREAM_MODES["ASYNC_ITERATOR"] in self._modes:
      return True
    if STREAM_MODES["EVENTS"] in self._modes:
      return True
    if STREAM_MODES["CALLBACK"] in self._modes and self._on_chunk:
      return True
    return False

  def _deliver_chunk(self, diff: Any, meta: Any = None) -> None:
    self._control.note_phase_meta(meta if isinstance(meta, dict) else None)
    self._sync_committed_from_engine()
    if isinstance(meta, dict) and meta.get("typeCheckEscapePaths"):
      self._type_check_escape_paths.extend(meta["typeCheckEscapePaths"])
    if self._type_session:
      if diff is not None:
        self._type_session.observe_tree(diff, escape_paths=self._type_check_escape_paths)
      if self._engine:
        committed = self._engine.committed_snapshot
        if committed is not None:
          self._type_session.reconcile_commit({} if committed is None else committed)
    if not self._wants_phase_diff():
      return
    if STREAM_MODES["CALLBACK"] in self._modes and self._on_chunk:
      self._on_chunk(diff, meta)
    if STREAM_MODES["EVENTS"] in self._modes:
      self._emit("chunk", diff, meta)
    if STREAM_MODES["ASYNC_ITERATOR"] in self._modes:
      self._iter_queue.put(diff)

  def _deliver_done(self, json_value: Any) -> None:
    self._iter_done = True
    if STREAM_MODES["CALLBACK"] in self._modes and self._on_done:
      self._on_done(json_value)
    if STREAM_MODES["EVENTS"] in self._modes:
      self._emit("done", json_value)
    if STREAM_MODES["PROMISE"] in self._modes and self._promise:
      self._promise.set_result(json_value)
      self._promise = None

  def _fail(self, err: Exception) -> None:
    with self._lock:
      if self._status in (
        STREAM_STATUS["COMPLETED"],
        STREAM_STATUS["ERROR"],
        STREAM_STATUS["ABORTED"],
      ):
        return
      self._status = STREAM_STATUS["ERROR"]
      self._last_error = err
      self._reject_promise(err)
      self._reject_iterators(err)
      self._deliver_error(err)
      self._emit_status()
      self._clear_transport()

  def _deliver_error(self, err: Exception) -> None:
    if STREAM_MODES["CALLBACK"] in self._modes and self._on_error:
      self._on_error(err)
    if STREAM_MODES["EVENTS"] in self._modes:
      self._emit("error", err)

  def _reject_promise(self, err: Exception) -> None:
    if self._promise and not self._promise.done():
      self._promise.set_exception(err)
      self._promise = None

  def _reject_iterators(self, err: Exception) -> None:
    self._iter_error = err
    self._iter_done = True

  def _emit(self, event: str, *args: Any) -> None:
    for fn in list(self._listeners.get(event, ())):
      try:
        fn(*args)
      except Exception:
        pass

  def _emit_status(self) -> None:
    if STREAM_MODES["EVENTS"] in self._modes:
      self._emit("status", self.get_status())
