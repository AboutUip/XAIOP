package xaiop

import (
	"testing"
)

func TestHashIgnoredAnywhere(t *testing.T) {
	got, err := Parse(wire(">", "# top", "x:1", "# mid", "y:2", "# end"))
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"x": int64(1), "y": int64(2)}) {
		t.Fatalf("got %#v", got)
	}
}

func TestHashCursorStable(t *testing.T) {
	got, err := Parse(wire(">", ">a", "# note", "x:1", "# more", "y:2"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"a": map[string]any{"x": int64(1), "y": int64(2)}}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
}

func TestHashInContentValueAllowed(t *testing.T) {
	got, err := Parse(wire(">", "msg:hello # world"))
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"msg": "hello # world"}) {
		t.Fatalf("got %#v", got)
	}
}

func TestHashLeadingSpaceNotAnnotation(t *testing.T) {
	_, err := Parse(wire(">", " # not-anno", "x:1"))
	if err == nil {
		t.Fatal("expected error for leading-space hash line")
	}
}

func TestHashBetweenPhases(t *testing.T) {
	got, err := Parse(wire(">", "a:1", "# phase1", ".", "# between", ">", "b:2"))
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"a": int64(1), "b": int64(2)}) {
		t.Fatalf("got %#v", got)
	}
}

func TestHashFragment(t *testing.T) {
	doc, err := Parse(wire(">a", "# c", "x:1"))
	if err != nil {
		t.Fatal(err)
	}
	f, ok := doc.(*Fragment)
	if !ok {
		t.Fatalf("want Fragment, got %T", doc)
	}
	if !valuesEqual(f.Entries, map[string]any{"a": map[string]any{"x": int64(1)}}) {
		t.Fatalf("entries %#v", f.Entries)
	}
}
