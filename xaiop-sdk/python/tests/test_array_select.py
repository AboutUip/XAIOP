import pytest

from xaiop import DotCheckpointEngine, LiveParser, XaiopSyntaxError, parse_sync


def wire(*lines: str) -> str:
    return "\n".join(lines)


def test_index_then_write() -> None:
    assert parse_sync(
        wire(">", ">orders-", "id:A1", "id:A2", ".", "@orders", "?1", "status:shipped")
    ) == {"orders": [{"id": "A1"}, {"id": "A2", "status": "shipped"}]}


def test_predicate_first_match() -> None:
    assert parse_sync(
        wire(">", ">orders-", "id:A1", "id:A2", ".", "@orders", "?id:A2", "status:shipped")
    ) == {"orders": [{"id": "A1"}, {"id": "A2", "status": "shipped"}]}


def test_star_predicate() -> None:
    assert parse_sync(
        wire(
            ">",
            ">orders-",
            ">",
            "id:A1",
            "status:pending",
            "<",
            ">",
            "id:A2",
            "status:pending",
            "<",
            ">",
            "id:A3",
            "status:done",
            ".",
            "@orders",
            "?*status:pending",
            "checked:true",
        )
    ) == {
        "orders": [
            {"id": "A1", "status": "pending", "checked": True},
            {"id": "A2", "status": "pending", "checked": True},
            {"id": "A3", "status": "done"},
        ]
    }


def test_bare_amp_after_enter() -> None:
    assert parse_sync(wire(">", ">items-", ">", "id:keep", "<", ">", "id:drop", "&")) == {
        "items": [{"id": "keep"}]
    }


def test_bare_amp_after_predicate() -> None:
    assert parse_sync(
        wire(">", ">orders-", "id:A1", "id:A2", "id:A3", ".", "@orders", "?id:A2", "&")
    ) == {"orders": [{"id": "A1"}, {"id": "A3"}]}


def test_star_then_amp_clears() -> None:
    assert parse_sync(wire(">", ">orders-", "id:A1", "id:A2", ".", "@orders", "?*", "&")) == {
        "orders": []
    }


def test_scalar_index_delete() -> None:
    assert parse_sync(wire(">", ">n-", ":a", ":b", ":c", ".", "@n", "?1", "&")) == {"n": ["a", "c"]}


def test_nested_array_append() -> None:
    assert parse_sync(wire(">", ">wrap-", "-", ":a", ":b", ".", "@wrap", "?0", ":c")) == {
        "wrap": [["a", "b", "c"]]
    }


def test_numeric_bool_forced_escape() -> None:
    assert parse_sync(wire(">", ">rows-", "n:1", "n:2", ".", "@rows", "?n:1", "hit:true")) == {
        "rows": [{"n": 1, "hit": True}, {"n": 2}]
    }
    assert parse_sync(
        wire(">", ">rows-", "ok:true", "ok:false", ".", "@rows", "?ok:true", "x:1")
    ) == {"rows": [{"ok": True, "x": 1}, {"ok": False}]}
    assert parse_sync(
        wire(">", ">rows-", "id: 1", "id:2", ".", "@rows", "?id: 1", "hit:true")
    ) == {"rows": [{"id": "1", "hit": True}, {"id": 2}]}
    assert parse_sync(
        wire(">", ">rows-", "t:a\\nb", "t:plain", ".", "@rows", "?t:a\\nb", "hit:true")
    ) == {"rows": [{"t": "a\nb", "hit": True}, {"t": "plain"}]}


def test_root_array() -> None:
    assert parse_sync(wire("-", "id:A", "id:B", "?1", "x:1")) == [
        {"id": "A"},
        {"id": "B", "x": 1},
    ]


def test_live() -> None:
    live = LiveParser()
    live.feed_text(">\n>orders-\nid:A1\nid:A2\n.\n")
    live.feed_text("@orders\n?id:A2\nstatus:ok\n")
    assert live.value() == {"orders": [{"id": "A1"}, {"id": "A2", "status": "ok"}]}


def test_at_slot_is_key() -> None:
    assert parse_sync(wire(">", ">orders-", "id:A1", ".", "@orders>0", "x:1")) == {
        "orders": {"0": {"x": 1}}
    }


def test_amp_path_noop_index() -> None:
    assert parse_sync(wire(">", ">orders-", "id:A1", "id:A2", ".", "&orders>0")) == {
        "orders": [{"id": "A1"}, {"id": "A2"}]
    }


def test_star_amp_path() -> None:
    assert parse_sync(
        wire(
            ">",
            ">orders-",
            ">",
            "id:A1",
            "status:pending",
            "<",
            ">",
            "id:A2",
            "status:pending",
            ".",
            "@orders",
            "?*",
            "&status",
        )
    ) == {"orders": [{"id": "A1"}, {"id": "A2"}]}


def test_eq_then_q() -> None:
    assert parse_sync(
        wire(">", ">orders-", "id:A1", "id:A2", ".", "=orders", "?1", "status:ok")
    ) == {"orders": [{"id": "A1"}, {"id": "A2", "status": "ok"}]}


def test_stream_reenter_then_select() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda d, _m=None: None}
    )
    eng.push(">\n>orders-\nid:A1\nid:A2\n.\n")
    eng.push(">orders-\n?1\nstatus:ok\n.\n")
    eng.finish()
    assert eng.snapshot == {
        "orders": [{"id": "A1"}, {"id": "A2", "status": "ok"}]
    }


@pytest.mark.parametrize(
    "src",
    [
        wire(">", "?0"),
        wire(">", ">a", "x:1", "?0"),
        wire(">", ">n-", ":a", ".", "@n", "?"),
        wire(">", ">n-", ":a", ".", "@n", "?9"),
        wire(">", ">n-", "id:A", ".", "@n", "?id:Z"),
        wire(">", ">n-", ".", "@n", "?*"),
        wire(">", ">n-", ":a", ".", "@n", "?01"),
        wire(">", ">n-", ":a", ".", "@n", "?00"),
        wire(">", ">n-", ":a", ".", "@n", "?-1"),
        wire(">", ">n-", ":a", ".", "@n", "?*2"),
        wire(">", ">n-", ":a", ".", "@n", "?:x"),
        wire(">", ">n-", ":a", ".", "@n", "?0", "k:v"),
        wire(">", ">a", "x:1", ".", "!a", "?0"),
        wire(">", "&"),
        wire(">", ">n-", ":a", ".", "@n", "&"),
        wire(">", ">n-", ":a", ":b", ".", "@n", "?*", "?0"),
        wire(">", ">n-", ":a", ":b", ".", "@n", "?0", "?0"),
        wire(">", ">n-", ":a", ":b", ".", "@n", "?id:A"),
        wire(">", ">rows-", "ok:1", ".", "@rows", "?ok:true"),
        wire(">", ">n-", ":a", ":b", ".", "@n", "? 1"),
        wire(">", ">n-", ":a", ".", "@n", "?+1"),
        wire(">", ">n-", ":a", ":b", ".", "@n", "?1.5"),
    ],
)
def test_select_errors(src: str) -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(src)
