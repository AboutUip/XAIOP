package xaiop

import "testing"

func TestRootArray(t *testing.T) {
	got, err := Parse(wire("-", ":1", ":2"))
	if err != nil {
		t.Fatal(err)
	}
	want := []any{int64(1), int64(2)}
	if !valuesEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestNamedArray(t *testing.T) {
	doc, err := Parse(wire(">", ">items-", ":alpha", ":beta", "<"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"items": []any{"alpha", "beta"}}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
}

func TestNestedArrayElements(t *testing.T) {
	doc, err := Parse(wire(
		">", ">payload", ">items-", ">", "title:first", "<", ">", "title:second", "<",
		":plain", "-", ":x", ":y", "<",
	))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"payload": map[string]any{
			"items": []any{
				map[string]any{"title": "first"},
				map[string]any{"title": "second"},
				"plain",
				[]any{"x", "y"},
			},
		},
	}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
}

func TestArrayOfObjectsViaGt(t *testing.T) {
	doc, err := Parse(wire(
		">", ">users-", ">", "id:1", "name:alice", "<", ">", "id:2", "name:bob", "<",
	))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"users": []any{
			map[string]any{"id": int64(1), "name": "alice"},
			map[string]any{"id": int64(2), "name": "bob"},
		},
	}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
}

func TestInlinePathComposition(t *testing.T) {
	doc, err := Parse(wire(">", ">a>b", "x:1"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"a": map[string]any{"b": map[string]any{"x": int64(1)}}}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
}
