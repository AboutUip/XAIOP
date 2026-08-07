from xaiop import (
    CONTROL_CAPABILITY,
    ControlDemux,
    ControlIngest,
    ControlSessionState,
    TypeRegistry,
    TYPE,
    XaiopControlError,
    encode_ack_frame,
    encode_session_frame,
    encode_type_schema_frame,
    is_sdk_control_line,
    parse_control_header,
    stamp_wire_with_log_seq,
)


def test_control_header() -> None:
    assert is_sdk_control_line("#!xaiop/types/v1") is True
    assert is_sdk_control_line("# note") is False
    h = parse_control_header("#!xaiop/session/v1")
    assert h is not None
    assert h["id"] == CONTROL_CAPABILITY["SESSION_V1"]


def test_demux_interleave() -> None:
    demux = ControlDemux()
    text = (
        ">\na:1\n.\n"
        + encode_session_frame(
            {"sessionId": "s1", "role": "producer", "capabilities": [], "epoch": 0}
        )
        + ">\nb:2\n.\n"
        + encode_ack_frame({"sessionId": "s1", "seq": 1})
    )
    out = demux.push(text)
    assert len(out["frames"]) == 2
    assert out["frames"][0].name == "session"
    assert out["frames"][1].name == "ack"
    assert out["wireText"] == ">\na:1\n.\n>\nb:2\n.\n"
    assert out["errors"] == []


def test_ingest_unknown_capability() -> None:
    errors: list[XaiopControlError] = []
    ingest = ControlIngest({"onControlError": errors.append})
    wire = ingest.push(">\na:1\n.\n#!xaiop/nope/v1\n{}\n>\nb:2\n.\n")
    assert wire == ">\na:1\n.\n>\nb:2\n.\n"
    assert len(errors) == 1
    assert errors[0].code == "CONTROL_UNKNOWN_CAPABILITY"


def test_types_frame_via_demux() -> None:
    reg = TypeRegistry()
    reg.register("a", TYPE.INT)
    frame = encode_type_schema_frame(reg.snapshot())
    demux = ControlDemux()
    out = demux.push(frame)
    assert out["wireText"] == ""
    assert out["frames"][0].id == CONTROL_CAPABILITY["TYPES_V1"]


def test_session_state_and_stamp() -> None:
    sess = ControlSessionState()
    sid = sess.ensure_session_id()
    assert isinstance(sid, str)
    assert sess.next_phase_seq() == 1
    assert sess.note_ack(1) is True
    wire = stamp_wire_with_log_seq(1, ">\na:1\n.\n")
    assert wire.startswith("#!xaiop/seq/v1\n")
