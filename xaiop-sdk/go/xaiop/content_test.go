package xaiop

import (
	"strings"
	"testing"
)

func TestBoolNullTyping(t *testing.T) {
	got, err := Parse(">\nt:true\nf:false\nn:null\n")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"t": true, "f": false, "n": nil}
	if !valuesEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestIntAndFloat(t *testing.T) {
	doc, err := Parse(">\ni:42\nf:1.5\ne:1e3\n")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"i": int64(42), "f": 1.5, "e": 1000.0}
	if !valuesEqual(doc, want) {
		t.Fatalf("doc = %v, want %v", doc, want)
	}
	m := doc.(map[string]any)
	if _, ok := m["i"].(int64); !ok {
		t.Fatalf("i type = %T", m["i"])
	}
	if _, ok := m["f"].(float64); !ok {
		t.Fatalf("f type = %T", m["f"])
	}
}

func TestForcedStringLeadingSpace(t *testing.T) {
	got, err := Parse(">\ncount: 2\nscore: 10\n")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"count": "2", "score": "10"}
	if !valuesEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestPlainString(t *testing.T) {
	got, err := Parse(">\nname:alice\n")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"name": "alice"}
	if !valuesEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestEmptyLineIsError(t *testing.T) {
	_, err := Parse(">\n\nx:1\n")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "empty line") {
		t.Fatalf("error = %v", err)
	}
}

func TestBareLabelErrors(t *testing.T) {
	_, err := Parse(">\nnotcontent\n")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "Bare Label") {
		t.Fatalf("error = %v", err)
	}
}

func TestArrayScalarContent(t *testing.T) {
	got, err := Parse("-\n:hello\n:42\n")
	if err != nil {
		t.Fatal(err)
	}
	want := []any{"hello", int64(42)}
	if !valuesEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestArrayObjectElement(t *testing.T) {
	got, err := Parse("-\nkey:val\n")
	if err != nil {
		t.Fatal(err)
	}
	want := []any{map[string]any{"key": "val"}}
	if !valuesEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
