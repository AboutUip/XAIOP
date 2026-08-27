"""XAIOP wire parser (protocol v0.7.0 Draft)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from .compat import CompatPolicy, resolve_compat_options
from .errors import XaiopSyntaxError
from .fragment import XaiopFragment
from .label_escape import decode_wire_label

NodeKind = Literal["object", "array", "fragment", "scalar"]
DocKind = Literal["none", "object", "array", "fragment"]

_OPERATOR_HEADS = frozenset("><=!&#.-?")
# Content keys never start with these in STRICT Encode wires (includes @).
_OPERATOR_LINE_HEADS = frozenset("><=!&#.-@?")


@dataclass
class Frame:
    kind: NodeKind
    value: Any
    via_key: str | None = None
    via_index: int | None = None


def resolve_parse_options(
    second: bool | CompatPolicy | dict[str, bool] | dict[str, Any] | Any = False,
) -> tuple[dict[str, bool] | None, bool]:
    if (
        second
        and isinstance(second, dict)
        and not isinstance(second, CompatPolicy)
        and (
            "symbolKeys" in second
            or "symbol_keys" in second
            or (
                "compat" in second
                and not any(k in second for k in CompatPolicy().snapshot())
            )
        )
    ):
        compat_arg = second.get("compat", second.get("compat_mode", False))
        symbol_keys = bool(second.get("symbolKeys", second.get("symbol_keys", False)))
        return resolve_compat_options(compat_arg), symbol_keys
    return resolve_compat_options(second), False


def parse_sync(
    source: str,
    compat_or_options: bool | CompatPolicy | dict[str, bool] | dict[str, Any] | Any = False,
) -> Any | XaiopFragment:
    if not isinstance(source, str):
        raise TypeError("XAIOP source must be a string")
    compat, symbol_keys = resolve_parse_options(compat_or_options)
    return Parser(source, compat=compat, symbol_keys=symbol_keys).parse()


class LiveParser:
    """Incremental parser: feed complete lines while keeping one live tree."""

    def __init__(
        self,
        compat_or_options: bool | CompatPolicy | dict[str, bool] | dict[str, Any] | Any = False,
    ) -> None:
        compat, symbol_keys = resolve_parse_options(compat_or_options)
        self._p = Parser.create_live(compat=compat, symbol_keys=symbol_keys)

    def feed_line(self, line: str) -> LiveParser:
        if not isinstance(line, str):
            raise TypeError("XAIOP live feed_line requires a string")
        self._p.feed_line_fast(line)
        return self

    def feed_text(self, text: str) -> LiveParser:
        if not isinstance(text, str):
            raise TypeError("XAIOP live feed_text requires a string")
        if not text:
            return self
        for line in split_lines(text):
            self._p.feed_line_fast(line)
        return self

    def feed_lines(self, lines: list[str]) -> LiveParser:
        for line in lines:
            self.feed_line(line)
        return self

    def value(self) -> Any | XaiopFragment:
        return self._p.result()

    def cursor_restore_lines(self) -> list[str]:
        return self._p.cursor_restore_lines()


class Parser:
    def __init__(
        self,
        source: str,
        *,
        compat: dict[str, bool] | None = None,
        symbol_keys: bool = False,
    ) -> None:
        self._source = source
        # Lazily split only for compat / live helpers that still need a line list.
        self._lines: list[str] | None = None
        self.line_no = 0
        self._fed = 0
        self._compat_root_ready = False
        self.root: Any = None
        self.fragment_entries: dict[str, Any] | None = None
        self.doc_kind: DocKind = "none"
        self.stack: list[Frame] = []
        self.broadcast_stacks: list[list[Frame]] | None = None
        self.phase: Literal["init", "active"] = "init"
        self.compat = compat
        self.symbol_keys = symbol_keys

    @property
    def lines(self) -> list[str]:
        if self._lines is None:
            self._lines = split_lines(self._source)
        return self._lines

    @lines.setter
    def lines(self, value: list[str]) -> None:
        self._lines = value

    @staticmethod
    def create_live(
        compat: dict[str, bool] | None = None,
        symbol_keys: bool = False,
    ) -> Parser:
        return Parser("", compat=compat, symbol_keys=symbol_keys)

    def _logical_name(self, wire_name: str) -> str:
        return decode_wire_label(wire_name, self.symbol_keys)

    def feed_line_fast(self, line: str) -> None:
        self._fed += 1
        self.line_no = self._fed
        logical = strip_bom(line) if self._fed == 1 else line
        if self.fix_enabled("forcedRoot") and not self._compat_root_ready:
            self._compat_root_ready = True
            self._inject_compat_root_if_needed(logical)
        if len(logical) == 0:
            raise XaiopSyntaxError(
                "empty line is a Content syntax error", line=self.line_no
            )
        self.handle_line_compat(logical)

    def _inject_compat_root_if_needed(self, first_line: str) -> None:
        first = self.rewrite_compat_line(first_line)
        if first in (">", "-"):
            return
        self.root = {}
        self.doc_kind = "object"
        self.fragment_entries = None
        self.stack = [Frame("object", self.root)]
        self.phase = "active"

    def result(self) -> Any | XaiopFragment:
        if self.doc_kind == "fragment":
            return XaiopFragment(self.fragment_entries)  # type: ignore[arg-type]
        if self.root is None:
            return {}
        return self.root

    def fix_enabled(self, fix_id: str) -> bool:
        return bool(self.compat and self.compat.get(fix_id))

    def parse(self) -> Any | XaiopFragment:
        if self.fix_enabled("forcedRoot"):
            self.ensure_compat_root_opener()
            self._compat_root_ready = True
        if self.compat is None:
            return self._parse_one_shot(self._source)
        for i, raw in enumerate(self.lines):
            self.line_no = i + 1
            line = strip_bom(raw) if i == 0 else raw
            if len(line) == 0:
                raise XaiopSyntaxError(
                    "empty line is a Content syntax error", line=self.line_no
                )
            self.handle_line_compat(line)
        return self.result()

    def _parse_one_shot(self, source: str) -> Any | XaiopFragment:
        """Feed the wire without materializing a full line list (STRICT hot path)."""
        n = len(source)
        start = 0
        line_no = 0
        while start <= n:
            if start == n:
                break
            i = start
            while i < n:
                c = source[i]
                if c == "\n" or c == "\r":
                    break
                i += 1
            line = source[start:i]
            if i < n:
                if source[i] == "\r" and i + 1 < n and source[i + 1] == "\n":
                    nxt = i + 2
                else:
                    nxt = i + 1
            else:
                nxt = n
            if len(line) == 0:
                if _rest_only_eols(source, nxt):
                    break
                line_no += 1
                raise XaiopSyntaxError(
                    "empty line is a Content syntax error", line=line_no
                )
            line_no += 1
            self.line_no = line_no
            if line_no == 1:
                line = strip_bom(line)
                if len(line) == 0:
                    raise XaiopSyntaxError(
                        "empty line is a Content syntax error", line=line_no
                    )
            self.handle_line(line)
            if nxt >= n:
                break
            start = nxt
        return self.result()

    def ensure_compat_root_opener(self) -> None:
        if not self.lines:
            return
        first = self.rewrite_compat_line(strip_bom(self.lines[0]))
        if first in (">", "-"):
            return
        self.root = {}
        self.doc_kind = "object"
        self.fragment_entries = None
        self.stack = [Frame("object", self.root)]
        self.phase = "active"

    def rewrite_compat_line(self, line: str) -> str:
        bare_array = self.fix_enabled("rewriteBareNameArray")
        enter_line = self.fix_enabled("rewriteEnterLine")
        if not bare_array and not enter_line:
            return line

        s = line.rstrip() if enter_line else line
        if not s:
            return line

        if bare_array and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*-", s):
            return f">{s}"

        if enter_line and s.startswith(">") and len(s) > 1:
            rest = s[1:]
            trimmed_rest = rest.strip()
            if not trimmed_rest:
                return ">"
            if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*-", trimmed_rest):
                return f">{trimmed_rest}"
            if ":" in trimmed_rest:
                return trimmed_rest
            if trimmed_rest != rest:
                return f">{trimmed_rest}"

        return s

    def handle_line_compat(self, line: str) -> None:
        if not self.compat:
            self.handle_line(line)
            return

        effective = self.rewrite_compat_line(line)
        if not effective:
            raise XaiopSyntaxError(
                "empty line is a Content syntax error", line=self.line_no
            )

        if (
            self.fix_enabled("ignoreBareLeaveAtRoot")
            and effective == "<"
            and self.is_at_document_root()
        ):
            return

        try:
            self.handle_line(effective)
        except XaiopSyntaxError as err:
            if not self.fix_enabled("popAndRetry"):
                raise
            self.recover_by_popping(effective, err)

    def is_at_document_root(self) -> bool:
        return len(self.stack) <= 1

    def recover_by_popping(self, line: str, original_err: XaiopSyntaxError) -> None:
        original_key = syntax_error_key(original_err)
        while len(self.stack) > 1:
            try:
                self.pop_only()
            except XaiopSyntaxError:
                raise original_err from None
            try:
                self.handle_line(line)
                return
            except XaiopSyntaxError as err2:
                if syntax_error_key(err2) != original_key:
                    raise
        raise original_err

    def handle_line(self, line: str) -> None:
        if not line:
            raise XaiopSyntaxError(
                f"Bare Label or unknown line form: {line!r}", line=self.line_no
            )

        # Content fast-path: typical nested Encode wires are mostly key:value lines.
        head = line[0]
        if head not in _OPERATOR_LINE_HEADS:
            self._handle_content_line(line)
            return

        if head == "#":
            return

        if line == ".":
            self.reset_to_root()
            return

        if line == "<":
            self.precheck_broadcast_pop()
            if self.broadcast_stacks is None:
                self.pop_only()
            else:
                self.run_on_cursors(self.pop_only)
            return

        if head == "<" and len(line) > 1:
            name = self._logical_name(line[1:])
            assert_name(name, self.line_no, self.symbol_keys)
            self.precheck_broadcast_pop()
            if self.broadcast_stacks is None:
                self.pop_only()
                self.create_enter_named_object(name)
            else:

                def op() -> None:
                    self.pop_only()
                    self.create_enter_named_object(name)

                self.run_on_cursors(op)
            return

        if head == "=":
            self.require_not_broadcast("=")
            self.locate_path(line[1:])
            return

        if head == "@":
            self.exact_enter(line[1:])
            return

        if head == "!":
            self.require_not_broadcast("!")
            self.broadcast_enter(line[1:])
            return

        if head == "?":
            self.select_array_element(line[1:])
            return

        if head == "&":
            if len(line) == 1:
                self.delete_current_array_element()
                return
            self.delete_at_path(line[1:])
            return

        if line == ">":
            if self.broadcast_stacks is None:
                self.create_enter_anonymous_object()
            else:
                self.run_on_cursors(self.create_enter_anonymous_object)
            return

        if line == "-":
            if self.broadcast_stacks is None:
                self.create_enter_anonymous_array()
            else:
                self.run_on_cursors(self.create_enter_anonymous_array)
            return

        if head == ">" and line.endswith("-") and len(line) > 2:
            name = self._logical_name(line[1:-1])
            assert_name(name, self.line_no, self.symbol_keys)
            if self.broadcast_stacks is None:
                self.create_enter_named_array(name)
            else:
                self.run_on_cursors(lambda: self.create_enter_named_array(name))
            return

        if head == ">" and len(line) > 1:
            if ">>" in line:
                raise XaiopSyntaxError(
                    "same-symbol stacking >> is forbidden", line=self.line_no
                )
            name = line[1:]
            if ">" in name:
                parts = [self._logical_name(p) for p in name.split(">")]
                for p in parts:
                    assert_name(p, self.line_no, self.symbol_keys)
                if self.broadcast_stacks is None:
                    for p in parts:
                        self.create_enter_named_object(p)
                else:

                    def op_multi() -> None:
                        for p in parts:
                            self.create_enter_named_object(p)

                    self.run_on_cursors(op_multi)
                return
            logical = self._logical_name(name)
            assert_name(logical, self.line_no, self.symbol_keys)
            if self.broadcast_stacks is None:
                self.create_enter_named_object(logical)
            else:
                self.run_on_cursors(lambda: self.create_enter_named_object(logical))
            return

        self._handle_content_line(line)

    def _handle_content_line(self, line: str) -> None:
        colon = line.find(":")
        if colon == -1:
            raise XaiopSyntaxError(
                f"Bare Label or unknown line form: {line!r}", line=self.line_no
            )
        key = self._logical_name(line[:colon])
        value = parse_value(line[colon + 1 :], line_no=self.line_no)
        if self.broadcast_stacks is None:
            # Hot path: STRICT one-shot Encode wires never broadcast.
            self.write_content(key, value)
        else:
            self.run_on_cursors(lambda: self.write_content(key, value))

    def require_not_broadcast(self, op: str) -> None:
        if self.broadcast_stacks:
            raise XaiopSyntaxError(
                f"{op} while broadcast mode is active (emit . to reset first)",
                line=self.line_no,
            )

    def precheck_broadcast_pop(self) -> None:
        if not self.broadcast_stacks:
            return
        for st in self.broadcast_stacks:
            if len(st) <= 1:
                raise XaiopSyntaxError("< at Root is illegal", line=self.line_no)

    def run_on_cursors(self, fn: Any) -> None:
        if not self.broadcast_stacks:
            fn()
            return
        stacks = self.broadcast_stacks
        for i in range(len(stacks)):
            self.stack = list(stacks[i])
            fn()
            stacks[i] = list(self.stack)
        self.stack = list(stacks[0])

    def ensure_document_object_root(self) -> None:
        if self.phase == "init" or self.doc_kind == "none":
            self.root = {}
            self.doc_kind = "object"
            self.fragment_entries = None
            self.stack = [Frame("object", self.root)]
            self.phase = "active"

    def ensure_fragment_root(self) -> None:
        if self.doc_kind in ("object", "array"):
            return
        if self.doc_kind != "fragment":
            self.doc_kind = "fragment"
            self.fragment_entries = {}
            self.root = None
            self.stack = [Frame("fragment", self.fragment_entries)]
            self.phase = "active"

    def reset_to_root(self) -> None:
        self.broadcast_stacks = None
        if self.doc_kind == "none":
            self.stack = []
            self.phase = "init"
            return
        if self.doc_kind == "fragment":
            self.stack = [Frame("fragment", self.fragment_entries)]
            self.phase = "active"
            return
        kind: NodeKind = "array" if isinstance(self.root, list) else "object"
        self.stack = [Frame(kind, self.root)]
        self.phase = "active"

    def current(self) -> Frame:
        if not self.stack:
            raise XaiopSyntaxError(
                "Cursor is at Root with no container", line=self.line_no
            )
        return self.stack[-1]

    def pop_only(self) -> None:
        if len(self.stack) <= 1:
            raise XaiopSyntaxError("< at Root is illegal", line=self.line_no)
        self.stack.pop()

    def create_enter_anonymous_object(self) -> None:
        if self.phase == "init" or self.doc_kind == "none":
            self.root = {}
            self.doc_kind = "object"
            self.fragment_entries = None
            self.stack = [Frame("object", self.root)]
            self.phase = "active"
            return
        if self.doc_kind == "fragment":
            raise XaiopSyntaxError(
                "bare > after fragment bindings: declare anonymous root first "
                "with a leading >, or stay in fragment with >name",
                line=self.line_no,
            )
        cur = self.current()
        if cur.kind == "array":
            obj: dict[str, Any] = {}
            cur.value.append(obj)
            self.stack.append(Frame("object", obj, via_index=len(cur.value) - 1))
            return
        if cur.kind == "object":
            return
        raise XaiopSyntaxError(
            "bare > creates an array element or root object; unexpected Cursor kind",
            line=self.line_no,
        )

    def create_enter_anonymous_array(self) -> None:
        if self.phase == "init" or self.doc_kind == "none":
            self.root = []
            self.doc_kind = "array"
            self.fragment_entries = None
            self.stack = [Frame("array", self.root)]
            self.phase = "active"
            return
        if self.doc_kind == "fragment":
            raise XaiopSyntaxError(
                "bare - cannot open root array after fragment mode began; "
                "start the Stream with -",
                line=self.line_no,
            )
        cur = self.current()
        arr: list[Any] = []
        if cur.kind == "array":
            cur.value.append(arr)
            self.stack.append(Frame("array", arr, via_index=len(cur.value) - 1))
            return
        raise XaiopSyntaxError(
            "bare - opens a nested array element or root array; "
            "for a named array use >name-",
            line=self.line_no,
        )

    def create_enter_named_object(self, name: str) -> None:
        if self.phase == "init" or self.doc_kind == "none":
            self.ensure_fragment_root()
        elif self.doc_kind == "fragment" and not self.stack:
            self.ensure_fragment_root()
        cur = self.current()
        if cur.kind == "array":
            raise XaiopSyntaxError(
                f">name while Cursor is inside an array (use < to leave array first): >{name}",
                line=self.line_no,
            )
        if cur.kind == "scalar":
            raise XaiopSyntaxError(
                f">name is not valid on a scalar array element: >{name}",
                line=self.line_no,
            )
        obj: dict[str, Any] = cur.value
        existing = obj.get(name)
        if (
            existing is not None
            and isinstance(existing, dict)
            and not isinstance(existing, list)
        ):
            self.stack.append(Frame("object", existing, via_key=name))
            return
        nxt: dict[str, Any] = {}
        obj[name] = nxt
        self.stack.append(Frame("object", nxt, via_key=name))

    def create_enter_named_array(self, name: str) -> None:
        if self.phase == "init" or self.doc_kind == "none":
            self.ensure_fragment_root()
        cur = self.current()
        if cur.kind == "array":
            raise XaiopSyntaxError(
                f">name- while Cursor is inside an array (use < to leave first): >{name}-",
                line=self.line_no,
            )
        if cur.kind == "scalar":
            raise XaiopSyntaxError(
                f">name- is not valid on a scalar array element: >{name}-",
                line=self.line_no,
            )
        obj: dict[str, Any] = cur.value
        existing = obj.get(name)
        if isinstance(existing, list):
            self.stack.append(Frame("array", existing, via_key=name))
            return
        nxt: list[Any] = []
        obj[name] = nxt
        self.stack.append(Frame("array", nxt, via_key=name))

    def write_content(self, key: str, value: Any) -> None:
        if self.phase == "init" or self.doc_kind == "none":
            self.ensure_fragment_root()
        cur = self.current()
        if cur.kind == "scalar":
            raise XaiopSyntaxError(
                "Content is not valid on a scalar array element (use & to delete or . to reset)",
                line=self.line_no,
            )
        if cur.kind == "array":
            if key == "":
                cur.value.append(value)
                return
            cur.value.append({key: value})
            return
        obj: dict[str, Any] = cur.value
        if key == "":
            raise XaiopSyntaxError(
                ":value scalar Content is only valid at array level",
                line=self.line_no,
            )
        obj[key] = value

    def locate_path(self, path: str) -> None:
        if self.doc_kind == "none":
            raise XaiopSyntaxError("=path before any tree exists", line=self.line_no)
        if not path:
            raise XaiopSyntaxError("empty = path", line=self.line_no)
        tree = self.fragment_entries if self.doc_kind == "fragment" else self.root

        def segs_of(p: str) -> list[str]:
            return [self._logical_name(x) for x in p.split(">") if x]

        found = fuzzy_find(tree, segs_of(path))
        if not found and self.compat:
            trimmed = path.strip()
            cleared = re.sub(r"\s+", "", path)

            if self.fix_enabled("locatePathTrim") and trimmed and trimmed != path:
                found = fuzzy_find(tree, segs_of(trimmed))

            if (
                not found
                and self.fix_enabled("locatePathStripSpaces")
                and cleared
                and cleared != path
                and cleared != trimmed
            ):
                found = fuzzy_find(tree, segs_of(cleared))

            if not found and self.fix_enabled("locatePathArraySuffix"):
                for_suffix = (
                    cleared
                    if self.fix_enabled("locatePathStripSpaces") and cleared
                    else trimmed
                    if self.fix_enabled("locatePathTrim") and trimmed
                    else path
                )
                if any(
                    len(s) > 1 and s.endswith("-") for s in for_suffix.split(">")
                ):
                    found = fuzzy_find_compat_array_create_suffix(
                        tree, segs_of(for_suffix)
                    )

        if not found:
            raise XaiopSyntaxError(f"=path not found: {path}", line=self.line_no)
        self.stack = found
        self.phase = "active"

    def exact_enter(self, path: str) -> None:
        self.require_not_broadcast("@")
        segments = split_path_segments(path, self.line_no, "@", self.symbol_keys)
        if self.doc_kind == "none":
            self.ensure_document_object_root()
        self.broadcast_stacks = None

        if self.doc_kind == "fragment":
            self.stack = [Frame("fragment", self.fragment_entries)]
        else:
            kind: NodeKind = "array" if isinstance(self.root, list) else "object"
            self.stack = [Frame(kind, self.root)]
        self.phase = "active"

        for i, seg in enumerate(segments):
            cur = self.current()
            if cur.kind == "array":
                raise XaiopSyntaxError(
                    f"@path cannot descend by name while Cursor is inside an array: @{path}",
                    line=self.line_no,
                )
            obj: dict[str, Any] = cur.value
            existing = obj.get(seg)
            is_last = i == len(segments) - 1

            if isinstance(existing, list):
                if not is_last:
                    nxt: dict[str, Any] = {}
                    obj[seg] = nxt
                    self.stack.append(Frame("object", nxt, via_key=seg))
                else:
                    self.stack.append(Frame("array", existing, via_key=seg))
                continue

            if existing is not None and isinstance(existing, dict):
                self.stack.append(Frame("object", existing, via_key=seg))
                continue

            nxt = {}
            obj[seg] = nxt
            self.stack.append(Frame("object", nxt, via_key=seg))

    def broadcast_enter(self, path: str) -> None:
        if self.doc_kind == "none":
            raise XaiopSyntaxError("!path before any tree exists", line=self.line_no)
        segments = split_path_segments(path, self.line_no, "!", self.symbol_keys)
        matches: list[list[Frame]] = []
        tree = self.fragment_entries if self.doc_kind == "fragment" else self.root
        if self.doc_kind == "fragment":
            root_kind: NodeKind = "fragment"
        elif isinstance(tree, list):
            root_kind = "array"
        else:
            root_kind = "object"
        collect_path_matches(tree, root_kind, segments, matches)
        if not matches:
            raise XaiopSyntaxError(f"!path no match: {path}", line=self.line_no)
        self.broadcast_stacks = [list(s) for s in matches]
        self.stack = list(self.broadcast_stacks[0])
        self.phase = "active"

    def select_array_element(self, raw: str) -> None:
        self.require_not_broadcast("?")
        if self.phase == "init" or self.doc_kind == "none" or not self.stack:
            raise XaiopSyntaxError("? requires an array Cursor", line=self.line_no)
        cur = self.current()
        if cur.kind != "array":
            raise XaiopSyntaxError("? requires an array Cursor", line=self.line_no)
        arr: list[Any] = cur.value
        if not raw:
            raise XaiopSyntaxError("empty ? selector", line=self.line_no)
        all_match = False
        rest = raw
        if rest[0] == "*":
            all_match = True
            rest = rest[1:]
        indices: list[int]
        if rest == "":
            if not all_match:
                raise XaiopSyntaxError("empty ? selector", line=self.line_no)
            if not arr:
                raise XaiopSyntaxError("? matched no array elements", line=self.line_no)
            indices = list(range(len(arr)))
        elif not all_match and _is_index_selector(rest):
            i = int(rest)
            if i >= len(arr):
                raise XaiopSyntaxError(f"? index out of range: {rest}", line=self.line_no)
            indices = [i]
        else:
            colon = rest.find(":")
            if colon == -1:
                raise XaiopSyntaxError(f"invalid ? selector: {raw!r}", line=self.line_no)
            key = self._logical_name(rest[:colon])
            if not key:
                raise XaiopSyntaxError("empty ? predicate key", line=self.line_no)
            assert_name(key, self.line_no, self.symbol_keys)
            want = parse_value(rest[colon + 1 :], line_no=self.line_no)
            indices = []
            for i, el in enumerate(arr):
                if (
                    isinstance(el, dict)
                    and key in el
                    and _values_match(el[key], want)
                ):
                    indices.append(i)
                    if not all_match:
                        break
            if not indices:
                raise XaiopSyntaxError(
                    f"? matched no array elements: {raw}", line=self.line_no
                )
        broadcast = all_match or len(indices) > 1
        if broadcast:
            self.broadcast_stacks = []
            for i in indices:
                st = list(self.stack)
                _push_array_element_frame(st, arr, i)
                self.broadcast_stacks.append(st)
            self.stack = list(self.broadcast_stacks[0])
        else:
            _push_array_element_frame(self.stack, arr, indices[0])
        self.phase = "active"

    def delete_current_array_element(self) -> None:
        stacks = self.broadcast_stacks if self.broadcast_stacks else [self.stack]
        parent_arr: list[Any] | None = None
        indices: list[int] = []
        for st in stacks:
            if len(st) < 2:
                raise XaiopSyntaxError(
                    "bare & deletes the current array element (Cursor is not an array element)",
                    line=self.line_no,
                )
            el = st[-1]
            par = st[-2]
            if par.kind != "array":
                raise XaiopSyntaxError(
                    "bare & deletes the current array element (Cursor is not an array element)",
                    line=self.line_no,
                )
            arr = par.value
            if parent_arr is None:
                parent_arr = arr
            elif parent_arr is not arr:
                raise XaiopSyntaxError(
                    "bare & broadcast requires every Cursor to be an element of the same array",
                    line=self.line_no,
                )
            indices.append(_array_element_index(arr, el, self.line_no))
        assert parent_arr is not None
        for i in sorted(set(indices), reverse=True):
            del parent_arr[i]
        landed = list(stacks[0][:-1])
        self.broadcast_stacks = None
        self.stack = landed

    def delete_at_path(self, path: str) -> None:
        segments = split_path_segments(path, self.line_no, "&", self.symbol_keys)
        if self.broadcast_stacks:
            self.precheck_broadcast_delete(segments)
            self.run_on_cursors(lambda: self.delete_relative(segments))
            return
        self.delete_absolute(segments)

    def precheck_broadcast_delete(self, segments: list[str]) -> None:
        if not self.broadcast_stacks:
            return
        stacks = self.broadcast_stacks
        for i in range(len(stacks)):
            self.stack = list(stacks[i])
            self.precheck_relative_delete(segments)
        self.stack = list(stacks[0])

    def delete_absolute(self, segments: list[str]) -> None:
        if self.doc_kind == "none":
            return
        if self.doc_kind == "fragment":
            raise XaiopSyntaxError(
                "&path requires an object document root (fragment root is not allowed)",
                line=self.line_no,
            )
        if self.doc_kind == "array" or isinstance(self.root, list):
            raise XaiopSyntaxError(
                "&path requires an object document root", line=self.line_no
            )
        self.delete_from_object(self.root, segments)

    def delete_relative(self, segments: list[str]) -> None:
        cur = self.current()
        if cur.kind not in ("object", "fragment"):
            raise XaiopSyntaxError(
                "&path relative delete requires an object Cursor",
                line=self.line_no,
            )
        self.delete_from_object(cur.value, segments)

    def precheck_relative_delete(self, segments: list[str]) -> None:
        cur = self.current()
        if cur.kind not in ("object", "fragment"):
            raise XaiopSyntaxError(
                "&path relative delete requires an object Cursor",
                line=self.line_no,
            )
        obj: Any = cur.value
        for i, seg in enumerate(segments):
            if obj is None or not isinstance(obj, dict):
                return
            if seg not in obj:
                return
            nxt = obj[seg]
            if i == len(segments) - 1:
                self.assert_delete_not_on_cursor_chain(nxt)
                return
            if nxt is None or not isinstance(nxt, dict):
                return
            obj = nxt

    def delete_from_object(self, start: dict[str, Any], segments: list[str]) -> None:
        obj: Any = start
        for seg in segments[:-1]:
            if obj is None or not isinstance(obj, dict):
                return
            if seg not in obj:
                return
            nxt = obj[seg]
            if nxt is None or not isinstance(nxt, dict):
                return
            obj = nxt

        last = segments[-1]
        if obj is None or not isinstance(obj, dict):
            return
        if last not in obj:
            return
        target = obj[last]
        self.assert_delete_not_on_cursor_chain(target)
        del obj[last]

    def assert_delete_not_on_cursor_chain(self, target: Any) -> None:
        if target is None or not isinstance(target, (dict, list)):
            return
        stacks = self.broadcast_stacks if self.broadcast_stacks else [self.stack]
        for st in stacks:
            for frame in st:
                if frame.value is target:
                    raise XaiopSyntaxError(
                        "&path deletes a node on the Cursor chain",
                        line=self.line_no,
                    )

    def cursor_restore_lines(self) -> list[str]:
        if self.broadcast_stacks:
            raise XaiopSyntaxError(
                "cursor restore is not available while broadcast mode is active",
                line=self.line_no,
            )
        lines: list[str] = []
        for frame in self.stack[1:]:
            via = frame.via_key
            if via is None or via == "":
                raise XaiopSyntaxError(
                    "cannot restore Cursor after . "
                    "(anonymous or array-element frame on stack)",
                    line=self.line_no,
                )
            if frame.kind == "array":
                lines.append(f">{via}-")
            else:
                lines.append(f">{via}")
        return lines


def split_lines(source: str) -> list[str]:
    if len(source) == 0:
        return []
    n = len(source)
    n_lines = 1
    i = 0
    while i < n:
        c = source[i]
        if c == "\n":
            n_lines += 1
        elif c == "\r":
            n_lines += 1
            if i + 1 < n and source[i + 1] == "\n":
                i += 1
        i += 1
    lines: list[str] = [""] * n_lines
    start = 0
    i = 0
    li = 0
    while i < n:
        c = source[i]
        if c == "\n":
            lines[li] = source[start:i]
            li += 1
            start = i + 1
        elif c == "\r":
            lines[li] = source[start:i]
            li += 1
            if i + 1 < n and source[i + 1] == "\n":
                start = i + 2
                i += 1
            else:
                start = i + 1
        i += 1
    if start < n:
        lines[li] = source[start:]
        li += 1
    while li > 0 and lines[li - 1] == "":
        li -= 1
    if li != n_lines:
        del lines[li:]
    return lines


def strip_bom(s: str) -> str:
    return s[1:] if s and ord(s[0]) == 0xFEFF else s


def _rest_only_eols(source: str, from_idx: int) -> bool:
    for i in range(from_idx, len(source)):
        c = source[i]
        if c != "\n" and c != "\r":
            return False
    return True


def syntax_error_key(err: XaiopSyntaxError) -> str:
    msg = str(err)
    return re.sub(r"^line \d+:\s*", "", msg)


def _is_index_selector(s: str) -> bool:
    if not s or not s.isdigit():
        return False
    if len(s) > 1 and s[0] == "0":
        return False
    return True


def _values_match(a: Any, b: Any) -> bool:
    if type(a) is bool or type(b) is bool:
        return a is b if type(a) is bool and type(b) is bool else False
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return float(a) == float(b)
    return a == b


def _push_array_element_frame(stack: list[Frame], arr: list[Any], index: int) -> None:
    el = arr[index]
    if isinstance(el, list):
        stack.append(Frame("array", el, via_index=index))
    elif isinstance(el, dict):
        stack.append(Frame("object", el, via_index=index))
    else:
        stack.append(Frame("scalar", el, via_index=index))


def _array_element_index(arr: list[Any], el: Frame, line_no: int) -> int:
    vi = el.via_index
    if vi is not None and 0 <= vi < len(arr) and arr[vi] is el.value:
        return vi
    if el.kind != "scalar":
        for i, x in enumerate(arr):
            if x is el.value:
                return i
    elif vi is not None and 0 <= vi < len(arr):
        return vi
    raise XaiopSyntaxError(
        "bare & deletes the current array element (element is no longer in the parent array)",
        line=line_no,
    )


def assert_name(name: str, line_no: int, symbol_keys: bool = False) -> None:
    if not name:
        raise XaiopSyntaxError(f"invalid label name: {name!r}", line=line_no)
    if symbol_keys:
        if ":" in name or any(c.isspace() and ord(c) != 0x1F for c in name):
            raise XaiopSyntaxError(f"invalid label name: {name!r}", line=line_no)
        return
    # STRICT ASCII-oriented fast path (Encode / normal wires).
    head = name[0]
    if head in _OPERATOR_HEADS or name.endswith("-"):
        raise XaiopSyntaxError(f"invalid label name: {name!r}", line=line_no)
    for i, c in enumerate(name):
        o = ord(c)
        if o >= 0x80:
            if any(ch.isspace() and ord(ch) != 0x1F for ch in name[i:]):
                raise XaiopSyntaxError(f"invalid label name: {name!r}", line=line_no)
            if ":" in name or "@" in name or "&" in name:
                raise XaiopSyntaxError(f"invalid label name: {name!r}", line=line_no)
            return
        if c == " " or c == "\t" or c == "\n" or c == "\r" or c == ":" or c == "@" or c == "&":
            raise XaiopSyntaxError(f"invalid label name: {name!r}", line=line_no)
        # Other Unicode whitespace in ASCII range (rare): fall through to full check.
        if c.isspace():
            raise XaiopSyntaxError(f"invalid label name: {name!r}", line=line_no)


def split_path_segments(
    path: str,
    line_no: int,
    op: str,
    symbol_keys: bool = False,
) -> list[str]:
    if not path:
        raise XaiopSyntaxError(f"empty {op} path", line=line_no)
    if (
        ">>" in path
        or path.startswith(">")
        or path.endswith(">")
        or any(len(s) == 0 for s in path.split(">"))
    ):
        raise XaiopSyntaxError(f"invalid {op} path: {path!r}", line=line_no)
    segments = [decode_wire_label(s, symbol_keys) for s in path.split(">")]
    for s in segments:
        assert_name(s, line_no, symbol_keys)
    return segments


def unescape_content(payload: str, *, line_no: int | None = None) -> str:
    if "\\" not in payload:
        return payload
    out: list[str] = []
    i = 0
    n = len(payload)
    while i < n:
        c = payload[i]
        if c != "\\":
            out.append(c)
            i += 1
            continue
        if i + 1 >= n:
            raise XaiopSyntaxError(
                "incomplete Content escape (trailing backslash)", line=line_no
            )
        nxt = payload[i + 1]
        if nxt == "n":
            out.append("\n")
            i += 2
        elif nxt == "r":
            out.append("\r")
            i += 2
        elif nxt == "\\":
            out.append("\\")
            i += 2
        else:
            raise XaiopSyntaxError(f"unknown Content escape \\{nxt}", line=line_no)
    return "".join(out)


def parse_value(raw_value: str, *, line_no: int | None = None) -> Any:
    if not raw_value:
        return raw_value
    forced = False
    payload = raw_value
    c0 = raw_value[0]
    if c0 == " ":
        i = 1
        while i < len(raw_value) and raw_value[i] == " ":
            i += 1
        payload = raw_value[i:]
        forced = True
    payload = unescape_content(payload, line_no=line_no)
    if forced:
        return payload
    if payload == "true":
        return True
    if payload == "false":
        return False
    if payload == "null":
        return None
    # Fast reject: non-numeric heads cannot be int/float tokens.
    if payload and (
        payload[0] == "+"
        or payload[0] == "-"
        or payload[0] == "."
        or ("0" <= payload[0] <= "9")
    ):
        if is_int_token(payload):
            return int(payload)
        if is_float_token(payload):
            return float(payload)
    return payload


def is_int_token(s: str) -> bool:
    if not s:
        return False
    i = 0
    if s[0] in "-+":
        i = 1
    if i >= len(s):
        return False
    for j in range(i, len(s)):
        if not s[j].isdigit():
            return False
    return True


def is_float_token(s: str) -> bool:
    """Float token (PROT-CONTENT): fraction and/or exponent. No regexp alloc."""
    n = len(s)
    if n == 0:
        return False
    i = 0
    if s[0] == "+" or s[0] == "-":
        i = 1
        if i >= n:
            return False
    saw_dot = False
    saw_digit = False
    if s[i] == ".":
        i += 1
        if i >= n or not ("0" <= s[i] <= "9"):
            return False
        saw_dot = True
        while i < n and "0" <= s[i] <= "9":
            i += 1
            saw_digit = True
    else:
        if not ("0" <= s[i] <= "9"):
            return False
        while i < n and "0" <= s[i] <= "9":
            i += 1
            saw_digit = True
        if i < n and s[i] == ".":
            saw_dot = True
            i += 1
            while i < n and "0" <= s[i] <= "9":
                i += 1
    saw_exp = False
    if i < n and (s[i] == "e" or s[i] == "E"):
        saw_exp = True
        i += 1
        if i < n and (s[i] == "+" or s[i] == "-"):
            i += 1
        if i >= n or not ("0" <= s[i] <= "9"):
            return False
        while i < n and "0" <= s[i] <= "9":
            i += 1
    if i != n or not saw_digit:
        return False
    return saw_dot or saw_exp


def try_exact_descend(
    obj: dict[str, Any],
    parent_frame: Frame,
    trail: list[Frame],
    segments: list[str],
) -> list[Frame] | None:
    if segments[0] not in obj:
        return None
    stack = [*trail, parent_frame]
    node: Any = obj
    for seg in segments:
        if node is None or not isinstance(node, dict):
            return None
        if seg not in node:
            return None
        child = node[seg]
        if child is None or not isinstance(child, (dict, list)):
            return None
        kind: NodeKind = "array" if isinstance(child, list) else "object"
        stack.append(Frame(kind, child))
        node = child
    return stack


def collect_path_matches(
    node: Any,
    node_kind: NodeKind,
    segments: list[str],
    out: list[list[Frame]],
    trail: list[Frame] | None = None,
) -> None:
    if trail is None:
        trail = []
    if node is None or not isinstance(node, (dict, list)):
        return

    if isinstance(node, list) or node_kind == "array":
        frame = Frame("array", node)
        for el in node:
            if el is not None and isinstance(el, (dict, list)):
                kind: NodeKind = "array" if isinstance(el, list) else "object"
                collect_path_matches(el, kind, segments, out, [*trail, frame])
        return

    obj: dict[str, Any] = node
    frame = Frame("fragment" if node_kind == "fragment" else "object", obj)
    matched = try_exact_descend(obj, frame, trail, segments)
    start_key = segments[0]
    if matched:
        out.append(matched)
        for key, child in obj.items():
            if key == start_key:
                continue
            if child is not None and isinstance(child, (dict, list)):
                kind = "array" if isinstance(child, list) else "object"
                collect_path_matches(child, kind, segments, out, [*trail, frame])
        return

    for child in obj.values():
        if child is not None and isinstance(child, (dict, list)):
            kind = "array" if isinstance(child, list) else "object"
            collect_path_matches(child, kind, segments, out, [*trail, frame])


def fuzzy_find(
    node: Any,
    segments: list[str],
    trail: list[Frame] | None = None,
) -> list[Frame] | None:
    return _fuzzy_find_inner(node, segments, trail or [], False)


def fuzzy_find_compat_array_create_suffix(
    node: Any,
    segments: list[str],
    trail: list[Frame] | None = None,
) -> list[Frame] | None:
    return _fuzzy_find_inner(node, segments, trail or [], True)


def _fuzzy_find_inner(
    node: Any,
    segments: list[str],
    trail: list[Frame],
    allow_array_create_suffix: bool,
) -> list[Frame] | None:
    if not segments:
        return trail if trail else None
    if node is None or not isinstance(node, (dict, list)):
        return None

    if isinstance(node, list):
        frame = Frame("array", node)
        for el in node:
            hit = _fuzzy_find_inner(el, segments, [*trail, frame], allow_array_create_suffix)
            if hit:
                return hit
        return None

    obj: dict[str, Any] = node
    frame = Frame("object", obj)
    head, *rest = segments

    def try_child(child: Any) -> list[Frame] | None:
        if not rest:
            if child is not None and isinstance(child, (dict, list)):
                kind: NodeKind = "array" if isinstance(child, list) else "object"
                return [*trail, frame, Frame(kind, child)]
            return [*trail, frame]
        if child is not None and isinstance(child, (dict, list)):
            return _fuzzy_find_inner(child, rest, [*trail, frame], allow_array_create_suffix)
        return None

    if head in obj:
        hit = try_child(obj[head])
        if hit:
            return hit
    elif allow_array_create_suffix and len(head) > 1 and head.endswith("-"):
        base = head[:-1]
        if base in obj and isinstance(obj[base], list):
            hit = try_child(obj[base])
            if hit:
                return hit

    for child in obj.values():
        if child is not None and isinstance(child, (dict, list)):
            hit = _fuzzy_find_inner(child, segments, [*trail, frame], allow_array_create_suffix)
            if hit:
                return hit
    return None
