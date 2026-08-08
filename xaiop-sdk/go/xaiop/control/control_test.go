package control_test

import (
	"strings"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/control"
)

func TestDemuxSessionAndWire(t *testing.T) {
	frame, err := control.EncodeSessionFrame(map[string]any{"sessionId": "s1", "role": "duplex"})
	if err != nil {
		t.Fatal(err)
	}
	text := frame + ">\na:1\n.\n"
	d := control.NewControlDemux()
	res := d.Push(text, false)
	tail := d.Flush()
	wire := res.WireText + tail.WireText
	frames := append(res.Frames, tail.Frames...)
	if len(frames) != 1 {
		t.Fatalf("want 1 frame, got %d", len(frames))
	}
	if frames[0].Name != control.NameSession {
		t.Fatalf("name=%s", frames[0].Name)
	}
	if !strings.Contains(wire, "a:1") {
		t.Fatalf("wire missing document: %q", wire)
	}
	if strings.Contains(wire, "#!") {
		t.Fatalf("control leaked into wire: %q", wire)
	}
}

func TestDemuxSeq(t *testing.T) {
	frame, err := control.EncodeSeqFrame(3)
	if err != nil {
		t.Fatal(err)
	}
	d := control.NewControlDemux()
	res := d.Push(frame+"x:1\n.\n", true)
	if len(res.Frames) != 1 || res.Frames[0].Name != control.NameSeq {
		t.Fatalf("frames=%#v", res.Frames)
	}
	body, err := control.ParseControlBodyJSON(res.Frames[0])
	if err != nil {
		t.Fatal(err)
	}
	m := body.(map[string]any)
	if int(m["seq"].(float64)) != 3 {
		t.Fatalf("seq=%v", m["seq"])
	}
}

func TestResumeWireLog(t *testing.T) {
	log := control.NewResumeWireLog()
	if err := log.Record(control.ResumeEntry{Seq: 1, Wire: "a:1\n.\n"}); err != nil {
		t.Fatal(err)
	}
	if err := log.Record(control.ResumeEntry{Seq: 1, Wire: "b:2\n.\n"}); err == nil {
		t.Fatal("expected non-increasing seq error")
	}
	out, err := log.WiresAfter(0)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(out, "#!xaiop/seq/v1") {
		t.Fatalf("expected stamped wire, got %q", out)
	}
}

func TestControlIngestDispatch(t *testing.T) {
	var gotSeq int
	ing := control.NewControlIngest(&control.Handlers{
		OnSeq: func(body any, _ *control.Frame) {
			m := body.(map[string]any)
			gotSeq = int(m["seq"].(float64))
		},
	})
	frame, _ := control.EncodeSeqFrame(7)
	wire := ing.Push(frame + ">\nk:1\n.\n")
	_ = ing.Flush()
	if gotSeq != 7 {
		t.Fatalf("gotSeq=%d", gotSeq)
	}
	if strings.Contains(wire, "#!") {
		t.Fatalf("control in wire: %q", wire)
	}
}
