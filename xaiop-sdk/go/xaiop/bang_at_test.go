package xaiop

import (
	"strings"
	"testing"
)

func TestAtExactVsEqualsFuzzy(t *testing.T) {
	fuzzy, err := Parse(wire(">", ">wrap", ">a", ">b", "x:1", ".", "=a>b", "z:3"))
	if err != nil {
		t.Fatal(err)
	}
	wantFuzzy := map[string]any{
		"wrap": map[string]any{"a": map[string]any{"b": map[string]any{"x": int64(1), "z": int64(3)}}},
	}
	if !valuesEqual(fuzzy, wantFuzzy) {
		t.Fatalf("fuzzy %#v", fuzzy)
	}

	exact, err := Parse(wire(">", ">wrap", ">a", ">b", "x:1", ".", "@a>b", "z:1"))
	if err != nil {
		t.Fatal(err)
	}
	wantExact := map[string]any{
		"wrap": map[string]any{"a": map[string]any{"b": map[string]any{"x": int64(1)}}},
		"a":    map[string]any{"b": map[string]any{"z": int64(1)}},
	}
	if !valuesEqual(exact, wantExact) {
		t.Fatalf("exact %#v", exact)
	}
}

func TestBangOuterPrune(t *testing.T) {
	doc, err := Parse(wire(
		">", ">box", ">t", "x:1", ".", ">box", ">nest", ">t", "y:2", ".", "!t", "z:9",
	))
	if err != nil {
		t.Fatal(err)
	}
	m := Materialize(doc).(map[string]any)
	box, ok := m["box"].(map[string]any)
	if !ok {
		t.Fatalf("box missing: %#v", m)
	}
	if outer, ok := box["t"].(map[string]any); !ok || !valuesEqual(outer["z"], int64(9)) {
		t.Fatalf("box.t.z missing: %#v", box)
	}
	nest, ok := box["nest"].(map[string]any)
	if !ok {
		t.Fatalf("expected nest under box, got %#v", box)
	}
	tNode, ok := nest["t"].(map[string]any)
	if !ok || !valuesEqual(tNode["z"], int64(9)) {
		t.Fatalf("nest.t.z missing: %#v", nest)
	}
}

func TestBangMultiPath(t *testing.T) {
	doc, err := Parse(wire(
		">", ">left", ">a", ">b", "x:1", ".", ">right", ">a", ">b", "y:2", ".", "!a>b", "z:3",
	))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"left":  map[string]any{"a": map[string]any{"b": map[string]any{"x": int64(1), "z": int64(3)}}},
		"right": map[string]any{"a": map[string]any{"b": map[string]any{"y": int64(2), "z": int64(3)}}},
	}
	if !valuesEqual(doc, want) {
		t.Fatalf("got %#v want %#v", doc, want)
	}
}

func TestBangIntoArraysAppends(t *testing.T) {
	doc, err := Parse(wire(
		">", ">left", ">items-", ":a", ".", ">right", ">items-", ":b", ".", "!items", ":c",
	))
	if err != nil {
		t.Fatal(err)
	}
	m := doc.(map[string]any)
	left := m["left"].(map[string]any)["items"]
	right := m["right"].(map[string]any)["items"]
	if !valuesEqual(left, []any{"a", "c"}) {
		t.Fatalf("left items %#v", left)
	}
	if !valuesEqual(right, []any{"b", "c"}) {
		t.Fatalf("right items %#v", right)
	}
}

func TestBangBroadcastRequiresDot(t *testing.T) {
	_, err := Parse(wire(">", ">a", "x:1", ".", ">b", ">a", "y:2", ".", "!a", "@a", "z:1"))
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "broadcast") {
		t.Fatalf("expected broadcast error, got %v", err)
	}
}

func TestFixtureBangBroadcast(t *testing.T) {
	// Matches conformance/fixtures/bang-broadcast.xaiop
	doc, err := Parse(">\n>left\n>t\nx:1\n.\n>right\n>t\ny:2\n.\n!t\nz:9\n.\n")
	if err != nil {
		t.Fatal(err)
	}
	m := doc.(map[string]any)
	if !valuesEqual(m["left"].(map[string]any)["t"].(map[string]any)["z"], int64(9)) {
		t.Fatalf("left.t %#v", m["left"])
	}
	if !valuesEqual(m["right"].(map[string]any)["t"].(map[string]any)["z"], int64(9)) {
		t.Fatalf("right.t %#v", m["right"])
	}
}
