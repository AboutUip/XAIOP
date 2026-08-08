package stream_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/stream"
)

func boolPtr(v bool) *bool { return &v }

func drain(t *testing.T, text string, merge bool) (any, []any) {
	t.Helper()
	var diffs []any
	engine := stream.NewDotCheckpointEngine(stream.Hooks{
		OnChunk: func(diff any, _ map[string]any) {
			diffs = append(diffs, diff)
		},
		MergeChunkWindow: boolPtr(merge),
	})
	if err := engine.Push(text); err != nil {
		t.Fatal(err)
	}
	engine.Finish()
	return engine.Snapshot(), diffs
}

func mustParseMaterialize(t *testing.T, wire string) any {
	t.Helper()
	parsed, err := xaiop.Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	return xaiop.Materialize(parsed)
}

func fixturesDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// xaiop-sdk/go/xaiop/stream → xaiop-sdk/conformance/fixtures
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "conformance", "fixtures")
}

func readFixture(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(fixturesDir(t), name))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestStepwiseMultiPhaseMatchesParse(t *testing.T) {
	wire := ">\na:1\n.\n>\nb:2\n.\n"
	snap, diffs := drain(t, wire, false)
	want := mustParseMaterialize(t, wire)
	if !reflect.DeepEqual(snap, want) {
		t.Fatalf("snapshot mismatch\ngot %#v\nwant %#v", snap, want)
	}
	if len(diffs) != 2 {
		t.Fatalf("want 2 diffs, got %d: %#v", len(diffs), diffs)
	}
	if !reflect.DeepEqual(diffs[0], map[string]any{"a": int64(1)}) {
		t.Fatalf("diff0 = %#v", diffs[0])
	}
	if !reflect.DeepEqual(diffs[1], map[string]any{"b": int64(2)}) {
		t.Fatalf("diff1 = %#v", diffs[1])
	}
}

func TestWindowMergeCollapsesPhases(t *testing.T) {
	wire := ">\na:1\n.\n>\nb:2\n.\n"
	snap, diffs := drain(t, wire, true)
	want := mustParseMaterialize(t, wire)
	if !reflect.DeepEqual(snap, want) {
		t.Fatalf("snapshot mismatch\ngot %#v\nwant %#v", snap, want)
	}
	if len(diffs) != 1 {
		t.Fatalf("want 1 merged diff, got %d: %#v", len(diffs), diffs)
	}
	if !reflect.DeepEqual(diffs[0], want) {
		t.Fatalf("merged diff = %#v want %#v", diffs[0], want)
	}
}

func TestEmptyMidPhaseNullStepwise(t *testing.T) {
	wire := ">\na:1\n.\n.\n>\nb:2\n.\n"
	_, diffs := drain(t, wire, false)
	if len(diffs) != 3 {
		t.Fatalf("want 3 diffs, got %d: %#v", len(diffs), diffs)
	}
	if diffs[1] != nil {
		t.Fatalf("empty phase want nil, got %#v", diffs[1])
	}
	_, merged := drain(t, wire, true)
	if len(merged) != 1 {
		t.Fatalf("merged want 1 chunk, got %d", len(merged))
	}
}

func TestEmptyPhaseNullDiff(t *testing.T) {
	_, diffs := drain(t, ".\n", false)
	if len(diffs) != 1 || diffs[0] != nil {
		t.Fatalf("want [nil], got %#v", diffs)
	}
}

func TestDiffIsolationD1(t *testing.T) {
	wire := ">\na:1\n.\n>\nb:2\n.\n"
	var diffs []any
	engine := stream.NewDotCheckpointEngine(stream.Hooks{
		OnChunk: func(diff any, _ map[string]any) {
			diffs = append(diffs, diff)
		},
		MergeChunkWindow: boolPtr(false),
	})
	_ = engine.Push(wire)
	engine.Finish()
	first, ok := diffs[0].(map[string]any)
	if !ok {
		t.Fatalf("diff0 type %T", diffs[0])
	}
	first["a"] = int64(999)
	committed := engine.CommittedSnapshot()
	want := map[string]any{"a": int64(1), "b": int64(2)}
	if !reflect.DeepEqual(committed, want) {
		t.Fatalf("mutating Diff aliased Commit:\ngot %#v\nwant %#v", committed, want)
	}
}

func TestFixtureStreamPhases(t *testing.T) {
	wire := readFixture(t, "stream-phases.xaiop")
	snap, diffs := drain(t, wire, false)
	want := mustParseMaterialize(t, wire)
	if !reflect.DeepEqual(snap, want) {
		t.Fatalf("snapshot\ngot %#v\nwant %#v", snap, want)
	}
	if len(diffs) != 3 {
		t.Fatalf("want 3 phase diffs, got %d", len(diffs))
	}
	// Round-trip via JSON to normalize int kinds if needed.
	gotJSON, _ := json.Marshal(snap)
	wantJSON, _ := json.Marshal(want)
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("json snapshot\ngot %s\nwant %s", gotJSON, wantJSON)
	}
}

func TestFixtureAtArrayD2(t *testing.T) {
	wire := readFixture(t, "at-array-d2.xaiop")
	snap, diffs := drain(t, wire, false)
	want := mustParseMaterialize(t, wire)
	if !reflect.DeepEqual(snap, want) {
		t.Fatalf("snapshot\ngot %#v\nwant %#v", snap, want)
	}
	if len(diffs) != 2 {
		t.Fatalf("want 2 diffs, got %d: %#v", len(diffs), diffs)
	}
	// Second phase starts with @ → cumulative Diff (D2), not phase-local.
	if !reflect.DeepEqual(diffs[1], want) {
		t.Fatalf("D2 cumulative diff\ngot %#v\nwant %#v", diffs[1], want)
	}
}

func TestFixtureOverwriteID(t *testing.T) {
	wire := readFixture(t, "overwrite-id.xaiop")
	snap, diffs := drain(t, wire, false)
	want := mustParseMaterialize(t, wire)
	if !reflect.DeepEqual(snap, want) {
		t.Fatalf("snapshot\ngot %#v\nwant %#v", snap, want)
	}
	if len(diffs) != 2 {
		t.Fatalf("want 2 diffs, got %d: %#v", len(diffs), diffs)
	}
	if !reflect.DeepEqual(diffs[0], map[string]any{"id": int64(1)}) {
		t.Fatalf("diff0 = %#v", diffs[0])
	}
	if !reflect.DeepEqual(diffs[1], map[string]any{"id": int64(2)}) {
		t.Fatalf("diff1 = %#v", diffs[1])
	}
}

func TestHistoryRecordDotAndJumpForward(t *testing.T) {
	retain := true
	var diffs []any
	engine := stream.NewDotCheckpointEngine(stream.Hooks{
		OnChunk: func(diff any, _ map[string]any) {
			diffs = append(diffs, diff)
		},
		MergeChunkWindow:  boolPtr(false),
		HistoryRealtime:   true,
		RetainWireHistory: &retain,
	})
	_ = engine.Push(">\na:1\n.\n>\nb:2\n.\n")
	engine.Finish()
	h := engine.History()
	if h == nil || h.Length() < 2 {
		t.Fatalf("history length = %d", h.Length())
	}
	after, err := h.GetAfter(0)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(after, map[string]any{"a": int64(1)}) {
		t.Fatalf("after[0] = %#v", after)
	}
	info := h.Info()
	if info.Length != h.Length() || !info.Realtime {
		t.Fatalf("info = %+v", info)
	}
	// Jump forward to index 0 after finish resets cursor only via realtime mid-stream;
	// after finish liveCursor is still -1 until jump — first jump to 0 is forward from -1.
	res, err := engine.JumpTo(0)
	if err != nil {
		t.Fatal(err)
	}
	if res.Index != 0 || res.Kept != 1 {
		t.Fatalf("jump result = %+v", res)
	}
	if h.Length() != 1 {
		t.Fatalf("after jump length = %d", h.Length())
	}
}

func TestBufferStatsAndCompact(t *testing.T) {
	engine := stream.NewDotCheckpointEngine(stream.Hooks{
		MergeChunkWindow: boolPtr(false),
	})
	_ = engine.Push(">\na:1\n.\n")
	stats := engine.BufferStats()
	if stats.Length == 0 || stats.CommittedAt != stats.Length {
		t.Fatalf("stats = %+v", stats)
	}
	res, err := engine.CompactCommitted(false)
	if err != nil {
		t.Fatal(err)
	}
	if res.DiscardedBytes != stats.Length {
		t.Fatalf("compact = %+v", res)
	}
	engine.Finish()
	if !reflect.DeepEqual(engine.CommittedSnapshot(), map[string]any{"a": int64(1)}) {
		t.Fatalf("committed after compact = %#v", engine.CommittedSnapshot())
	}
}
