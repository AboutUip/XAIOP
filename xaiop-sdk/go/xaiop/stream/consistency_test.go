package stream_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/stream"
)

type consistencyCase struct {
	name string
	wire string
	want any
}

func consistencyCases() []consistencyCase {
	return []consistencyCase{
		{"hierarchy id overwrite", ">\nid:1\n.\n>\nid:2\n", map[string]any{"id": int64(2)}},
		{"named sections", ">\n>a\nx:1\n.\n>b\ny:2\n.\n>c\nz:3\n", map[string]any{
			"a": map[string]any{"x": int64(1)},
			"b": map[string]any{"y": int64(2)},
			"c": map[string]any{"z": int64(3)},
		}},
		{"same key overwrite", ">\n>meta\nname:v1\nver:1\n.\n>meta\nname:v2\nver:2\n", map[string]any{
			"meta": map[string]any{"name": "v2", "ver": int64(2)},
		}},
		{"array grow sibling", ">\n>tags-\n:a\n:b\n.\n>user\nid:1\n", map[string]any{
			"tags": []any{"a", "b"},
			"user": map[string]any{"id": int64(1)},
		}},
		{"root array", "-\n:a\n:b\n:c\n", []any{"a", "b", "c"}},
	}
}

func TestOnesHotMatchesExpected(t *testing.T) {
	for _, tc := range consistencyCases() {
		t.Run(tc.name, func(t *testing.T) {
			got, err := xaiop.Parse(tc.wire)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(xaiop.Materialize(got), tc.want) {
				t.Fatalf("got %#v want %#v", got, tc.want)
			}
		})
	}
}

func TestCharChunkedEngine(t *testing.T) {
	for _, tc := range consistencyCases() {
		t.Run(tc.name, func(t *testing.T) {
			mergeFalse := false
			eng := stream.NewDotCheckpointEngine(stream.Hooks{
				MergeChunkWindow: &mergeFalse,
				OnChunk:          func(any, map[string]any) {},
			})
			for _, ch := range tc.wire {
				if err := eng.Push(string(ch)); err != nil {
					t.Fatal(err)
				}
			}
			eng.Finish()
			if !reflect.DeepEqual(eng.Snapshot(), tc.want) {
				t.Fatalf("got %#v want %#v", eng.Snapshot(), tc.want)
			}
		})
	}
}

func TestSizedChunksStream(t *testing.T) {
	for _, tc := range consistencyCases() {
		t.Run(tc.name, func(t *testing.T) {
			mergeFalse := false
			var done any
			s, err := stream.NewXaiopStream("raw://sized", stream.Options{
				MergeChunkWindow: &mergeFalse,
				OnDone:           func(v any) { done = v },
				OnChunk:          func(any, map[string]any) {},
			})
			if err != nil {
				t.Fatal(err)
			}
			for i := 0; i < len(tc.wire); i += 3 {
				end := i + 3
				if end > len(tc.wire) {
					end = len(tc.wire)
				}
				if err := s.Push(tc.wire[i:end]); err != nil {
					t.Fatal(err)
				}
			}
			if err := s.Finish(); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(done, tc.want) {
				t.Fatalf("got %#v want %#v", done, tc.want)
			}
		})
	}
}

func TestCRLFOverwrite(t *testing.T) {
	src := ">\r\nid:1\r\n.\r\n>\r\nid:2\r\n"
	got, err := xaiop.Parse(src)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"id": int64(2)}
	if !reflect.DeepEqual(xaiop.Materialize(got), want) {
		t.Fatalf("parse %#v", got)
	}
	snap, _ := drain(t, src, false)
	if !reflect.DeepEqual(snap, want) {
		t.Fatalf("engine %#v", snap)
	}
}

func TestTrailingContentAfterLastDot(t *testing.T) {
	src := ">\na:1\n.\n>\nb:2\n"
	want := map[string]any{"a": int64(1), "b": int64(2)}
	got, err := xaiop.Parse(src)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(xaiop.Materialize(got), want) {
		t.Fatalf("parse %#v", got)
	}
	mergeFalse := false
	var done any
	s, err := stream.NewXaiopStream("raw://trail", stream.Options{
		MergeChunkWindow: &mergeFalse,
		OnChunk:          func(any, map[string]any) {},
		OnDone:           func(v any) { done = v },
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = s.Push(src)
	_ = s.Finish()
	if !reflect.DeepEqual(done, want) {
		t.Fatalf("stream %#v", done)
	}
}

func TestComplexFixtureStreamConsistency(t *testing.T) {
	root := fixturesDir(t)
	wireBytes, err := os.ReadFile(filepath.Join(root, "complex.xaiop"))
	if err != nil {
		t.Fatal(err)
	}
	expBytes, err := os.ReadFile(filepath.Join(root, "complex.expected.json"))
	if err != nil {
		t.Fatal(err)
	}
	var expected any
	if err := json.Unmarshal(expBytes, &expected); err != nil {
		t.Fatal(err)
	}
	// Normalize JSON numbers to match Parse int64/float64 via rematerialize.
	parsed, err := xaiop.Parse(string(wireBytes))
	if err != nil {
		t.Fatal(err)
	}
	got := xaiop.Materialize(parsed)
	gotJSON, _ := json.Marshal(got)
	expJSON, _ := json.Marshal(expected)
	if string(gotJSON) != string(expJSON) {
		t.Fatalf("parse mismatch\ngot  %s\nwant %s", gotJSON, expJSON)
	}
	snap, _ := drain(t, string(wireBytes), false)
	snapJSON, _ := json.Marshal(snap)
	if string(snapJSON) != string(expJSON) {
		t.Fatalf("engine mismatch\ngot  %s\nwant %s", snapJSON, expJSON)
	}
}

func TestD1NamedEnterAfterDot(t *testing.T) {
	p1 := ">\n>meta\nname:x\n.\n"
	p2 := ">rules-\n>\nid:R1\n<\n.\n"
	full := p1 + p2
	want := map[string]any{
		"meta":  map[string]any{"name": "x"},
		"rules": []any{map[string]any{"id": "R1"}},
	}
	parsed, err := xaiop.Parse(full)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(xaiop.Materialize(parsed), want) {
		t.Fatalf("parse %#v", parsed)
	}
	one, _ := drain(t, full, true)
	if !reflect.DeepEqual(one, want) {
		t.Fatalf("merged %#v", one)
	}
	mergeFalse := false
	var chunks []any
	eng := stream.NewDotCheckpointEngine(stream.Hooks{
		MergeChunkWindow: &mergeFalse,
		OnChunk:          func(d any, _ map[string]any) { chunks = append(chunks, d) },
	})
	_ = eng.Push(p1)
	_ = eng.Push(p2)
	eng.Finish()
	if !reflect.DeepEqual(eng.CommittedSnapshot(), want) {
		t.Fatalf("committed %#v", eng.CommittedSnapshot())
	}
	if len(chunks) != 2 {
		t.Fatalf("chunks %#v", chunks)
	}
	if !reflect.DeepEqual(chunks[0], map[string]any{"meta": map[string]any{"name": "x"}}) {
		t.Fatalf("chunk0 %#v", chunks[0])
	}
	if !reflect.DeepEqual(chunks[1], map[string]any{"rules": []any{map[string]any{"id": "R1"}}}) {
		t.Fatalf("chunk1 %#v", chunks[1])
	}
}

func TestD1LocateEqualsCumulative(t *testing.T) {
	phase1 := ">\n>a\nx:1\n.\n"
	phase2 := "=a\ny:2\n.\n"
	wire := phase1 + phase2
	want := map[string]any{"a": map[string]any{"x": int64(1), "y": int64(2)}}
	parsed, err := xaiop.Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(xaiop.Materialize(parsed), want) {
		t.Fatalf("parse %#v", parsed)
	}
	mergeFalse := false
	var chunks []any
	eng := stream.NewDotCheckpointEngine(stream.Hooks{
		MergeChunkWindow: &mergeFalse,
		OnChunk:          func(d any, _ map[string]any) { chunks = append(chunks, d) },
	})
	_ = eng.Push(phase1)
	_ = eng.Push(phase2)
	eng.Finish()
	if !reflect.DeepEqual(eng.CommittedSnapshot(), want) {
		t.Fatalf("committed %#v", eng.CommittedSnapshot())
	}
	if len(chunks) != 2 || !reflect.DeepEqual(chunks[1], want) {
		t.Fatalf("chunks %#v", chunks)
	}
}

func TestEmitDiffFalse(t *testing.T) {
	emit := false
	eng := stream.NewDotCheckpointEngine(stream.Hooks{EmitDiff: &emit})
	_ = eng.Push(">\na:1\n.\n")
	eng.Finish()
	if !reflect.DeepEqual(eng.CommittedSnapshot(), map[string]any{"a": int64(1)}) {
		t.Fatalf("committed %#v", eng.CommittedSnapshot())
	}
}

func TestCoverNestedTombstone(t *testing.T) {
	text := ">\n>a\n>b\nx:1\n.\n>c\nz:1\n&a>b\n.\n"
	mergeFalse := false
	var chunks []any
	eng := stream.NewDotCheckpointEngine(stream.Hooks{
		MergeChunkWindow: &mergeFalse,
		Cover:            true,
		OnChunk:          func(d any, _ map[string]any) { chunks = append(chunks, d) },
	})
	_ = eng.Push(text)
	eng.Finish()
	found := false
	for _, c := range chunks {
		m, ok := c.(map[string]any)
		if !ok {
			continue
		}
		a, ok := m["a"].(map[string]any)
		if ok && a["b"] == nil {
			found = true
			if !reflect.DeepEqual(m, map[string]any{"a": map[string]any{"b": nil}}) {
				t.Fatalf("tombstone %#v", m)
			}
		}
	}
	if !found {
		t.Fatalf("expected nested tombstone, chunks=%#v", chunks)
	}
	parsed, _ := xaiop.Parse(text)
	if !reflect.DeepEqual(eng.Snapshot(), xaiop.Materialize(parsed)) {
		t.Fatalf("snapshot %#v", eng.Snapshot())
	}
}

func TestStreamAbort(t *testing.T) {
	mergeFalse := false
	s, err := stream.NewXaiopStream("raw://abort", stream.Options{
		MergeChunkWindow: &mergeFalse,
		OnChunk:          func(any, map[string]any) {},
		OnDone:           func(any) {},
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = s.Push(">\na:1\n.\n")
	ok := s.Abort()
	if !ok {
		t.Fatal("abort should return true before finish")
	}
	if s.Status() != stream.StatusAborted {
		t.Fatalf("status=%s", s.Status())
	}
}
