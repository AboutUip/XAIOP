from xaiop import parse_sync


def wire(*lines: str) -> str:
    return "\n".join(lines)


def test_root_array() -> None:
    assert parse_sync(wire("-", ":1", ":2")) == [1, 2]


def test_named_array() -> None:
    doc = parse_sync(wire(">", ">items-", ":alpha", ":beta", "<"))
    assert doc == {"items": ["alpha", "beta"]}


def test_nested_array_elements() -> None:
    doc = parse_sync(
        wire(
            ">",
            ">payload",
            ">items-",
            ">",
            "title:first",
            "<",
            ">",
            "title:second",
            "<",
            ":plain",
            "-",
            ":x",
            ":y",
            "<",
        )
    )
    assert doc == {
        "payload": {
            "items": [
                {"title": "first"},
                {"title": "second"},
                "plain",
                ["x", "y"],
            ]
        }
    }


def test_array_of_objects_via_gt() -> None:
    doc = parse_sync(
        wire(
            ">",
            ">users-",
            ">",
            "id:1",
            "name:alice",
            "<",
            ">",
            "id:2",
            "name:bob",
            "<",
        )
    )
    assert doc == {
        "users": [
            {"id": 1, "name": "alice"},
            {"id": 2, "name": "bob"},
        ]
    }


def test_inline_path_composition() -> None:
    doc = parse_sync(wire(">", ">a>b", "x:1"))
    assert doc == {"a": {"b": {"x": 1}}}
