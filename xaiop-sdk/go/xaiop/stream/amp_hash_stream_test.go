package stream_test

import (
	"reflect"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/stream"
)

func TestAmpStreamCoverTombstone(t *testing.T) {
	text := ">\n>a\nx:1\n.\n>b\ny:1\n&a\nz:2\n.\n"
	var chunks []any
	mergeFalse := false
	eng := stream.NewDotCheckpointEngine(stream.Hooks{
		MergeChunkWindow: &mergeFalse,
		Cover:            true,
		OnChunk:          func(d any, _ map[string]any) { chunks = append(chunks, d) },
	})
	_ = eng.Push(text)
	eng.Finish()
	want, err := xaiop.Parse(text)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(eng.Snapshot(), xaiop.Materialize(want)) {
		t.Fatalf("snapshot %#v", eng.Snapshot())
	}
	found := false
	for _, c := range chunks {
		m, ok := c.(map[string]any)
		if ok && m["a"] == nil {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected tombstone chunk with a:null, got %#v", chunks)
	}
}

func TestAmpStreamNonCoverPriorDiff(t *testing.T) {
	mergeFalse := false
	var chunks []any
	eng := stream.NewDotCheckpointEngine(stream.Hooks{
		MergeChunkWindow: &mergeFalse,
		Cover:            false,
		OnChunk:          func(d any, _ map[string]any) { chunks = append(chunks, d) },
	})
	_ = eng.Push(">\n>a\nx:1\n.\n")
	first := chunks[0]
	_ = eng.Push(">\n>b\ny:2\n&a\n.\n")
	eng.Finish()
	if !reflect.DeepEqual(chunks[0], first) {
		t.Fatalf("prior diff mutated: %#v", chunks)
	}
	if !reflect.DeepEqual(first, map[string]any{"a": map[string]any{"x": int64(1)}}) {
		t.Fatalf("first %#v", first)
	}
	if !reflect.DeepEqual(eng.Snapshot(), map[string]any{"b": map[string]any{"y": int64(2)}}) {
		t.Fatalf("snapshot %#v", eng.Snapshot())
	}
}

func TestHashStreamIgnoredWithoutSpan(t *testing.T) {
	mergeFalse := false
	eng := stream.NewDotCheckpointEngine(stream.Hooks{
		MergeChunkWindow: &mergeFalse,
		OnChunk:          func(any, map[string]any) {},
	})
	_ = eng.Push(">\n# ignored\na:1\n.\n")
	eng.Finish()
	if !reflect.DeepEqual(eng.Snapshot(), map[string]any{"a": int64(1)}) {
		t.Fatalf("snapshot %#v", eng.Snapshot())
	}
}
