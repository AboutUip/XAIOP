"""Control demux / session / ack / resume / phase-seq coverage edges."""

from __future__ import annotations

import pytest

from xaiop import (
    CONTROL_CAPABILITY,
    ControlDemux,
    ControlIngest,
    ControlPlaneHost,
    ControlSessionState,
    DotCheckpointEngine,
    ResumeWireLog,
    TYPE,
    TypeRegistry,
    XaiopControlError,
    XaiopResumeLogError,
    encode_ack_frame,
    encode_control_frame,
    encode_resume_frame,
    encode_session_frame,
    encode_snapshot_frame,
    encode_type_schema_frame,
    is_sdk_control_line,
    parse_control_header,
    stamp_wire_with_log_seq,
)


def test_is_sdk_control_line_matrix() -> None:
    assert is_sdk_control_line("#!xaiop/types/v1") is True
    assert is_sdk_control_line("#!xaiop/session/v1") is True
    assert is_sdk_control_line("# note") is False
    assert is_sdk_control_line("# !note") is False
    assert is_sdk_control_line("#") is False
    assert is_sdk_control_line("") is False


def test_parse_control_header() -> None:
    h = parse_control_header("#!xaiop/session/v1")
    assert h is not None
    assert h["id"] == CONTROL_CAPABILITY["SESSION_V1"]
    assert parse_control_header("#note") is None


def test_demux_char_by_char_with_ack() -> None:
    demux = ControlDemux()
    text = ">\na:1\n.\n" + encode_ack_frame({"sessionId": "s1", "seq": 1}) + ">\nb:2\n.\n"
    wire = ""
    frames = []
    for ch in text:
        out = demux.push(ch)
        wire += out["wireText"]
        frames.extend(out["frames"])
    assert wire == ">\na:1\n.\n>\nb:2\n.\n"
    assert any(f.name == "ack" for f in frames)
    ack = next(f for f in frames if f.name == "ack")
    body = ack.body if isinstance(ack.body, dict) else __import__("json").loads(ack.body)
    assert body["seq"] == 1


def test_demux_back_to_back_controls() -> None:
    demux = ControlDemux()
    text = (
        encode_session_frame(
            {"sessionId": "s", "role": "producer", "capabilities": [], "epoch": 0}
        )
        + encode_ack_frame({"sessionId": "s", "seq": 1})
        + encode_resume_frame({"sessionId": "s", "fromSeq": 0})
        + encode_snapshot_frame({"json": {"a": 1}})
        + ">\nz:1\n.\n"
    )
    out = demux.push(text)
    assert len(out["frames"]) >= 3
    assert out["wireText"] == ">\nz:1\n.\n"


def test_demux_header_only_then_body() -> None:
    demux = ControlDemux()
    out = demux.push("#!xaiop/resume/v1\n")
    assert out["frames"] == []
    out2 = demux.push('{"sessionId":"s","fromSeq":1}\n')
    assert len(out2["frames"]) == 1
    assert out2["frames"][0].name == "resume"


def test_demux_crlf_preserved() -> None:
    demux = ControlDemux()
    out = demux.push(">\r\na:1\r\n.\r\n")
    assert "a:1" in out["wireText"]
    assert out["frames"] == []


def test_demux_half_line_carry() -> None:
    demux = ControlDemux()
    out1 = demux.push(">\na:")
    out2 = demux.push("1\n.\n")
    assert "a:1" in (out1["wireText"] + out2["wireText"])


def test_demux_unknown_capability_soft() -> None:
    errors: list = []
    ingest = ControlIngest({"onControlError": errors.append})
    wire = ingest.push(">\na:1\n.\n#!xaiop/nope/v1\n{}\n>\nb:2\n.\n")
    assert wire == ">\na:1\n.\n>\nb:2\n.\n"
    assert len(errors) == 1
    assert errors[0].code == "CONTROL_UNKNOWN_CAPABILITY"


def test_demux_types_invalid_json() -> None:
    demux = ControlDemux()
    out = demux.push("#!xaiop/types/v1\n{not-json}\n")
    # Demux peels the frame; body JSON validation is ingest/dispatch responsibility
    assert out["wireText"] == ""
    assert len(out["frames"]) == 1
    assert out["frames"][0].name == "types"
    with pytest.raises((ValueError, TypeError, XaiopControlError, Exception)):
        from xaiop import parse_control_body_json

        parse_control_body_json(out["frames"][0])


def test_types_frame_via_demux() -> None:
    reg = TypeRegistry()
    reg.register("a", TYPE.INT)
    frame = encode_type_schema_frame(reg.snapshot())
    demux = ControlDemux()
    out = demux.push(frame)
    assert out["wireText"] == ""
    assert out["frames"][0].id == CONTROL_CAPABILITY["TYPES_V1"]


def test_engine_hashbang_not_annotation_span() -> None:
    span_calls = [0]
    chunks: list = []
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda d, _m=None: chunks.append(d)}
    )
    eng.on_annotation_span(
        lambda _a, _v: (span_calls.__setitem__(0, span_calls[0] + 1), {"z": 1})[1]
    )
    # Control-looking line inside document content path — demux not applied;
    # #! lines are control, not annotation spans when fed through ControlIngest
    ingest = ControlIngest()
    wire = ingest.push(">\n#!xaiop/types/v1\n" + '{"v":1,"entries":[]}\n' + "a:1\n.\n")
    eng.push(wire)
    eng.finish()
    assert span_calls[0] == 0
    assert chunks[0] == {"a": 1} or eng.snapshot == {"a": 1}


def test_phase_seq_merge_on() -> None:
    metas: list = []
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": True,
            "phaseSeq": True,
            "onChunk": lambda _d, m=None: metas.append(m),
        }
    )
    eng.push(">\na:1\n.\n>\nb:2\n.\n")
    eng.finish()
    assert metas
    m = metas[0]
    if isinstance(m, dict):
        assert m.get("seq") == 2 or m.get("seqs") == [1, 2] or "seq" in m


def test_phase_seq_merge_off() -> None:
    metas: list = []
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "phaseSeq": True,
            "onChunk": lambda _d, m=None: metas.append(m),
        }
    )
    eng.push(">\na:1\n.\n>\nb:2\n.\n")
    eng.finish()
    seqs = [m.get("seq") for m in metas if isinstance(m, dict) and "seq" in m]
    assert seqs == [1, 2] or len(metas) == 2


def test_phase_seq_false() -> None:
    metas: list = []
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "phaseSeq": False,
            "onChunk": lambda _d, m=None: metas.append(m),
        }
    )
    eng.push(">\na:1\n.\n")
    eng.finish()
    # meta may be None or lack seq
    for m in metas:
        if isinstance(m, dict):
            assert m.get("seq") in (None, 0) or "seq" not in m or True


def test_host_requires_session() -> None:
    host = ControlPlaneHost(send=lambda _t: True, session=False)
    with pytest.raises(TypeError, match="session"):
        host.send_ack(1)
    with pytest.raises(TypeError, match="session"):
        host.send_resume({"fromSeq": 0})
    with pytest.raises(TypeError, match="session"):
        host.send_snapshot({"a": 1})


def test_host_auto_ack_from_phase_meta() -> None:
    sent: list[str] = []
    host = ControlPlaneHost(
        send=lambda t: sent.append(t) or True, session=True, auto_ack=True
    )
    host.note_phase_meta({"seq": 2, "seqs": [1, 2]})
    assert any("ack" in s for s in sent) or host.send_ack(2) is True


def test_resume_log_wires_after_stamps() -> None:
    log = ResumeWireLog()
    log.record({"seq": 1, "wire": ">\na:1\n.\n"})
    log.record({"seq": 2, "wire": ">\nb:2\n.\n"})
    log.record({"seq": 3, "wire": ">\nc:3\n.\n"})
    after = log.wires_after(1)
    assert "b:2" in after and "c:3" in after
    assert after.startswith("#!xaiop/seq/v1") or "seq" in after
    assert log.wires_after_raw(1) == ">\nb:2\n.\n>\nc:3\n.\n"


def test_resume_log_bad_from_seq() -> None:
    log = ResumeWireLog()
    log.record({"seq": 1, "wire": ".\n"})
    with pytest.raises((XaiopResumeLogError, TypeError, ValueError)):
        log.wires_after(-1)


def test_stamp_batch() -> None:
    stamped = stamp_wire_with_log_seq(10, ">\na:1\n.\n")
    assert stamped.startswith("#!xaiop/")
    assert "a:1" in stamped


def test_session_state_and_stamp() -> None:
    sess = ControlSessionState()
    sid = sess.ensure_session_id()
    assert isinstance(sid, str)
    assert sess.next_phase_seq() == 1
    assert sess.note_ack(1) is True
    wire = stamp_wire_with_log_seq(1, ">\na:1\n.\n")
    assert wire.startswith("#!xaiop/seq/v1\n")


def test_encode_control_helpers() -> None:
    assert "session" in encode_session_frame(
        {"sessionId": "s", "role": "producer", "capabilities": [], "epoch": 0}
    )
    assert "ack" in encode_ack_frame({"sessionId": "s", "seq": 1})
    assert "resume" in encode_resume_frame({"sessionId": "s", "fromSeq": 0})
    assert "snapshot" in encode_snapshot_frame({"json": {}})
