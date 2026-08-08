"""Optional parse-chain history for `.` phase boundaries."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .clone import clone_json
from .materialize import materialize_snapshot
from .parse import parse_sync

HistoryNodeKind = Literal["dot", "tail"]

HISTORY_NODE_KIND = {"DOT": "dot", "TAIL": "tail"}


class RangeError(ValueError):
    """Index / jump range error (Node ``RangeError`` counterpart)."""


@dataclass
class HistoryNode:
    index: int
    kind: HistoryNodeKind
    buffer_start: int
    buffer_end: int
    wire: str | None
    before: Any
    after: Any
    diff: Any


def _clone_node(n: HistoryNode) -> HistoryNode:
    return HistoryNode(
        index=n.index,
        kind=n.kind,
        buffer_start=n.buffer_start,
        buffer_end=n.buffer_end,
        wire=n.wire,
        before=clone_json(n.before),
        after=clone_json(n.after),
        diff=clone_json(n.diff),
    )


class ParseHistory:
    def __init__(
        self,
        *,
        snapshot: bool = False,
        realtime: bool = False,
        retain_wire: bool = True,
        compat: Any = False,
    ) -> None:
        self._snapshot = snapshot is True
        self._realtime = realtime is True
        self._retain_wire = retain_wire is not False
        self._compat = compat if compat is not False else False
        self._nodes: list[HistoryNode] = []
        self._live_cursor = -1
        self._source_key: str | None = None
        self._range_view: dict[str, Any] | None = None

    @property
    def enabled(self) -> bool:
        return self._snapshot or self._realtime

    @property
    def snapshot_enabled(self) -> bool:
        return self._snapshot

    @property
    def realtime_enabled(self) -> bool:
        return self._realtime

    @property
    def retain_wire_enabled(self) -> bool:
        return self._retain_wire

    @property
    def length(self) -> int:
        return len(self._nodes)

    @property
    def live_cursor(self) -> int:
        return self._live_cursor

    @property
    def source_key(self) -> str | None:
        return self._source_key

    def clear(self) -> ParseHistory:
        self._nodes.clear()
        self._live_cursor = -1
        self._range_view = None
        return self

    def info(self) -> dict[str, Any]:
        return {
            "snapshot": self._snapshot,
            "realtime": self._realtime,
            "length": len(self._nodes),
            "liveCursor": self._live_cursor,
            "sourceKey": self._source_key,
            "hasRangeView": self._range_view is not None,
            "rangeView": (
                {"from": self._range_view["from"], "to": self._range_view["to"]}
                if self._range_view
                else None
            ),
        }

    def record(self, entry: dict[str, Any]) -> HistoryNode | None:
        """Append with defensive clones (safe for external callers)."""
        return self.record_owned(
            {
                **entry,
                "before": clone_json(entry.get("before")),
                "after": clone_json(entry.get("after")),
                "diff": clone_json(entry.get("diff")),
            }
        )

    def record_owned(self, entry: dict[str, Any]) -> HistoryNode | None:
        """Append taking ownership of already-isolated trees (no extra clone).

        When ``before`` is the previous node's ``after`` (same object), adjacent
        phases share storage. Public getters still deep-clone on export.
        """
        if not self.enabled:
            return None
        index = len(self._nodes)
        before = entry.get("before")
        if self._nodes and self._nodes[-1].after is before:
            before = self._nodes[-1].after
        node = HistoryNode(
            index=index,
            kind=(
                HISTORY_NODE_KIND["TAIL"]
                if entry.get("kind") == HISTORY_NODE_KIND["TAIL"]
                else HISTORY_NODE_KIND["DOT"]
            ),
            buffer_start=int(entry["bufferStart"]),
            buffer_end=int(entry["bufferEnd"]),
            wire=(
                str(entry["wire"])
                if self._retain_wire and entry.get("wire") is not None
                else None
            ),
            before=before,
            after=entry.get("after"),
            diff=entry.get("diff"),
        )
        self._nodes.append(node)
        self._invalidate_range_if_needed()
        return node

    def export_time_root(self) -> list[HistoryNode]:
        self._require_snapshot("exportTimeRoot")
        return [_clone_node(n) for n in self._nodes]

    def get_node(self, index: int) -> HistoryNode:
        return _clone_node(self._node_at(index))

    def get_diff(self, index: int) -> Any:
        return clone_json(self._node_at(index).diff)

    def peek_diff(self, index: int) -> Any:
        """Engine emit path — no clone (do not mutate shared storage)."""
        return self._node_at(index).diff

    def get_before(self, index: int) -> Any:
        return clone_json(self._node_at(index).before)

    def get_after(self, index: int) -> Any:
        return clone_json(self._node_at(index).after)

    def peek_after(self, index: int) -> Any:
        """Adjacent-phase ``before`` sharing — no clone."""
        return self._node_at(index).after

    def compare(self, index_a: int, index_b: int) -> dict[str, Any]:
        self._require_snapshot("compare")
        return {
            "indexA": index_a,
            "indexB": index_b,
            "a": self.get_after(index_a),
            "b": self.get_after(index_b),
        }

    def view_range(self, from_index: int, to_index: int) -> dict[str, Any]:
        self._require_snapshot("viewRange")
        a = self._normalize_index(from_index)
        b = self._normalize_index(to_index)
        if a > b:
            raise RangeError(f"viewRange: from ({from_index}) > to ({to_index})")
        # Cache holds internal refs; return path always deep-clones once.
        if (
            self._range_view
            and self._range_view["from"] == a
            and self._range_view["to"] == b
        ):
            return {
                "from": a,
                "to": b,
                "nodes": [_clone_node(n) for n in self._range_view["nodes"]],
                "json": clone_json(self._range_view["json"]),
            }

        slice_nodes = self._nodes[a : b + 1]
        wires = [n.wire for n in slice_nodes]
        if all(w is not None for w in wires):
            text = "".join(str(w) for w in wires)
            json_val = materialize_snapshot(parse_sync(text, self._compat))
        else:
            json_val = slice_nodes[-1].after
        self._range_view = {
            "from": a,
            "to": b,
            "nodes": list(slice_nodes),
            "json": json_val,
        }
        return {
            "from": a,
            "to": b,
            "nodes": [_clone_node(n) for n in self._range_view["nodes"]],
            "json": clone_json(json_val),
        }

    def set_source(self, key: str | None) -> dict[str, Any]:
        self._require_snapshot("setSource")
        next_key: str | None
        if key is None or key == "":
            next_key = None
        else:
            next_key = str(key)
        previous = self._source_key
        if previous is not None and next_key is not None and previous != next_key:
            self._release_snapshot_data()
            self._source_key = next_key
            return {"released": True, "previous": previous}
        if previous is not None and next_key is None:
            self._release_snapshot_data()
            self._source_key = None
            return {"released": True, "previous": previous}
        self._source_key = next_key
        return {"released": False, "previous": previous}

    def release(self) -> None:
        self._require_snapshot("release")
        self._release_snapshot_data()
        self._source_key = None

    def jump_to(self, index: int) -> dict[str, Any]:
        self._require_realtime("jumpTo")
        i = self._normalize_index(index)
        if i <= self._live_cursor:
            raise RangeError(
                f"realtime jumpTo only moves forward (index {i} <= "
                f"liveCursor {self._live_cursor})"
            )
        discarded = len(self._nodes) - (i + 1)
        kept_nodes = self._nodes[: i + 1]
        self._nodes = kept_nodes
        self._live_cursor = i
        self._range_view = None
        tip = kept_nodes[i]
        wire_prefix = None
        if self._retain_wire and all(n.wire is not None for n in kept_nodes):
            wire_prefix = "".join(n.wire for n in kept_nodes if n.wire)
        return {
            "index": i,
            "kept": len(kept_nodes),
            "discarded": max(0, discarded),
            "after": clone_json(tip.after),
            "bufferEnd": tip.buffer_end,
            "wirePrefix": wire_prefix,
        }

    def can_jump_to(self, index: int) -> bool:
        if not self._realtime:
            return False
        if not isinstance(index, int) or index < 0 or index >= len(self._nodes):
            return False
        return index > self._live_cursor

    def _require_snapshot(self, api: str) -> None:
        if not self._snapshot:
            raise RuntimeError(f"ParseHistory.{api} requires snapshot mode")

    def _require_realtime(self, api: str) -> None:
        if not self._realtime:
            raise RuntimeError(f"ParseHistory.{api} requires realtime mode")

    def _normalize_index(self, index: int) -> int:
        if not isinstance(index, int) or index < 0 or index >= len(self._nodes):
            raise RangeError(
                f"history index out of range: {index} (length {len(self._nodes)})"
            )
        return index

    def _node_at(self, index: int) -> HistoryNode:
        return self._nodes[self._normalize_index(index)]

    def _release_snapshot_data(self) -> None:
        self._nodes = []
        self._live_cursor = -1
        self._range_view = None

    def _invalidate_range_if_needed(self) -> None:
        if self._range_view and self._range_view.get("to", 0) >= len(self._nodes):
            self._range_view = None
