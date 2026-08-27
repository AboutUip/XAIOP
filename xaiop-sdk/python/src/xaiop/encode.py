"""JSON → XAIOP encoder (protocol v0.7.0 Draft wire)."""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Literal

from .errors import XaiopEncodeError
from .label_escape import encode_wire_label, key_needs_symbol_escape

# Int or float token per PROT-CONTENT §5 (union of the former int/float REs).
_NUMBER_LIKE_RE = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\Z")

DOT_POLICY = {
    "NONE": "none",
    "PER_TOP_LEVEL_KEY": "perTopLevelKey",
    "PER_N_KEYS": "perNKeys",
    "CUSTOM": "custom",
}

RootKind = Literal["auto", "object", "array", "fragment"]
StyleKind = Literal["reset", "relative"]
DotPolicyName = Literal["none", "perTopLevelKey", "perNKeys", "custom"]
KeyOrder = Literal["insertion", "sorted"]
NullPolicy = Literal["encode", "omit", "error"]
UndefinedPolicy = Literal["omit", "error"]


def encode_sync(
    value: Any,
    *,
    root: RootKind = "auto",
    style: StyleKind = "reset",
    dot_policy: DotPolicyName | list[str] = DOT_POLICY["PER_TOP_LEVEL_KEY"],
    phase_every: int | None = None,
    max_phases: int | None = None,
    final_dot: bool = False,
    key_order: KeyOrder = "insertion",
    null_policy: NullPolicy = "encode",
    undefined_policy: UndefinedPolicy = "omit",
    should_phase: Callable[[dict[str, Any]], bool] | None = None,
    symbol_keys: bool = False,
    trailing_newline: bool = True,
) -> str:
    """Encode a JSON value as XAIOP wire."""
    opt = _normalize_options(
        root=root,
        style=style,
        dot_policy=dot_policy,
        phase_every=phase_every,
        max_phases=max_phases,
        final_dot=final_dot,
        key_order=key_order,
        null_policy=null_policy,
        undefined_policy=undefined_policy,
        should_phase=should_phase,
        symbol_keys=symbol_keys,
    )

    if value is None:
        raise XaiopEncodeError("cannot encode null as a document root")

    if opt["path_cuts"] is not None:
        wire = _encode_with_path_cuts(value, opt)
        return _finalize_wire(wire, opt["final_dot"], trailing_newline)

    root_kind = _resolve_root(value, opt["root"])
    lines: list[str] = []

    if root_kind == "array":
        if not isinstance(value, list):
            raise XaiopEncodeError("root:'array' requires an array value")
        lines.append("-")
        _emit_array_elements(lines, value, opt, "$")
        return _finalize_wire(lines, opt["final_dot"], trailing_newline)

    if root_kind == "fragment":
        if not _is_plain_object(value):
            raise XaiopEncodeError(
                "root:'fragment' requires a plain object", path="$"
            )
        for key in _ordered_keys(value, opt["key_order"]):
            _emit_object_entry(lines, key, value[key], opt, f"$.{key}")
        return _finalize_wire(lines, opt["final_dot"], trailing_newline)

    if not _is_plain_object(value):
        raise XaiopEncodeError(
            "object document root requires a plain object (or use an array root)",
            path="$",
        )

    keys = _ordered_keys(value, opt["key_order"])
    if not keys:
        lines.append(">")
        return _finalize_wire(lines, opt["final_dot"], trailing_newline)

    if opt["dot_policy"] == DOT_POLICY["NONE"] and opt["style"] == "relative":
        lines.append(">")
        for key in keys:
            _emit_object_entry(lines, key, value[key], opt, f"$.{key}")
        return _finalize_wire(lines, opt["final_dot"], trailing_newline)

    plan = _plan_phases(keys, opt)
    for phase_idx, phase_keys in enumerate(plan):
        if phase_idx > 0:
            lines.append(".")
        lines.append(">")
        for key in phase_keys:
            _emit_object_entry(lines, key, value[key], opt, f"$.{key}")
    return _finalize_wire(lines, opt["final_dot"], trailing_newline)


def _normalize_options(
    *,
    root: RootKind,
    style: StyleKind,
    dot_policy: DotPolicyName | list[str],
    phase_every: int | None,
    max_phases: int | None,
    final_dot: bool,
    key_order: KeyOrder,
    null_policy: NullPolicy,
    undefined_policy: UndefinedPolicy,
    should_phase: Callable[[dict[str, Any]], bool] | None,
    symbol_keys: bool,
) -> dict[str, Any]:
    if isinstance(dot_policy, list):
        return _normalize_path_cut_options(
            root=root,
            dot_policy=dot_policy,
            final_dot=final_dot,
            key_order=key_order,
            null_policy=null_policy,
            undefined_policy=undefined_policy,
            symbol_keys=symbol_keys,
        )

    if dot_policy not in (
        DOT_POLICY["NONE"],
        DOT_POLICY["PER_TOP_LEVEL_KEY"],
        DOT_POLICY["PER_N_KEYS"],
        DOT_POLICY["CUSTOM"],
    ):
        raise XaiopEncodeError(f"unknown dotPolicy: {dot_policy!r}")

    every = phase_every if phase_every is not None else 1
    if phase_every is not None:
        if not isinstance(phase_every, int) or phase_every < 1:
            raise XaiopEncodeError("phaseEvery must be a positive integer")
        every = phase_every
    if dot_policy == DOT_POLICY["PER_TOP_LEVEL_KEY"]:
        every = 1
    if dot_policy == DOT_POLICY["NONE"]:
        every = 2**31 - 1
    if not isinstance(every, int) or every < 1:
        raise XaiopEncodeError("phaseEvery must be a positive integer")

    if max_phases is not None and (not isinstance(max_phases, int) or max_phases < 1):
        raise XaiopEncodeError("maxPhases must be a positive integer when set")

    if dot_policy == DOT_POLICY["CUSTOM"] and should_phase is None:
        raise XaiopEncodeError("dotPolicy:'custom' requires should_phase(ctx)")

    if style not in ("reset", "relative"):
        raise XaiopEncodeError(f"unknown style: {style!r}")
    if root not in ("auto", "object", "array", "fragment"):
        raise XaiopEncodeError(f"unknown root: {root!r}")
    if key_order not in ("insertion", "sorted"):
        raise XaiopEncodeError(f"unknown keyOrder: {key_order!r}")
    if null_policy not in ("encode", "omit", "error"):
        raise XaiopEncodeError(f"unknown nullPolicy: {null_policy!r}")
    if undefined_policy not in ("omit", "error"):
        raise XaiopEncodeError(f"unknown undefinedPolicy: {undefined_policy!r}")

    return {
        "root": root,
        "style": style,
        "dot_policy": dot_policy,
        "phase_every": every,
        "max_phases": max_phases,
        "final_dot": final_dot,
        "key_order": key_order,
        "null_policy": null_policy,
        "undefined_policy": undefined_policy,
        "should_phase": should_phase,
        "symbol_keys": symbol_keys,
        "path_cuts": None,
    }


def _normalize_path_cut_options(
    *,
    root: RootKind,
    dot_policy: list[str],
    final_dot: bool,
    key_order: KeyOrder,
    null_policy: NullPolicy,
    undefined_policy: UndefinedPolicy,
    symbol_keys: bool,
) -> dict[str, Any]:
    if root not in ("auto", "object", "array", "fragment"):
        raise XaiopEncodeError(f"unknown root: {root!r}")
    if key_order not in ("insertion", "sorted"):
        raise XaiopEncodeError(f"unknown keyOrder: {key_order!r}")
    if null_policy not in ("encode", "omit", "error"):
        raise XaiopEncodeError(f"unknown nullPolicy: {null_policy!r}")
    if undefined_policy not in ("omit", "error"):
        raise XaiopEncodeError(f"unknown undefinedPolicy: {undefined_policy!r}")

    normalized: list[str] = []
    seen: set[str] = set()
    for i, path in enumerate(dot_policy):
        if not isinstance(path, str) or not path:
            raise XaiopEncodeError(
                f"dotPolicy path array entry {i} must be a non-empty string"
            )
        segs = parse_json_path(path)
        for s in range(len(segs)):
            if isinstance(segs[s], int):
                for t in range(s + 1, len(segs)):
                    if not isinstance(segs[t], int):
                        raise XaiopEncodeError(
                            "dotPolicy path cannot cut inside an array element object "
                            f"(index must be final): {path!r}",
                            path=path,
                        )
                break
        canon = format_json_path(segs)
        if canon in seen:
            raise XaiopEncodeError(f"duplicate dotPolicy path: {path!r}")
        seen.add(canon)
        normalized.append(canon)

    return {
        "root": root,
        "style": "reset",
        "dot_policy": "__paths__",
        "phase_every": 2**31 - 1,
        "max_phases": None,
        "final_dot": final_dot,
        "key_order": key_order,
        "null_policy": null_policy,
        "undefined_policy": undefined_policy,
        "should_phase": None,
        "symbol_keys": symbol_keys,
        "path_cuts": normalized,
    }


def _resolve_root(value: Any, root: RootKind) -> Literal["object", "array", "fragment"]:
    if root == "object":
        return "object"
    if root == "array":
        return "array"
    if root == "fragment":
        return "fragment"
    if isinstance(value, list):
        return "array"
    return "object"


def _ordered_keys(obj: dict[str, Any], key_order: KeyOrder):
    if key_order == "sorted":
        return sorted(obj)
    # Insertion order: dict view, no list copy on the hot path (callers iterate).
    return obj.keys()


def _plan_phases(keys, opt: dict[str, Any]) -> list[list[str]]:
    if not keys:
        return []
    if not isinstance(keys, list):
        keys = list(keys)  # phase planning slices; dict views cannot
    dot_policy = opt["dot_policy"]
    if dot_policy == DOT_POLICY["NONE"]:
        return [keys[:]]

    if dot_policy == DOT_POLICY["CUSTOM"]:
        phases: list[list[str]] = []
        cur: list[str] = []
        for i, key in enumerate(keys):
            cur.append(key)
            is_last = i == len(keys) - 1
            ctx = {
                "key": key,
                "index": i,
                "total": len(keys),
                "keysInPhase": len(cur),
                "phaseIndex": len(phases),
            }
            cut = (not is_last) and bool(opt["should_phase"](ctx))
            if cut:
                phases.append(cur)
                cur = []
        if cur:
            phases.append(cur)
        return _apply_max_phases(phases, opt["max_phases"])

    every = opt["phase_every"]
    max_phases = opt["max_phases"]
    if max_phases is not None:
        need = (len(keys) + every - 1) // every
        if need > max_phases:
            every = (len(keys) + max_phases - 1) // max_phases

    phases = [keys[i : i + every] for i in range(0, len(keys), every)]
    return phases


def _apply_max_phases(phases: list[list[str]], max_phases: int | None) -> list[list[str]]:
    if max_phases is None or len(phases) <= max_phases:
        return phases
    head = phases[: max_phases - 1]
    tail: list[str] = []
    for phase in phases[max_phases - 1 :]:
        tail.extend(phase)
    return [*head, tail]


def _emit_object_entry(
    lines: list[str],
    key: str,
    value: Any,
    opt: dict[str, Any],
    path: str,
) -> None:
    _assert_key(key, path, opt["symbol_keys"])
    wk = encode_wire_label(key, opt["symbol_keys"])

    if value is None:
        if opt["null_policy"] == "error":
            raise XaiopEncodeError("null value not allowed", path=path)
        if opt["null_policy"] == "omit":
            return
        lines.append(_format_content(wk, None, path))
        return

    if isinstance(value, list):
        lines.append(f">{wk}-")
        _emit_array_elements(lines, value, opt, path)
        lines.append("<")
        return

    if _is_plain_object(value):
        lines.append(f">{wk}")
        for k in _ordered_keys(value, opt["key_order"]):
            _emit_object_entry(lines, k, value[k], opt, f"{path}.{k}")
        lines.append("<")
        return

    lines.append(_format_content(wk, value, path))


def _emit_array_elements(
    lines: list[str],
    arr: list[Any],
    opt: dict[str, Any],
    path: str,
) -> None:
    for i, el in enumerate(arr):
        el_path = f"{path}[{i}]"
        if el is None:
            if opt["null_policy"] == "error":
                raise XaiopEncodeError("null array element not allowed", path=el_path)
            lines.append(_format_scalar_element(None, el_path))
            continue
        if isinstance(el, list):
            lines.append("-")
            _emit_array_elements(lines, el, opt, el_path)
            lines.append("<")
            continue
        if _is_plain_object(el):
            lines.append(">")
            for k in _ordered_keys(el, opt["key_order"]):
                _emit_object_entry(lines, k, el[k], opt, f"{el_path}.{k}")
            lines.append("<")
            continue
        lines.append(_format_scalar_element(el, el_path))


def _format_scalar_element(value: Any, path: str) -> str:
    if value is None:
        return ":null"
    if isinstance(value, bool):
        return f":{'true' if value else 'false'}"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f":{_format_number_token(value, path)}"
    if isinstance(value, str):
        _assert_encodable_string(value, path)
        wire = _escape_content(value)
        if _needs_forced_string(value):
            return f": {wire}"
        return f":{wire}"
    raise XaiopEncodeError(
        f"unsupported array element type: {type(value).__name__}", path=path
    )


def _format_content(key: str, value: Any, path: str) -> str:
    if value is None:
        return f"{key}:null"
    if isinstance(value, bool):
        return f"{key}:{'true' if value else 'false'}"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"{key}:{_format_number_token(value, path)}"
    if isinstance(value, str):
        _assert_encodable_string(value, path)
        wire = _escape_content(value)
        if _needs_forced_string(value):
            return f"{key}: {wire}"
        return f"{key}:{wire}"
    raise XaiopEncodeError(
        f"unsupported value type: {type(value).__name__}", path=path
    )


def _format_number_token(n: int | float, path: str) -> str:
    if not isinstance(n, (int, float)) or not (n == n and abs(n) != float("inf")):
        raise XaiopEncodeError(
            f"non-finite numbers are not encodable as float tokens ({n!r})",
            path=path,
        )
    if isinstance(n, int) and not isinstance(n, bool):
        return str(n)
    if isinstance(n, float) and n.is_integer() and abs(n) <= 2**53:
        return str(int(n))
    # Match ECMAScript Number::toString (same as Node / Java Encoder.jsNumberToken).
    return _js_number_token(float(n))


def _significant_digits(repr_s: str) -> int:
    e = repr_s.find("e")
    if e < 0:
        e = repr_s.find("E")
    mantissa = repr_s if e < 0 else repr_s[:e]
    digits = 0
    started = False
    for c in mantissa:
        if c < "0" or c > "9":
            continue
        if c != "0":
            started = True
        if started:
            digits += 1
    return max(digits, 1)


def _js_number_token(value: float) -> str:
    """Shortest round-trip decimal matching ECMAScript Number#toString.

    Fast path: CPython ``repr(float)`` already emits the shortest decimal that
    round-trips (the same digits ECMAScript picks); only the fixed/scientific
    cut-over differs, so reformat those digits per the ES rules (scientific
    when the decimal exponent n is > 21 or <= -6). The Decimal slow path is
    kept as fallback for unexpected repr forms.
    """
    if value == 0.0:
        return "0"
    sign = "-" if value < 0 else ""
    r = repr(value if value >= 0 else -value)
    e = r.find("e")
    if e >= 0:
        mant = r[:e]
        exp10 = int(r[e + 1 :])
    else:
        mant = r
        exp10 = 0
    dot = mant.find(".")
    if dot >= 0:
        digits_all = mant[:dot] + mant[dot + 1 :]
        exp10 -= len(mant) - dot - 1
    else:
        digits_all = mant
    digs = digits_all.lstrip("0")
    if not digs or not digs.isdigit():
        return _js_number_token_slow(value)
    stripped = digs.rstrip("0")
    exp10 += len(digs) - len(stripped)
    digs = stripped
    k = len(digs)
    # ECMAScript: value = 0.<digits> x 10^n
    n = k + exp10

    if k <= n <= 21:
        return sign + digs + ("0" * (n - k))
    if 0 < n <= 21:
        return sign + digs[:n] + "." + digs[n:]
    if -6 < n <= 0:
        return sign + "0." + ("0" * (-n)) + digs
    mantissa = digs if k == 1 else digs[0] + "." + digs[1:]
    exponent = n - 1
    return sign + mantissa + "e" + ("+" if exponent >= 0 else "-") + str(abs(exponent))


def _js_number_token_slow(value: float) -> str:
    """Decimal-based reference (shortest round-trip search); fallback path."""
    from decimal import ROUND_HALF_EVEN, Decimal, localcontext

    d_abs = abs(value)
    sign = "-" if value < 0 else ""
    exact = Decimal(d_abs)
    shortest = None
    upper = _significant_digits(repr(d_abs))
    for k in range(upper, 0, -1):
        with localcontext() as ctx:
            ctx.prec = k
            ctx.rounding = ROUND_HALF_EVEN
            candidate = +exact  # apply precision
        if float(candidate) != d_abs:
            break
        shortest = candidate
    if shortest is None:
        with localcontext() as ctx:
            ctx.prec = 17
            ctx.rounding = ROUND_HALF_EVEN
            shortest = +exact

    trimmed = shortest.normalize()
    # Decimal normalize may use scientific; get digit string via to_eng / as_tuple
    # Prefer plain fixed form for digit extraction:
    plain = format(trimmed, "f")
    if "." in plain:
        intpart, frac = plain.split(".", 1)
        digits = (intpart + frac).lstrip("0") or "0"
        # n = k - scale where value = digits * 10^(n-k)
        scale = len(frac)
        # strip trailing zeros from digits already in normalize
        while digits.endswith("0") and "." in plain and len(digits) > 1:
            # recompute from trimmed tuple
            break
    # Use as_tuple for reliable digits / exponent
    sign_t, digits_t, exp = trimmed.as_tuple()
    digs = "".join(str(d) for d in digits_t) or "0"
    k = len(digs)
    # ECMAScript: value = 0.<digits> × 10^n  ⇒  n = k + exp
    n = k + int(exp)

    if k <= n <= 21:
        return sign + digs + ("0" * (n - k))
    if 0 < n <= 21:
        return sign + digs[:n] + "." + digs[n:]
    if -6 < n <= 0:
        return sign + "0." + ("0" * (-n)) + digs

    mantissa = digs if k == 1 else digs[0] + "." + digs[1:]
    exponent = n - 1
    return sign + mantissa + "e" + ("+" if exponent >= 0 else "-") + str(abs(exponent))


def _needs_forced_string(s: str) -> bool:
    # Head-char fast reject: typical strings never reach the regex at all.
    if not s:
        return False
    c = s[0]
    if c in "tfn":
        return s in ("true", "false", "null")
    if c in "+-.0123456789":
        return _NUMBER_LIKE_RE.match(s) is not None
    return False


def _assert_key(key: str, path: str, symbol_keys: bool = False) -> None:
    if not isinstance(key, str) or not key:
        raise XaiopEncodeError("object keys must be non-empty strings", path=path)
    if any(c.isspace() and ord(c) != 0x1F for c in key) or ":" in key:
        raise XaiopEncodeError(f"invalid label name: {key!r}", path=path)
    if key.endswith("-"):
        raise XaiopEncodeError(
            f'invalid label name (trailing "-" reserved for arrays): {key!r}',
            path=path,
        )
    if key_needs_symbol_escape(key) and not symbol_keys:
        raise XaiopEncodeError(
            "invalid label name (must not begin with line-operator or U+001F; "
            f"enable symbolKeys to escape): {key!r}",
            path=path,
        )
    body = key[1:] if key_needs_symbol_escape(key) and symbol_keys else key
    if any(c in body for c in "><=!&"):
        raise XaiopEncodeError(
            f"invalid label name (contains Cursor/operator character): {key!r}",
            path=path,
        )


def _assert_encodable_string(s: str, path: str) -> None:
    if s and ord(s[0]) == 0x20:
        raise XaiopEncodeError(
            "string values must not begin with U+0020 SPACE "
            "(wire forced-string marker would strip leading spaces)",
            path=path,
        )


def _escape_content(s: str) -> str:
    """PROT-CONTENT §4.1 — always-on Content escape (`\\` `\\n` `\\r`)."""
    if "\\" not in s and "\n" not in s and "\r" not in s:
        return s
    out: list[str] = []
    for c in s:
        if c == "\\":
            out.append("\\\\")
        elif c == "\n":
            out.append("\\n")
        elif c == "\r":
            out.append("\\r")
        else:
            out.append(c)
    return "".join(out)


def _is_plain_object(v: Any) -> bool:
    return isinstance(v, dict) and type(v) is dict


def _finalize_wire(lines: list[str], final_dot: bool, trailing_newline: bool) -> str:
    cleaned = _collapse_redundant_leaves(lines)
    if final_dot:
        cleaned = cleaned[:]
        cleaned.append(".")
    if not cleaned:
        return ""
    text = "\n".join(cleaned)
    if trailing_newline:
        text += "\n"
    return text


def _collapse_redundant_leaves(lines: list[str]) -> list[str]:
    drop = 0
    for i in range(len(lines)):
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        if lines[i] == "<" and (nxt == "." or nxt is None):
            drop += 1
    if drop == 0:
        return lines
    out: list[str] = []
    for i, line in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        if line == "<" and (nxt == "." or nxt is None):
            continue
        out.append(line)
    return out


def parse_json_path(path: str) -> list[str | int]:
    if not isinstance(path, str) or not path:
        raise XaiopEncodeError("JSON path must be a non-empty string")
    segs: list[str | int] = []
    i = 0
    while i < len(path):
        c = path[i]
        if c == ".":
            if i == 0 or i == len(path) - 1:
                raise XaiopEncodeError(f"invalid JSON path: {path!r}")
            i += 1
            if i >= len(path) or path[i] in ".[":
                raise XaiopEncodeError(f"invalid JSON path: {path!r}")
            continue
        if c == "[":
            end = path.find("]", i)
            if end < 0:
                raise XaiopEncodeError(f"invalid JSON path: {path!r}")
            raw = path[i + 1 : end]
            if not raw.isdigit():
                raise XaiopEncodeError(
                    f"invalid array index in path: {path!r}"
                )
            if not segs:
                raise XaiopEncodeError(
                    f"JSON path cannot start with an index: {path!r}"
                )
            segs.append(int(raw))
            i = end + 1
            continue
        j = i
        while j < len(path) and path[j] not in ".[":
            j += 1
        if j == i:
            raise XaiopEncodeError(f"invalid JSON path: {path!r}")
        name = path[i:j]
        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name):
            if re.search(r"\s|:|[><=!]", name) or name.endswith("-") or not name:
                raise XaiopEncodeError(f"invalid path segment: {name!r}")
        segs.append(name)
        i = j
    if not segs:
        raise XaiopEncodeError(f"invalid JSON path: {path!r}")
    return segs


def format_json_path(segs: list[str | int]) -> str:
    out = ""
    for i, seg in enumerate(segs):
        if isinstance(seg, int):
            out += f"[{seg}]"
        else:
            if i > 0:
                out += "."
            out += seg
    return out


def _encode_with_path_cuts(value: Any, opt: dict[str, Any]) -> list[str]:
    root_kind = _resolve_root(value, opt["root"])
    cut_set = set(opt["path_cuts"] or [])

    for p in cut_set:
        _assert_path_exists(value, root_kind, parse_json_path(p), p)

    lines: list[str] = []
    open_stack: list[str | int] = []
    after_dot = False

    def reopen_to(
        target_ancestors: list[str | int],
        root_kind_local: Literal["object", "array", "fragment"],
        *,
        array_tail: bool = False,
    ) -> None:
        nonlocal after_dot, open_stack
        if after_dot or not lines:
            if root_kind_local == "array":
                lines.append("-")
            else:
                lines.append(">")
            after_dot = False
            open_stack = []

        i = 0
        while (
            i < len(open_stack)
            and i < len(target_ancestors)
            and open_stack[i] == target_ancestors[i]
        ):
            i += 1
        while len(open_stack) > i:
            lines.append("<")
            open_stack.pop()
        for j in range(i, len(target_ancestors)):
            seg = target_ancestors[j]
            if isinstance(seg, int):
                open_stack.append(seg)
                continue
            nxt = target_ancestors[j + 1] if j + 1 < len(target_ancestors) else None
            is_array_enter = isinstance(nxt, int) or (
                array_tail and j == len(target_ancestors) - 1
            )
            wk = encode_wire_label(str(seg), opt["symbol_keys"])
            lines.append(f">{wk}-" if is_array_enter else f">{wk}")
            open_stack.append(seg)

    def maybe_cut(segs: list[str | int]) -> None:
        nonlocal after_dot, open_stack
        canon = format_json_path(segs)
        if canon not in cut_set:
            return
        cut_set.discard(canon)
        lines.append(".")
        after_dot = True
        open_stack = []

    def emit_object_path(
        key: str,
        val: Any,
        segs: list[str | int],
        root_kind_local: Literal["object", "array", "fragment"],
    ) -> None:
        nonlocal open_stack, after_dot
        path = format_json_path(segs)
        _assert_key(key, path, opt["symbol_keys"])
        wk = encode_wire_label(key, opt["symbol_keys"])

        parent_segs = segs[:-1]
        reopen_to(parent_segs, root_kind_local)

        if val is None:
            if opt["null_policy"] == "error":
                raise XaiopEncodeError("null value not allowed", path=path)
            if opt["null_policy"] == "omit":
                return
            lines.append(_format_content(wk, None, path))
            maybe_cut(segs)
            return

        if isinstance(val, list):
            lines.append(f">{wk}-")
            open_stack.append(key)
            emit_array_path(val, segs, root_kind_local)
            if not after_dot and open_stack and open_stack[-1] == key:
                lines.append("<")
                open_stack.pop()
            maybe_cut(segs)
            return

        if _is_plain_object(val):
            lines.append(f">{wk}")
            open_stack.append(key)
            for k in _ordered_keys(val, opt["key_order"]):
                emit_object_path(k, val[k], [*segs, k], root_kind_local)
            if not after_dot and open_stack and open_stack[-1] == key:
                lines.append("<")
                open_stack.pop()
            maybe_cut(segs)
            return

        lines.append(_format_content(wk, val, path))
        maybe_cut(segs)

    def emit_array_path(
        arr: list[Any],
        arr_segs: list[str | int],
        root_kind_local: Literal["object", "array", "fragment"],
    ) -> None:
        nonlocal open_stack, after_dot
        if not arr_segs:
            reopen_to([], root_kind_local)
        for i, el in enumerate(arr):
            el_segs = [*arr_segs, i]
            el_path = format_json_path(el_segs)
            reopen_to(arr_segs, root_kind_local, array_tail=bool(arr_segs))
            open_stack.append(i)
            if el is None:
                if opt["null_policy"] == "error":
                    raise XaiopEncodeError("null array element not allowed", path=el_path)
                lines.append(_format_scalar_element(None, el_path))
                open_stack.pop()
                maybe_cut(el_segs)
                continue
            if isinstance(el, list):
                lines.append("-")
                emit_array_path_nested(el, el_segs, root_kind_local)
                if not after_dot:
                    lines.append("<")
                if not after_dot and open_stack and open_stack[-1] == i:
                    open_stack.pop()
                maybe_cut(el_segs)
                continue
            if _is_plain_object(el):
                lines.append(">")
                for k in _ordered_keys(el, opt["key_order"]):
                    emit_object_path(k, el[k], [*el_segs, k], root_kind_local)
                if not after_dot:
                    lines.append("<")
                if not after_dot and open_stack and open_stack[-1] == i:
                    open_stack.pop()
                maybe_cut(el_segs)
                continue
            lines.append(_format_scalar_element(el, el_path))
            open_stack.pop()
            maybe_cut(el_segs)

    def emit_array_path_nested(
        arr: list[Any],
        arr_segs: list[str | int],
        root_kind_local: Literal["object", "array", "fragment"],
    ) -> None:
        nonlocal open_stack, after_dot
        for i, el in enumerate(arr):
            el_segs = [*arr_segs, i]
            el_path = format_json_path(el_segs)
            open_stack.append(i)
            if el is None:
                if opt["null_policy"] == "error":
                    raise XaiopEncodeError("null array element not allowed", path=el_path)
                lines.append(_format_scalar_element(None, el_path))
                open_stack.pop()
                maybe_cut(el_segs)
                continue
            if isinstance(el, list):
                lines.append("-")
                emit_array_path_nested(el, el_segs, root_kind_local)
                if not after_dot:
                    lines.append("<")
                if not after_dot and open_stack and open_stack[-1] == i:
                    open_stack.pop()
                maybe_cut(el_segs)
                continue
            if _is_plain_object(el):
                lines.append(">")
                for k in _ordered_keys(el, opt["key_order"]):
                    emit_object_path(k, el[k], [*el_segs, k], root_kind_local)
                if not after_dot:
                    lines.append("<")
                if not after_dot and open_stack and open_stack[-1] == i:
                    open_stack.pop()
                maybe_cut(el_segs)
                continue
            lines.append(_format_scalar_element(el, el_path))
            open_stack.pop()
            maybe_cut(el_segs)

    if root_kind == "array":
        if not isinstance(value, list):
            raise XaiopEncodeError("root:'array' requires an array value")
        emit_array_path(value, [], "array")
    else:
        if not _is_plain_object(value):
            raise XaiopEncodeError(
                "object document root requires a plain object (or use an array root)",
                path="$",
            )
        keys = _ordered_keys(value, opt["key_order"])
        if not keys:
            lines.append(">")
            return lines
        for key in keys:
            emit_object_path(key, value[key], [key], "object")

    if cut_set:
        left = ", ".join(sorted(cut_set))
        raise XaiopEncodeError(f"dotPolicy paths not reached during encode: {left}")
    return lines


def _assert_path_exists(
    root: Any,
    root_kind: Literal["object", "array", "fragment"],
    segs: list[str | int],
    path_str: str,
) -> None:
    cur: Any = root
    for seg in segs:
        if isinstance(seg, int):
            if not isinstance(cur, list):
                raise XaiopEncodeError(
                    f"dotPolicy path not found (not an array): {path_str!r}",
                    path=path_str,
                )
            if seg < 0 or seg >= len(cur):
                raise XaiopEncodeError(
                    f"dotPolicy path not found: {path_str!r}", path=path_str
                )
            cur = cur[seg]
        else:
            if not _is_plain_object(cur):
                raise XaiopEncodeError(
                    f"dotPolicy path not found: {path_str!r}", path=path_str
                )
            if seg not in cur:
                raise XaiopEncodeError(
                    f"dotPolicy path not found: {path_str!r}", path=path_str
                )
            cur = cur[seg]
    _ = root_kind
