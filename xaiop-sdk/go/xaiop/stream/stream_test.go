package stream

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
)

func TestXaiopStreamRAWFixture(t *testing.T) {
	root := filepath.Join("..", "..", "..", "conformance", "fixtures")
	wireBytes, err := os.ReadFile(filepath.Join(root, "overwrite-id.xaiop"))
	if err != nil {
		t.Skip(err)
	}
	mergeFalse := false
	var diffs []any
	s, err := NewXaiopStream("raw://local", Options{
		MergeChunkWindow: &mergeFalse,
		OnChunk: func(d any, _ map[string]any) {
			diffs = append(diffs, d)
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Push(string(wireBytes)); err != nil {
		t.Fatal(err)
	}
	if err := s.Finish(); err != nil {
		t.Fatal(err)
	}
	if s.Snapshot() == nil {
		t.Fatal("expected snapshot")
	}
	if len(diffs) == 0 {
		t.Fatal("expected diffs")
	}
	want, err := xaiop.Parse(string(wireBytes))
	if err != nil {
		t.Fatal(err)
	}
	want = xaiop.Materialize(want)
	if !reflect.DeepEqual(s.Snapshot(), want) {
		t.Fatalf("snapshot mismatch\ngot %#v\nwant %#v", s.Snapshot(), want)
	}
	if s.Status() != StatusCompleted {
		t.Fatalf("status=%s", s.Status())
	}
}

func TestXaiopStreamChunksMergeOff(t *testing.T) {
	mergeFalse := false
	s, err := NewXaiopStream("raw://chunks", Options{
		MergeChunkWindow: &mergeFalse,
		Modes:            []string{xaiop.StreamModeAsyncIterator, xaiop.StreamModeCallback},
	})
	if err != nil {
		t.Fatal(err)
	}
	ch := s.Chunks()
	wire := ">\na:1\n.\n>\nb:2\n.\n"
	if err := s.Push(wire); err != nil {
		t.Fatal(err)
	}
	if err := s.Finish(); err != nil {
		t.Fatal(err)
	}
	var got []any
	for d := range ch {
		got = append(got, d)
	}
	if len(got) != 2 {
		t.Fatalf("want 2 diffs, got %#v", got)
	}
	if !reflect.DeepEqual(got[0], map[string]any{"a": int64(1)}) {
		t.Fatalf("diff0=%#v", got[0])
	}
	if !reflect.DeepEqual(got[1], map[string]any{"b": int64(2)}) {
		t.Fatalf("diff1=%#v", got[1])
	}
}
