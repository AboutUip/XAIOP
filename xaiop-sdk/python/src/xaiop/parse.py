"""STRICT XAIOP wire parser (protocol v0.6.0 Frozen)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from .errors import XaiopSyntaxError
from .fragment import XaiopFragment

NodeKind = Literal["object", "array", "fragment"]
DocKind = Literal["none", "object", "array", "fragment"]

FLOAT_TOKEN_RE = re.compile(
    r"^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$|^[+-]?\d+[eE][+-]?\d+$"
)

_OPERATOR_HEADS = frozenset("><=!&#.-")


@dataclass
class Frame:
    kind: NodeKind
    value: Any
    via_key: str | None = None


def parse_sync(source: str) -> Any | XaiopFragment:
    """Parse a complete XAIOP wire document (STRICT mode only)."""
    if not isinstance(source, str):
        raise TypeError("XAIOP source must be a string")
    return Parser(source).parse()


class LiveParser:
    """Incremental parser: feed complete lines while keeping one live tree."""

    def __init__(self) -> None:
        self._p = Parser.create_live()

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

    def value(self) -> Any | XaiopFragment:
        return self._p.result()

    def cursor_restore_lines(self) -> list[str]:
        return self._p.cursor_restore_lines()


class Parser:
    def __init__(self, source: str) -> None:
        self.lines = split_lines(source)
        self.line_no = 0
        self._fed = 0
        self.root: Any = None
        self.fragment_entries: dict[str, Any] | None = None
        self.doc_kind: DocKind = "none"
        self.stack: list[Frame] = []
        self.broadcast_stacks: list[list[Frame]] | None = None
        self.phase: Literal["init", "active"] = "init"

    @staticmethod
    def create_live() -> Parser:
        return Parser("")

    def feed_line_fast(self, line: str) -> None:
        self._fed += 1
        self.line_no = self._fed
        logical = strip_bom(line) if self._fed == 1 else line
        if len(logical) == 0:
            raise XaiopSyntaxError(
                "empty line is a Content syntax error", line=self.line_no
            )
        self.handle_line(logical)

    def result(self) -> Any | XaiopFragment:
        if self.doc_kind == "fragment":
            return XaiopFragment(self.fragment_entries)  # type: ignore[arg-type]
        if self.root is None:
            return {}
        return self.root

    def parse(self) -> Any | XaiopFragment:
        for i, raw in enumerate(self.lines):
            self.line_no = i + 1
            line = strip_bom(raw) if i == 0 else raw
            if len(line) == 0:
                raise XaiopSyntaxError(
                    "empty line is a Content syntax error", line=self.line_no
                )
            self.handle_line(line)
        return self.result()

    def handle_line(self, line: str) -> None:
        if line.startswith("#"):
            return

        if line == ".":
            self.reset_to_root()
            return

        if line == "<":
            self.precheck_broadcast_pop()
            self.run_on_cursors(self.pop_only)
            return

        if line.startswith("<") and len(line) > 1:
            name = line[1:]
            assert_name(name, self.line_no)
            self.precheck_broadcast_pop()

            def op() -> None:
                self.pop_only()
                self.create_enter_named_object(name)

            self.run_on_cursors(op)
            return

        if line.startswith("="):
            self.require_not_broadcast("=")
            self.locate_path(line[1:])
            return

        if line.startswith("@"):
            self.exact_enter(line[1:])
            return

        if line.startswith("!"):
            self.require_not_broadcast("!")
            self.broadcast_enter(line[1:])
            return

        if line.startswith("&"):
            self.delete_at_path(line[1:])
            return

        if line == ">":
            self.run_on_cursors(self.create_enter_anonymous_object)
            return

        if line == "-":
            self.run_on_cursors(self.create_enter_anonymous_array)
            return

        if line.startswith(">") and line.endswith("-") and len(line) > 2:
            name = line[1:-1]
            assert_name(name, self.line_no)
            self.run_on_cursors(lambda: self.create_enter_named_array(name))
            return

        if line.startswith(">") and len(line) > 1:
            if ">>" in line:
                raise XaiopSyntaxError(
                    "same-symbol stacking >> is forbidden", line=self.line_no
                )
            name = line[1:]
            if ">" in name:
                parts = name.split(">")
                for p in parts:
                    assert_name(p, self.line_no)

                def op_multi() -> None:
                    for p in parts:
                        self.create_enter_named_object(p)

                self.run_on_cursors(op_multi)
                return
            assert_name(name, self.line_no)
            self.run_on_cursors(lambda: self.create_enter_named_object(name))
            return

        colon = line.find(":")
        if colon == -1:
            raise XaiopSyntaxError(
                f"Bare Label or unknown line form: {line!r}", line=self.line_no
            )
        key = line[:colon]
        raw_value = line[colon + 1 :]
        value = parse_value(raw_value)
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
            self.stack.append(Frame("object", obj))
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
            self.stack.append(Frame("array", arr))
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
            return [x for x in p.split(">") if x]

        found = fuzzy_find(tree, segs_of(path))
        if not found:
            raise XaiopSyntaxError(f"=path not found: {path}", line=self.line_no)
        self.stack = found
        self.phase = "active"

    def exact_enter(self, path: str) -> None:
        self.require_not_broadcast("@")
        segments = split_path_segments(path, self.line_no, "@")
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
        segments = split_path_segments(path, self.line_no, "!")
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

    def delete_at_path(self, path: str) -> None:
        segments = split_path_segments(path, self.line_no, "&")
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
    lines: list[str] = []
    start = 0
    i = 0
    n = len(source)
    while i < n:
        c = ord(source[i])
        if c == 10:
            lines.append(source[start:i])
            start = i + 1
        elif c == 13:
            lines.append(source[start:i])
            if i + 1 < n and ord(source[i + 1]) == 10:
                start = i + 2
                i += 1
            else:
                start = i + 1
        i += 1
    if start < n:
        lines.append(source[start:])
    while lines and lines[-1] == "":
        lines.pop()
    return lines


def strip_bom(s: str) -> str:
    return s[1:] if s and ord(s[0]) == 0xFEFF else s


def assert_name(name: str, line_no: int) -> None:
    if (
        not name
        or any(c.isspace() for c in name)
        or ":" in name
        or name.endswith("-")
        or (name and name[0] in _OPERATOR_HEADS)
        or "@" in name
        or "&" in name
    ):
        raise XaiopSyntaxError(f"invalid label name: {name!r}", line=line_no)


def split_path_segments(path: str, line_no: int, op: str) -> list[str]:
    if not path:
        raise XaiopSyntaxError(f"empty {op} path", line=line_no)
    if (
        ">>" in path
        or path.startswith(">")
        or path.endswith(">")
        or any(len(s) == 0 for s in path.split(">"))
    ):
        raise XaiopSyntaxError(f"invalid {op} path: {path!r}", line=line_no)
    segments = path.split(">")
    for s in segments:
        assert_name(s, line_no)
    return segments


def parse_value(raw_value: str) -> Any:
    if raw_value and ord(raw_value[0]) == 32:
        i = 1
        while i < len(raw_value) and ord(raw_value[i]) == 32:
            i += 1
        return raw_value[i:]
    if raw_value == "true":
        return True
    if raw_value == "false":
        return False
    if raw_value == "null":
        return None
    if is_int_token(raw_value):
        return int(raw_value)
    if is_float_token(raw_value):
        return float(raw_value)
    return raw_value


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
    return bool(FLOAT_TOKEN_RE.match(s))


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
    if trail is None:
        trail = []
    if not segments:
        return trail if trail else None
    if node is None or not isinstance(node, (dict, list)):
        return None

    if isinstance(node, list):
        frame = Frame("array", node)
        for el in node:
            hit = fuzzy_find(el, segments, [*trail, frame])
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
            return fuzzy_find(child, rest, [*trail, frame])
        return None

    if head in obj:
        hit = try_child(obj[head])
        if hit:
            return hit

    for child in obj.values():
        if child is not None and isinstance(child, (dict, list)):
            hit = fuzzy_find(child, segments, [*trail, frame])
            if hit:
                return hit
    return None
