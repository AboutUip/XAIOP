package xaiop

import (
	"strings"
	"testing"
)

func TestEmptySourceIsEmptyObject(t *testing.T) {
	got, err := Parse("")
	if err != nil {
		t.Fatal(err)
	}
	m, ok := got.(map[string]any)
	if !ok || len(m) != 0 {
		t.Fatalf("got %v, want empty object", got)
	}
}

func TestFragmentRootContentWithoutOpener(t *testing.T) {
	frag, err := Parse("a:1\nb:2")
	if err != nil {
		t.Fatal(err)
	}
	f, ok := frag.(*Fragment)
	if !ok || !f.IsFragment() {
		t.Fatalf("expected fragment, got %T", frag)
	}
	if !valuesEqual(f.Entries, map[string]any{"a": int64(1), "b": int64(2)}) {
		t.Fatalf("entries = %v", f.Entries)
	}
	if f.Notation() != `"a":1,"b":2` {
		t.Fatalf("notation = %q", f.Notation())
	}
}

func TestFragmentNamedObject(t *testing.T) {
	frag, err := Parse(">a\nx:1\n")
	if err != nil {
		t.Fatal(err)
	}
	f, ok := frag.(*Fragment)
	if !ok {
		t.Fatalf("expected fragment, got %T", frag)
	}
	want := map[string]any{"a": map[string]any{"x": int64(1)}}
	if !valuesEqual(f.Entries, want) {
		t.Fatalf("entries = %v, want %v", f.Entries, want)
	}
}

func TestCompleteObjectRoot(t *testing.T) {
	got, err := Parse(">\nx:1\n")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"x": int64(1)}
	if !valuesEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestCompleteArrayRoot(t *testing.T) {
	got, err := Parse("-\n:1\n:2\n")
	if err != nil {
		t.Fatal(err)
	}
	want := []any{int64(1), int64(2)}
	if !valuesEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestBareGtAfterFragmentErrors(t *testing.T) {
	_, err := Parse("a:1\n>\n")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "bare > after fragment") {
		t.Fatalf("error = %v", err)
	}
}

func TestMaterializeFragment(t *testing.T) {
	frag := mustParse("a:1\n").(*Fragment)
	snap := Materialize(frag)
	if !valuesEqual(snap, map[string]any{"a": int64(1)}) {
		t.Fatalf("snap = %v", snap)
	}
	m := snap.(map[string]any)
	m["a"] = int64(99)
	if frag.Entries["a"] != int64(1) {
		t.Fatal("fragment mutated")
	}
}

func TestMaterializeObject(t *testing.T) {
	doc := mustParse(">\nx:1\n").(map[string]any)
	snap := Materialize(doc)
	if !valuesEqual(snap, map[string]any{"x": int64(1)}) {
		t.Fatalf("snap = %v", snap)
	}
	m := snap.(map[string]any)
	m["x"] = int64(99)
	if doc["x"] != int64(1) {
		t.Fatal("doc mutated")
	}
}
