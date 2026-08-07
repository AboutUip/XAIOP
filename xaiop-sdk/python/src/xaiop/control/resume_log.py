"""Outbound phase wire log for producer-side resume."""

from __future__ import annotations

from typing import Any

from .control import stamp_wire_with_log_seq


class XaiopResumeLogError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "RESUME_LOG",
        seq: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.seq = seq


class ResumeWireLog:
    def __init__(self) -> None:
        self._entries: list[dict[str, Any]] = []

    @property
    def size(self) -> int:
        return len(self._entries)

    @property
    def highest_seq(self) -> int:
        if not self._entries:
            return 0
        return self._entries[-1]["seq"]

    def record(self, entry: dict[str, Any]) -> ResumeWireLog:
        seq = entry.get("seq")
        if not isinstance(seq, int) or seq < 1:
            raise TypeError("ResumeWireLog.record requires seq >= 1")
        if not isinstance(entry.get("wire"), str):
            raise TypeError("ResumeWireLog.record requires wire string")
        last = self.highest_seq
        if seq <= last:
            raise XaiopResumeLogError(
                f"ResumeWireLog seq must be strictly increasing "
                f"(got {seq}, last {last})",
                code="RESUME_LOG_SEQ",
                seq=seq,
            )
        self._entries.append(
            {
                "seq": seq,
                "wire": entry["wire"],
                "committed": entry.get("committed"),
            }
        )
        return self

    def wires_after(self, from_seq: int) -> str:
        return self._join_after(from_seq, True)

    def wires_after_raw(self, from_seq: int) -> str:
        return self._join_after(from_seq, False)

    def _join_after(self, from_seq: int, stamp: bool) -> str:
        n = int(from_seq)
        if n < 0:
            raise TypeError("wires_after requires non-negative integer fromSeq")
        out = ""
        for e in self._entries:
            if e["seq"] > n:
                out += (
                    stamp_wire_with_log_seq(e["seq"], e["wire"])
                    if stamp
                    else e["wire"]
                )
        return out

    def clear(self) -> ResumeWireLog:
        self._entries.clear()
        return self
