package stream_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/stream"
)

func TestLineInterceptRewrites(t *testing.T) {
	var diffs []any
	engine := stream.NewDotCheckpointEngine(stream.Hooks{
		MergeChunkWindow: boolPtr(false),
		LineIntercept: []xaiop.LineInterceptor{
			func(line string, _ map[string]any) (string, bool) {
				if line == "a:1" {
					return "a:99", true
				}
				return line, true
			},
		},
		OnChunk: func(diff any, _ map[string]any) {
			diffs = append(diffs, diff)
		},
	})
	_ = engine.Push(">\na:1\n.\n")
	engine.Finish()
	if len(diffs) != 1 {
		t.Fatalf("diffs=%#v", diffs)
	}
	want := map[string]any{"a": int64(99)}
	if !reflect.DeepEqual(diffs[0], want) {
		t.Fatalf("got %#v want %#v", diffs[0], want)
	}
}

func TestLineInterceptDrop(t *testing.T) {
	var diffs []any
	engine := stream.NewDotCheckpointEngine(stream.Hooks{
		MergeChunkWindow: boolPtr(false),
		LineIntercept: []xaiop.LineInterceptor{
			func(line string, _ map[string]any) (string, bool) {
				if line == "skip:1" {
					return "", false
				}
				return line, true
			},
		},
		OnChunk: func(diff any, _ map[string]any) {
			diffs = append(diffs, diff)
		},
	})
	_ = engine.Push(">\nkeep:2\nskip:1\n.\n")
	engine.Finish()
	if !reflect.DeepEqual(diffs[0], map[string]any{"keep": int64(2)}) {
		t.Fatalf("got %#v", diffs[0])
	}
}

func TestAnnotationSpanKeepSentinel(t *testing.T) {
	lines := []string{">", "#note", "a:1", "."}
	called := false
	result := stream.ApplyAnnotationSpans(lines, []xaiop.AnnotationSpanHandler{
		func(line string, meta map[string]any) (any, bool) {
			called = true
			if !strings.HasPrefix(line, "#") {
				t.Fatalf("line=%q", line)
			}
			return xaiop.AnnotationSpanKeep, true
		},
	})
	if !called {
		t.Fatal("handler not called")
	}
	if !reflect.DeepEqual(result.Lines, lines) {
		t.Fatalf("keep should preserve lines: %#v", result.Lines)
	}
}

func TestAnnotationSpanDrop(t *testing.T) {
	lines := []string{">", "#drop", "a:1", "b:2", "."}
	result := stream.ApplyAnnotationSpans(lines, []xaiop.AnnotationSpanHandler{
		func(line string, meta map[string]any) (any, bool) {
			return nil, true // drop
		},
	})
	want := []string{">", "."}
	if !reflect.DeepEqual(result.Lines, want) {
		t.Fatalf("got %#v want %#v", result.Lines, want)
	}
}

func TestXaiopStreamRAWPushFinish(t *testing.T) {
	mergeFalse := false
	var chunks []any
	var done any
	s, err := stream.NewXaiopStream("raw://fixture", stream.Options{
		MergeChunkWindow: &mergeFalse,
		Modes:            []string{xaiop.StreamModeCallback, xaiop.StreamModeAsyncIterator},
		OnChunk: func(diff any, _ map[string]any) {
			chunks = append(chunks, diff)
		},
		OnDone: func(snap any) { done = snap },
	})
	if err != nil {
		t.Fatal(err)
	}
	wire := ">\na:1\n.\n>\nb:2\n.\n"
	if err := s.Push(wire); err != nil {
		t.Fatal(err)
	}
	if err := s.Finish(); err != nil {
		t.Fatal(err)
	}
	if len(chunks) != 2 {
		t.Fatalf("chunks=%#v", chunks)
	}
	want := mustParseMaterialize(t, wire)
	if !reflect.DeepEqual(done, want) {
		t.Fatalf("done %#v want %#v", done, want)
	}
	if s.Status() != stream.StatusCompleted {
		t.Fatalf("status=%s", s.Status())
	}
}

func TestXaiopStreamSendRawChunks(t *testing.T) {
	mergeFalse := false
	s, err := stream.NewXaiopStream("raw://r", stream.Options{
		MergeChunkWindow: &mergeFalse,
		Modes:            []string{xaiop.StreamModeAsyncIterator},
	})
	if err != nil {
		t.Fatal(err)
	}
	ch := s.Chunks()
	done := make(chan error, 1)
	go func() {
		done <- s.SendRaw(strings.NewReader(">\nx:3\n.\n"))
	}()
	var got []any
	for c := range ch {
		got = append(got, c)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("got=%#v", got)
	}
	if !reflect.DeepEqual(got[0], map[string]any{"x": int64(3)}) {
		t.Fatalf("chunk=%#v", got[0])
	}
}
