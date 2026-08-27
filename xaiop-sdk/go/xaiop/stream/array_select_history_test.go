package stream_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/stream"
)

const (
	selectSeed         = ">\n>orders-\n>\nid:A1\nstatus:pending\n<\n>\nid:A2\nstatus:pending\n<\n>\nid:A3\nstatus:done\n.\n"
	selectA2           = "@orders\n?id:A2\nstatus:shipped\n.\n"
	spliceA1           = "@orders\n?id:A1\n&\n.\n"
	starShipped        = "@orders\n?*status:shipped\nchecked:true\n.\n"
	locateSelect       = "=orders\n?1\nnote:ok\n.\n"
	selectHistoryFull  = selectSeed + selectA2 + spliceA1
)

func afterSeed() map[string]any {
	return map[string]any{
		"orders": []any{
			map[string]any{"id": "A1", "status": "pending"},
			map[string]any{"id": "A2", "status": "pending"},
			map[string]any{"id": "A3", "status": "done"},
		},
	}
}

func afterSelect() map[string]any {
	return map[string]any{
		"orders": []any{
			map[string]any{"id": "A1", "status": "pending"},
			map[string]any{"id": "A2", "status": "shipped"},
			map[string]any{"id": "A3", "status": "done"},
		},
	}
}

func afterSplice() map[string]any {
	return map[string]any{
		"orders": []any{
			map[string]any{"id": "A2", "status": "shipped"},
			map[string]any{"id": "A3", "status": "done"},
		},
	}
}

func afterIntercept() map[string]any {
	return map[string]any{
		"orders": []any{
			map[string]any{"id": "A1", "status": "shipped"},
			map[string]any{"id": "A2", "status": "pending"},
			map[string]any{"id": "A3", "status": "done"},
		},
	}
}

func afterStar() map[string]any {
	return map[string]any{
		"orders": []any{
			map[string]any{"id": "A1", "status": "pending"},
			map[string]any{"id": "A2", "status": "shipped", "checked": true},
			map[string]any{"id": "A3", "status": "done"},
		},
	}
}

func rewriteSelectA2(line string, _ map[string]any) (string, bool) {
	if line == "?id:A2" {
		return "?id:A1", true
	}
	return line, true
}

func skipSelect(line string, _ map[string]any) (string, bool) {
	if len(line) > 0 && line[0] == '?' {
		return "", false
	}
	return line, true
}

func newSelectHistEngine(t *testing.T, hooks stream.Hooks) (*stream.DotCheckpointEngine, *[]any) {
	t.Helper()
	var chunks []any
	merge := false
	if hooks.MergeChunkWindow == nil {
		hooks.MergeChunkWindow = &merge
	}
	hooks.OnChunk = func(d any, _ map[string]any) { chunks = append(chunks, d) }
	return stream.NewDotCheckpointEngine(hooks), &chunks
}

func mustAfter(t *testing.T, h *stream.ParseHistory, index int) any {
	t.Helper()
	got, err := h.GetAfter(index)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestArraySelectHistoryAfterTrees(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{HistorySnapshot: true})
	if err := eng.Push(selectHistoryFull); err != nil {
		t.Fatal(err)
	}
	h := eng.History()
	if h.Length() != 3 {
		t.Fatalf("length = %d", h.Length())
	}
	if !reflect.DeepEqual(mustAfter(t, h, 0), afterSeed()) {
		t.Fatalf("after[0] = %#v", mustAfter(t, h, 0))
	}
	if !reflect.DeepEqual(mustAfter(t, h, 1), afterSelect()) {
		t.Fatalf("after[1] = %#v", mustAfter(t, h, 1))
	}
	if !reflect.DeepEqual(mustAfter(t, h, 2), afterSplice()) {
		t.Fatalf("after[2] = %#v", mustAfter(t, h, 2))
	}
	root, err := h.ExportTimeRoot()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(root[1].Before, afterSeed()) {
		t.Fatalf("before[1] = %#v", root[1].Before)
	}
}

func TestArraySelectHistoryEmitDiffFalse(t *testing.T) {
	emit := false
	eng, chunks := newSelectHistEngine(t, stream.Hooks{HistorySnapshot: true, EmitDiff: &emit})
	if err := eng.Push(selectHistoryFull); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 2), afterSplice()) {
		t.Fatalf("after[2] = %#v", mustAfter(t, eng.History(), 2))
	}
	for i, d := range *chunks {
		if d != nil {
			t.Fatalf("chunk[%d] = %#v", i, d)
		}
	}
	diff, err := eng.History().GetDiff(1)
	if err != nil {
		t.Fatal(err)
	}
	if diff != nil {
		t.Fatalf("diff[1] = %#v", diff)
	}
}

func TestArraySelectHistoryCompatTrue(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{HistorySnapshot: true, Compat: true})
	if err := eng.Push(selectHistoryFull); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 2), afterSplice()) {
		t.Fatalf("after[2] = %#v", mustAfter(t, eng.History(), 2))
	}
}

func TestArraySelectHistoryEofTail(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{HistorySnapshot: true})
	if err := eng.Push(selectSeed + "@orders\n?id:A2\nstatus:shipped\n"); err != nil {
		t.Fatal(err)
	}
	eng.Finish()
	root, err := eng.History().ExportTimeRoot()
	if err != nil {
		t.Fatal(err)
	}
	if len(root) != 2 || root[0].Kind != stream.HistoryKindDot || root[1].Kind != stream.HistoryKindTail {
		t.Fatalf("kinds = %#v", root)
	}
	if !reflect.DeepEqual(root[1].After, afterSelect()) {
		t.Fatalf("tail after = %#v", root[1].After)
	}
}

func TestArraySelectHistoryJumpToThenContinue(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{HistorySnapshot: true, HistoryRealtime: true})
	if err := eng.Push(selectHistoryFull); err != nil {
		t.Fatal(err)
	}
	h := eng.History()
	if h.LiveCursor() != -1 || !h.CanJumpTo(1) {
		t.Fatalf("cursor=%d canJump=%v", h.LiveCursor(), h.CanJumpTo(1))
	}
	jumped, err := eng.JumpTo(1)
	if err != nil {
		t.Fatal(err)
	}
	if jumped.Kept != 2 || jumped.Discarded != 1 {
		t.Fatalf("jump = %+v", jumped)
	}
	if !reflect.DeepEqual(jumped.After, afterSelect()) {
		t.Fatalf("jump after = %#v", jumped.After)
	}
	if h.Length() != 2 || h.LiveCursor() != 1 {
		t.Fatalf("after jump length=%d cursor=%d", h.Length(), h.LiveCursor())
	}
	if !reflect.DeepEqual(eng.CommittedSnapshot(), afterSelect()) {
		t.Fatalf("committed = %#v", eng.CommittedSnapshot())
	}
	if h.CanJumpTo(1) {
		t.Fatal("expected cannot jump to current cursor")
	}
	if _, err := eng.JumpTo(0); err == nil {
		t.Fatal("expected backward jump error")
	} else {
		var rangeErr *stream.RangeError
		if !errors.As(err, &rangeErr) {
			t.Fatalf("want RangeError, got %T %v", err, err)
		}
	}
	if err := eng.Push(starShipped); err != nil {
		t.Fatal(err)
	}
	if h.Length() != 3 {
		t.Fatalf("length after continue = %d", h.Length())
	}
	if !reflect.DeepEqual(mustAfter(t, h, 2), afterStar()) {
		t.Fatalf("after[2] = %#v", mustAfter(t, h, 2))
	}
}

func TestArraySelectHistoryJumpToSeedThenMatchingSelect(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{HistoryRealtime: true})
	if err := eng.Push(selectHistoryFull); err != nil {
		t.Fatal(err)
	}
	if _, err := eng.JumpTo(0); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(eng.CommittedSnapshot(), afterSeed()) {
		t.Fatalf("committed = %#v", eng.CommittedSnapshot())
	}
	if err := eng.Push(selectA2); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 1), afterSelect()) {
		t.Fatalf("after[1] = %#v", mustAfter(t, eng.History(), 1))
	}
}

func TestArraySelectHistoryJumpToSeedUnmatchedStar(t *testing.T) {
	var sawErr error
	eng, _ := newSelectHistEngine(t, stream.Hooks{
		HistoryRealtime: true,
		OnError:         func(err error) { sawErr = err },
	})
	if err := eng.Push(selectHistoryFull); err != nil {
		t.Fatal(err)
	}
	if _, err := eng.JumpTo(0); err != nil {
		t.Fatal(err)
	}
	_ = eng.Push(starShipped)
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 0), afterSeed()) {
		t.Fatalf("after[0] = %#v", mustAfter(t, eng.History(), 0))
	}
	if sawErr == nil {
		// Go Push does not return live-parse errors; materialize should still see one.
		if _, err := eng.History().GetAfter(1); err == nil {
			after, _ := eng.History().GetAfter(1)
			if after != nil {
				t.Fatalf("unmatched ?* must not commit a tree: %#v", after)
			}
		}
	}
}

func TestArraySelectHistoryRetainWireFalseJump(t *testing.T) {
	retain := false
	eng, _ := newSelectHistEngine(t, stream.Hooks{
		HistorySnapshot:   true,
		HistoryRealtime:   true,
		RetainWireHistory: &retain,
	})
	if err := eng.Push(selectHistoryFull); err != nil {
		t.Fatal(err)
	}
	jumped, err := eng.JumpTo(1)
	if err != nil {
		t.Fatal(err)
	}
	if jumped.HasWirePrefix {
		t.Fatalf("expected no wire prefix: %+v", jumped)
	}
	if !reflect.DeepEqual(eng.CommittedSnapshot(), afterSelect()) {
		t.Fatalf("committed = %#v", eng.CommittedSnapshot())
	}
	if err := eng.Push(starShipped); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 2), afterStar()) {
		t.Fatalf("after[2] = %#v", mustAfter(t, eng.History(), 2))
	}
}

func TestArraySelectHistoryJumpAfterFinish(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{HistoryRealtime: true})
	if err := eng.Push(selectHistoryFull); err != nil {
		t.Fatal(err)
	}
	eng.Finish()
	if _, err := eng.JumpTo(1); err != nil {
		t.Fatal(err)
	}
	if err := eng.Push(starShipped); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 2), afterStar()) {
		t.Fatalf("after[2] = %#v", mustAfter(t, eng.History(), 2))
	}
}

func TestArraySelectHistoryInterceptRewriteOnJump(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{
		HistorySnapshot: true,
		HistoryRealtime: true,
		LineIntercept:   []xaiop.LineInterceptor{rewriteSelectA2},
	})
	if err := eng.Push(selectSeed + selectA2 + spliceA1); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 1), afterIntercept()) {
		t.Fatalf("after[1] = %#v", mustAfter(t, eng.History(), 1))
	}
	if _, err := eng.JumpTo(1); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(eng.CommittedSnapshot(), afterIntercept()) {
		t.Fatalf("committed = %#v", eng.CommittedSnapshot())
	}
	if err := eng.Push("@orders\n?id:A3\nnote:x\n.\n"); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"orders": []any{
			map[string]any{"id": "A1", "status": "shipped"},
			map[string]any{"id": "A2", "status": "pending"},
			map[string]any{"id": "A3", "status": "done", "note": "x"},
		},
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 2), want) {
		t.Fatalf("after[2] = %#v", mustAfter(t, eng.History(), 2))
	}
}

func TestArraySelectHistorySkipSelectWritesAtArrayLevel(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{
		HistorySnapshot: true,
		LineIntercept:   []xaiop.LineInterceptor{skipSelect},
	})
	if err := eng.Push(selectSeed + selectA2); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"orders": []any{
			map[string]any{"id": "A1", "status": "pending"},
			map[string]any{"id": "A2", "status": "pending"},
			map[string]any{"id": "A3", "status": "done"},
			map[string]any{"status": "shipped"},
		},
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 1), want) {
		t.Fatalf("after[1] = %#v", mustAfter(t, eng.History(), 1))
	}
}

func TestArraySelectHistoryMergeChunkWindow(t *testing.T) {
	merge := true
	eng, chunks := newSelectHistEngine(t, stream.Hooks{HistorySnapshot: true, MergeChunkWindow: &merge})
	if err := eng.Push(selectHistoryFull); err != nil {
		t.Fatal(err)
	}
	if eng.History().Length() != 3 {
		t.Fatalf("length = %d", eng.History().Length())
	}
	if len(*chunks) != 1 {
		t.Fatalf("chunks = %d", len(*chunks))
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 2), afterSplice()) {
		t.Fatalf("after[2] = %#v", mustAfter(t, eng.History(), 2))
	}
}

func TestArraySelectHistoryCharChunked(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{HistorySnapshot: true})
	if err := eng.Push(selectSeed); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < len(selectA2); i++ {
		if err := eng.Push(selectA2[i : i+1]); err != nil {
			t.Fatal(err)
		}
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 1), afterSelect()) {
		t.Fatalf("after[1] = %#v", mustAfter(t, eng.History(), 1))
	}
}

func TestArraySelectHistoryCoverPathDelete(t *testing.T) {
	wire := selectSeed + selectA2 + "&orders\n.\n"
	eng, _ := newSelectHistEngine(t, stream.Hooks{Cover: true, HistorySnapshot: true})
	if err := eng.Push(wire); err != nil {
		t.Fatal(err)
	}
	eng.Finish()
	parsed, err := xaiop.Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(eng.Snapshot(), parsed) {
		t.Fatalf("snapshot = %#v parsed = %#v", eng.Snapshot(), parsed)
	}
	if !reflect.DeepEqual(eng.Snapshot(), map[string]any{}) {
		t.Fatalf("snapshot = %#v", eng.Snapshot())
	}
}

func TestArraySelectHistoryCoverCannotRestoreSelectCursor(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{Cover: true, HistorySnapshot: true})
	_ = eng.Push(selectSeed + spliceA1)
	eng.Finish()
	parsed, err := xaiop.Parse(selectSeed + spliceA1)
	if err != nil {
		t.Fatal(err)
	}
	// Cover injects '.' before '&', which cannot restore a ? element Cursor.
	// Node/Python/Java throw; Go ignores CursorRestoreLines error and yields a
	// nil / non-parseSync snapshot instead of silently matching parseSync.
	if reflect.DeepEqual(eng.Snapshot(), parsed) {
		t.Fatalf("cover+bare & must not match parseSync; snapshot = %#v", eng.Snapshot())
	}
}

func TestArraySelectHistoryFailedLaterSelectKeepsPrior(t *testing.T) {
	var sawErr error
	eng, _ := newSelectHistEngine(t, stream.Hooks{
		HistorySnapshot: true,
		OnError:         func(err error) { sawErr = err },
	})
	if err := eng.Push(selectSeed); err != nil {
		t.Fatal(err)
	}
	_ = eng.Push("@orders\n?99\n.\n")
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 0), afterSeed()) {
		t.Fatalf("after[0] = %#v", mustAfter(t, eng.History(), 0))
	}
	if eng.History().Length() < 1 {
		t.Fatal("expected seed history node")
	}
	_ = sawErr
}

func TestArraySelectHistoryCompactRefusesUntilDrop(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{HistorySnapshot: true})
	if err := eng.Push(selectHistoryFull); err != nil {
		t.Fatal(err)
	}
	if _, err := eng.CompactCommitted(false); err == nil {
		t.Fatal("expected compact error")
	}
	if _, err := eng.CompactCommitted(true); err != nil {
		t.Fatal(err)
	}
	if eng.History().Length() != 0 {
		t.Fatalf("length = %d", eng.History().Length())
	}
	if !reflect.DeepEqual(eng.CommittedSnapshot(), afterSplice()) {
		t.Fatalf("committed = %#v", eng.CommittedSnapshot())
	}
}

func TestArraySelectHistoryLocateThenSelect(t *testing.T) {
	eng, _ := newSelectHistEngine(t, stream.Hooks{HistorySnapshot: true})
	if err := eng.Push(selectSeed + locateSelect); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"orders": []any{
			map[string]any{"id": "A1", "status": "pending"},
			map[string]any{"id": "A2", "status": "pending", "note": "ok"},
			map[string]any{"id": "A3", "status": "done"},
		},
	}
	if !reflect.DeepEqual(mustAfter(t, eng.History(), 1), want) {
		t.Fatalf("after[1] = %#v", mustAfter(t, eng.History(), 1))
	}
}

func TestArraySelectHistoryStreamRecordsSelectPhases(t *testing.T) {
	merge := false
	s, err := stream.NewXaiopStream("raw://select-hist", stream.Options{
		MergeChunkWindow: &merge,
		HistorySnapshot:  true,
		OnChunk:          func(any, map[string]any) {},
		OnDone:           func(any) {},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SendRaw(stream.ChunksOf(selectHistoryFull)); err != nil {
		t.Fatal(err)
	}
	h := s.History()
	if h == nil || h.Length() != 3 {
		t.Fatalf("history length = %v", h)
	}
	if !reflect.DeepEqual(mustAfter(t, h, 2), afterSplice()) {
		t.Fatalf("after[2] = %#v", mustAfter(t, h, 2))
	}
}
