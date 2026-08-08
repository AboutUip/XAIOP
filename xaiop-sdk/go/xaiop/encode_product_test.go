package xaiop

import (
	"math"
	"strings"
	"testing"
)

func encNone(v any) (string, error) {
	return Encode(v, EncodeOptions{DotPolicy: "none", TrailingNewline: true, KeyOrder: "insertion"})
}

func TestEncodeRoundTripScalars(t *testing.T) {
	value := map[string]any{
		"i": int64(0), "j": int64(-7), "f": 1.5, "g": -2.25,
		"t": true, "f2": false, "s": "hello", "empty": "",
	}
	wire, err := encNone(value)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, value) {
		t.Fatalf("got %#v want %#v", got, value)
	}
}

func TestEncodeForcedStrings(t *testing.T) {
	value := map[string]any{
		"a": "5", "b": "1.5", "d": "true", "e": "false", "i": "null",
	}
	wire, err := encNone(value)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(wire, "a: 5") || !strings.Contains(wire, "d: true") || !strings.Contains(wire, "i: null") {
		t.Fatalf("forced markers missing: %q", wire)
	}
	got, err := Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, value) {
		t.Fatalf("got %#v", got)
	}
}

func TestEncodePlainStringsUnforced(t *testing.T) {
	wire, err := encNone(map[string]any{"s": "hi", "t": "1e3x", "u": "NaN"})
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range []string{"s:hi", "t:1e3x", "u:NaN"} {
		if !strings.Contains(wire, line) {
			t.Fatalf("missing %q in %q", line, wire)
		}
	}
}

func TestEncodeNonFiniteRejected(t *testing.T) {
	for _, v := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		_, err := encNone(map[string]any{"a": v})
		if err == nil {
			t.Fatalf("expected reject for %v", v)
		}
	}
}

func TestEncodeLeadingSpaceRejected(t *testing.T) {
	_, err := encNone(map[string]any{"s": " spaced"})
	if err == nil || !strings.Contains(err.Error(), "SPACE") {
		t.Fatalf("expected SPACE error, got %v", err)
	}
}

func TestEncodeCRLFRejected(t *testing.T) {
	_, err := encNone(map[string]any{"s": "a\nb"})
	if err == nil {
		t.Fatal("expected CRLF reject")
	}
}

func TestEncodeInvalidKeyRejected(t *testing.T) {
	_, err := encNone(map[string]any{"a b": int64(1)})
	if err == nil {
		t.Fatal("expected invalid label")
	}
}

func TestEncodeArrayRoot(t *testing.T) {
	value := []any{int64(1), "x", map[string]any{"a": int64(1)}}
	wire, err := Encode(value, EncodeOptions{Root: "array", DotPolicy: "none", TrailingNewline: true})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(wire, "-\n") {
		t.Fatalf("want array root, got %q", wire)
	}
	got, err := Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, value) {
		t.Fatalf("got %#v", got)
	}
}

func TestEncodeFragmentRoot(t *testing.T) {
	value := map[string]any{"a": int64(1), "b": map[string]any{"x": int64(2)}}
	wire, err := Encode(value, EncodeOptions{Root: "fragment", DotPolicy: "none", TrailingNewline: true, KeyOrder: "sorted"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.HasPrefix(wire, ">") {
		t.Fatalf("fragment should not start with >, got %q", wire)
	}
	got, err := Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	f, ok := got.(*Fragment)
	if !ok {
		t.Fatalf("want Fragment, got %T", got)
	}
	if !valuesEqual(f.Entries, value) {
		t.Fatalf("entries %#v", f.Entries)
	}
}

func TestEncodeNestedRoundTrip(t *testing.T) {
	value := map[string]any{
		"meta":  map[string]any{"name": "test", "count": int64(2)},
		"items": []any{int64(1), map[string]any{"k": "v"}, []any{"a", "b"}},
	}
	wire, err := Encode(value, defaultEncodeOptions())
	if err != nil {
		t.Fatal(err)
	}
	got, err := Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, value) {
		t.Fatalf("got %#v want %#v", got, value)
	}
}

func TestEncodeESFloatToken(t *testing.T) {
	wire, err := encNone(map[string]any{"g": 1e-6})
	if err != nil {
		t.Fatal(err)
	}
	// Must match Node Number#toString → "0.000001" (not 1e-06)
	if !strings.Contains(wire, "g:0.000001") {
		t.Fatalf("ES float token missing: %q", wire)
	}
}

func TestEncodeSymbolKeysHelpers(t *testing.T) {
	if !KeyNeedsSymbolEscape("#k") || !KeyNeedsSymbolEscape("@k") {
		t.Fatal("operator heads need escape")
	}
	if KeyNeedsSymbolEscape("normal") {
		t.Fatal("normal should not need escape")
	}
	esc := LabelEscapeIntroducer
	if EncodeWireLabel("#k", true) != esc+"#k" {
		t.Fatal("encode wire label")
	}
	if DecodeWireLabel(esc+"#k", true) != "#k" {
		t.Fatal("decode wire label")
	}
	_, err := encNone(map[string]any{"#k": int64(1)})
	if err == nil {
		t.Fatal("symbolKeys off should reject #k")
	}
	wire, err := Encode(map[string]any{"#k": int64(1)}, EncodeOptions{
		DotPolicy: "none", SymbolKeys: true, TrailingNewline: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(wire, esc+"#k:1") {
		t.Fatalf("escaped label missing: %q", wire)
	}
}
