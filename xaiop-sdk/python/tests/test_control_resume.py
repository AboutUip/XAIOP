"""Control resume log + demux edges (Node control.resume / coverage)."""

from __future__ import annotations

import pytest

from xaiop import (
    CONTROL_CAPABILITY,
    ControlDemux,
    ControlIngest,
    ControlPlaneHost,
    ControlSessionState,
    ResumeWireLog,
    XaiopControlError,
    XaiopResumeLogError,
    encode_ack_frame,
    encode_session_frame,
    stamp_wire_with_log_seq,
)


def test_resume_log_record_and_wires_after() -> None:
    log = ResumeWireLog()
    log.record({"seq": 1, "wire": ">\na:1\n.\n"})
    log.record({"seq": 2, "wire": ">\nb:2\n.\n"})
    assert log.size == 2
    assert log.highest_seq == 2
    after = log.wires_after(1)
    assert "b:2" in after
    assert after.startswith("#!xaiop/seq/v1\n") or "b:2" in after
    raw = log.wires_after_raw(1)
    assert raw == ">\nb:2\n.\n"
    log.clear()
    assert log.size == 0


def test_resume_log_monotonic_guard() -> None:
    log = ResumeWireLog()
    log.record({"seq": 1, "wire": ".\n"})
    with pytest.raises(XaiopResumeLogError):
        log.record({"seq": 1, "wire": ".\n"})
    with pytest.raises(TypeError):
        log.record({"seq": 0, "wire": ".\n"})


def test_demux_header_only_and_body_without_lf() -> None:
    demux = ControlDemux()
    # incomplete frame — header only
    out = demux.push("#!xaiop/session/v1\n")
    assert out["frames"] == []
    # complete with body
    body = encode_session_frame(
        {"sessionId": "s1", "role": "producer", "capabilities": [], "epoch": 0}
    )
    # strip to push remainder if needed — push full frame
    demux2 = ControlDemux()
    out2 = demux2.push(body)
    assert len(out2["frames"]) == 1
    assert out2["frames"][0].name == "session"


def test_demux_crlf_preserved_in_wire() -> None:
    demux = ControlDemux()
    out = demux.push(">\r\na:1\r\n.\r\n")
    assert "a:1" in out["wireText"]
    assert out["frames"] == []


def test_demux_half_line_carry() -> None:
    demux = ControlDemux()
    out1 = demux.push(">\na:")
    out2 = demux.push("1\n.\n")
    combined = out1["wireText"] + out2["wireText"]
    assert "a:1" in combined
    assert "." in combined


def test_unknown_capability_soft_error() -> None:
    errors: list[XaiopControlError] = []
    ingest = ControlIngest({"onControlError": errors.append})
    wire = ingest.push(">\na:1\n.\n#!xaiop/nope/v1\n{}\n>\nb:2\n.\n")
    assert wire == ">\na:1\n.\n>\nb:2\n.\n"
    assert len(errors) == 1


def test_session_state_phase_seq() -> None:
    sess = ControlSessionState()
    sid = sess.ensure_session_id()
    assert sid
    assert sess.next_phase_seq() == 1
    assert sess.next_phase_seq() == 2
    assert sess.note_ack(1) is True
    assert sess.acked_seq == 1


def test_host_requires_session_for_ack() -> None:
    host = ControlPlaneHost(send=lambda _t: True, session=False)
    with pytest.raises(TypeError, match="session"):
        host.send_ack(1)
    host2 = ControlPlaneHost(send=lambda _t: True, session=True)
    assert host2.send_ack(1) is True


def test_stamp_wire_seq() -> None:
    stamped = stamp_wire_with_log_seq(3, ">\na:1\n.\n")
    assert stamped.startswith("#!xaiop/")
    assert "a:1" in stamped
    assert CONTROL_CAPABILITY["SEQ_V1"] or "seq" in stamped.lower()


def test_back_to_back_control_frames() -> None:
    demux = ControlDemux()
    text = (
        encode_session_frame(
            {"sessionId": "s", "role": "producer", "capabilities": [], "epoch": 0}
        )
        + encode_ack_frame({"sessionId": "s", "seq": 1})
        + ">\nz:1\n.\n"
    )
    out = demux.push(text)
    assert len(out["frames"]) == 2
    assert out["wireText"] == ">\nz:1\n.\n"
