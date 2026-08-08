package control_test

import (
	"strings"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/control"
)

func TestIsSdkControlLineMatrix(t *testing.T) {
	if !control.IsSDKControlLine("#!xaiop/types/v1") {
		t.Fatal("types")
	}
	if !control.IsSDKControlLine("#!xaiop/session/v1") {
		t.Fatal("session")
	}
	for _, line := range []string{"# note", "# !note", "#", ""} {
		if control.IsSDKControlLine(line) {
			t.Fatalf("%q should not be control", line)
		}
	}
}

func TestDemuxCharByCharWithAck(t *testing.T) {
	ack, err := control.EncodeAckFrame(map[string]any{"sessionId": "s1", "seq": 1})
	if err != nil {
		t.Fatal(err)
	}
	text := ">\na:1\n.\n" + ack + ">\nb:2\n.\n"
	d := control.NewControlDemux()
	var wire strings.Builder
	var frames []*control.Frame
	for _, ch := range text {
		out := d.Push(string(ch), false)
		wire.WriteString(out.WireText)
		frames = append(frames, out.Frames...)
	}
	tail := d.Flush()
	wire.WriteString(tail.WireText)
	frames = append(frames, tail.Frames...)
	if wire.String() != ">\na:1\n.\n>\nb:2\n.\n" {
		t.Fatalf("wire=%q", wire.String())
	}
	found := false
	for _, f := range frames {
		if f.Name == control.NameAck {
			found = true
			body, err := control.ParseControlBodyJSON(f)
			if err != nil {
				t.Fatal(err)
			}
			m := body.(map[string]any)
			if int(m["seq"].(float64)) != 1 {
				t.Fatalf("seq=%v", m["seq"])
			}
		}
	}
	if !found {
		t.Fatal("missing ack frame")
	}
}

func TestDemuxBackToBackControls(t *testing.T) {
	session, _ := control.EncodeSessionFrame(map[string]any{
		"sessionId": "s", "role": "producer", "capabilities": []any{}, "epoch": 0,
	})
	ack, _ := control.EncodeAckFrame(map[string]any{"sessionId": "s", "seq": 1})
	resume, _ := control.EncodeResumeFrame(map[string]any{"sessionId": "s", "fromSeq": 0})
	snap, _ := control.EncodeSnapshotFrame(map[string]any{"json": map[string]any{"a": 1}})
	text := session + ack + resume + snap + ">\nz:1\n.\n"
	d := control.NewControlDemux()
	out := d.Push(text, true)
	if len(out.Frames) < 3 {
		t.Fatalf("frames=%d", len(out.Frames))
	}
	if out.WireText != ">\nz:1\n.\n" {
		t.Fatalf("wire=%q", out.WireText)
	}
}

func TestIngestBackToBackNames(t *testing.T) {
	var names []string
	ing := control.NewControlIngest(&control.Handlers{
		OnSession:  func(any, *control.Frame) { names = append(names, "session") },
		OnAck:      func(any, *control.Frame) { names = append(names, "ack") },
		OnResume:   func(any, *control.Frame) { names = append(names, "resume") },
		OnSnapshot: func(any, *control.Frame) { names = append(names, "snapshot") },
	})
	session, _ := control.EncodeSessionFrame(map[string]any{"sessionId": "s", "role": "duplex"})
	ack, _ := control.EncodeAckFrame(map[string]any{"sessionId": "s", "seq": 0})
	resume, _ := control.EncodeResumeFrame(map[string]any{"sessionId": "s", "fromSeq": 0})
	snap, _ := control.EncodeSnapshotFrame(map[string]any{"sessionId": "s", "seq": 0, "tree": nil})
	wire := ing.Push(session + ack + resume + snap)
	_ = ing.Flush()
	if wire != "" {
		t.Fatalf("expected empty wire, got %q", wire)
	}
	want := []string{"session", "ack", "resume", "snapshot"}
	if len(names) != 4 {
		t.Fatalf("names=%v", names)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("names=%v", names)
		}
	}
}
