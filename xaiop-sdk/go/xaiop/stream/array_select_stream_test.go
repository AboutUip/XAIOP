package stream_test

import (
	"reflect"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/stream"
)

func TestArraySelectStreamReenterThenSelect(t *testing.T) {
	mergeFalse := false
	eng := stream.NewDotCheckpointEngine(stream.Hooks{
		MergeChunkWindow: &mergeFalse,
		OnChunk:          func(any, map[string]any) {},
	})
	if err := eng.Push(">\n>orders-\nid:A1\nid:A2\n.\n"); err != nil {
		t.Fatal(err)
	}
	if err := eng.Push(">orders-\n?1\nstatus:ok\n.\n"); err != nil {
		t.Fatal(err)
	}
	eng.Finish()
	want := map[string]any{
		"orders": []any{
			map[string]any{"id": "A1"},
			map[string]any{"id": "A2", "status": "ok"},
		},
	}
	if !reflect.DeepEqual(eng.Snapshot(), want) {
		t.Fatalf("got %#v want %#v", eng.Snapshot(), want)
	}
}
