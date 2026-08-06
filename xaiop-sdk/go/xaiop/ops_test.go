package xaiop

import (
	"strings"
	"testing"
)

func TestHashCommentIgnored(t *testing.T) {
	got, err := Parse(wire(">", "# comment", "x:1"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"x": int64(1)}
	if !valuesEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestDotResetsCursor(t *testing.T) {
	doc, err := Parse(wire(">", ">a", "x:1", ".", ">b", "y:2"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"a": map[string]any{"x": int64(1)},
		"b": map[string]any{"y": int64(2)},
	}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
}

func TestLocateFuzzy(t *testing.T) {
	doc, err := Parse(wire(">", ">wrap", ">a", ">b", "x:1", ".", "=a>b", "z:3"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"wrap": map[string]any{"a": map[string]any{"b": map[string]any{"x": int64(1), "z": int64(3)}}}}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
}

func TestLocateNotFound(t *testing.T) {
	_, err := Parse(wire(">", ">a", "x:1", ".", "=missing"))
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "=path not found") {
		t.Fatalf("error = %v", err)
	}
}

func TestExactEnterCreatesPath(t *testing.T) {
	doc, err := Parse(wire("@a>b", "z:1"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"a": map[string]any{"b": map[string]any{"z": int64(1)}}}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
}

func TestExactEnterNoFuzzy(t *testing.T) {
	doc, err := Parse(wire(">", ">wrap", ">a", ">b", "x:1", ".", "@a>b", "z:1"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"wrap": map[string]any{"a": map[string]any{"b": map[string]any{"x": int64(1)}}},
		"a":    map[string]any{"b": map[string]any{"z": int64(1)}},
	}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
}

func TestBroadcastMultiMatch(t *testing.T) {
	doc, err := Parse(wire(
		">", ">left", ">test", "x:1", ".", ">right", ">test", "y:2", ".", "!test", "z:9",
	))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"left":  map[string]any{"test": map[string]any{"x": int64(1), "z": int64(9)}},
		"right": map[string]any{"test": map[string]any{"y": int64(2), "z": int64(9)}},
	}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
}

func TestBroadcastRequiresDotBeforeAt(t *testing.T) {
	_, err := Parse(wire(">", ">a", "x:1", ".", ">b", ">a", "y:2", ".", "!a", "@a", "z:1"))
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "broadcast mode") {
		t.Fatalf("error = %v", err)
	}
}

func TestDeleteAbsolute(t *testing.T) {
	doc, err := Parse(wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"b": map[string]any{"y": int64(2), "z": int64(3)}}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
}

func TestDeleteCursorChainForbidden(t *testing.T) {
	_, err := Parse(wire(">", ">a", "x:1", "&a"))
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "Cursor chain") {
		t.Fatalf("error = %v", err)
	}
}

func TestDeleteFragmentRootRejected(t *testing.T) {
	_, err := Parse(wire(">a", "x:1", "&a"))
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "object document root") {
		t.Fatalf("error = %v", err)
	}
}

func TestFragmentAtAndBang(t *testing.T) {
	at, err := Parse(wire(">a", ">b", "x:1", ".", "@a>b", "z:2"))
	if err != nil {
		t.Fatal(err)
	}
	f, ok := at.(*Fragment)
	if !ok {
		t.Fatalf("expected fragment, got %T", at)
	}
	wantAt := map[string]any{"a": map[string]any{"b": map[string]any{"x": int64(1), "z": int64(2)}}}
	if !valuesEqual(f.Entries, wantAt) {
		t.Fatalf("entries = %v", f.Entries)
	}

	bang, err := Parse(wire(">left", ">t", "x:1", ".", ">right", ">t", "y:2", ".", "!t", "z:3"))
	if err != nil {
		t.Fatal(err)
	}
	fb, ok := bang.(*Fragment)
	if !ok {
		t.Fatalf("expected fragment, got %T", bang)
	}
	wantBang := map[string]any{
		"left":  map[string]any{"t": map[string]any{"x": int64(1), "z": int64(3)}},
		"right": map[string]any{"t": map[string]any{"y": int64(2), "z": int64(3)}},
	}
	if !valuesEqual(fb.Entries, wantBang) {
		t.Fatalf("entries = %v", fb.Entries)
	}
}
