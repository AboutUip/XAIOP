package xaiop

import (
	"math"
	"strings"
	"testing"
)

func TestRoundtripSimpleObject(t *testing.T) {
	value := map[string]any{"a": int64(1), "b": "x", "c": true, "d": nil}
	wireText, err := Encode(value, defaultEncodeOptions())
	if err != nil {
		t.Fatal(err)
	}
	got, err := Parse(wireText)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, value) {
		t.Fatalf("got %v, want %v", got, value)
	}
}

func TestRoundtripNested(t *testing.T) {
	value := map[string]any{
		"meta": map[string]any{"name": "test", "count": int64(2)},
		"items": []any{int64(1), map[string]any{"k": "v"}, []any{"a", "b"}},
	}
	wireText, err := Encode(value, defaultEncodeOptions())
	if err != nil {
		t.Fatal(err)
	}
	got, err := Parse(wireText)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, value) {
		t.Fatalf("got %v, want %v", got, value)
	}
}

func TestForcedStringEncoding(t *testing.T) {
	value := map[string]any{"a": "5", "b": "true", "c": "null"}
	wireText, err := Encode(value, defaultEncodeOptions())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(wireText, "a: 5") {
		t.Fatalf("wire = %q", wireText)
	}
	got, err := Parse(wireText)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, value) {
		t.Fatalf("got %v, want %v", got, value)
	}
}

func TestArrayRootEncode(t *testing.T) {
	value := []any{int64(1), "x", map[string]any{"a": int64(1)}}
	opts := defaultEncodeOptions()
	opts.Root = "array"
	wireText, err := Encode(value, opts)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(wireText, "-\n") {
		t.Fatalf("wire = %q", wireText)
	}
	got, err := Parse(wireText)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, value) {
		t.Fatalf("got %v, want %v", got, value)
	}
}

func TestFragmentRootEncode(t *testing.T) {
	value := map[string]any{"a": int64(1), "b": map[string]any{"x": int64(2)}}
	opts := defaultEncodeOptions()
	opts.Root = "fragment"
	wireText, err := Encode(value, opts)
	if err != nil {
		t.Fatal(err)
	}
	if strings.HasPrefix(wireText, ">") {
		t.Fatalf("wire = %q", wireText)
	}
	parsed, err := Parse(wireText)
	if err != nil {
		t.Fatal(err)
	}
	f, ok := parsed.(*Fragment)
	if !ok || !f.IsFragment() {
		t.Fatalf("expected fragment, got %T", parsed)
	}
	if !valuesEqual(f.Entries, value) {
		t.Fatalf("entries = %v", f.Entries)
	}
}

func TestNonFiniteRejected(t *testing.T) {
	_, err := Encode(map[string]any{"a": math.NaN()}, defaultEncodeOptions())
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestLeadingSpaceStringRejected(t *testing.T) {
	_, err := Encode(map[string]any{"s": " spaced"}, defaultEncodeOptions())
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "U+0020 SPACE") {
		t.Fatalf("error = %v", err)
	}
}

func TestInvalidKeyRejected(t *testing.T) {
	_, err := Encode(map[string]any{"a b": int64(1)}, defaultEncodeOptions())
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "invalid label") {
		t.Fatalf("error = %v", err)
	}
}
