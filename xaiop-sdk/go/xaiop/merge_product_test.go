package xaiop

import (
	"testing"
)

func TestMergeJSONDeepRecurse(t *testing.T) {
	base := map[string]any{"meta": map[string]any{"name": "x", "n": int64(1)}, "tags": []any{"a"}}
	overlay := map[string]any{"meta": map[string]any{"n": int64(2), "extra": true}, "tags": []any{"b"}}
	ow, err := MergeJSON(base, overlay, MergeOverwrite)
	if err != nil {
		t.Fatal(err)
	}
	wantOW := map[string]any{
		"meta": map[string]any{"name": "x", "n": int64(2), "extra": true},
		"tags": []any{"b"},
	}
	if !valuesEqual(ow, wantOW) {
		t.Fatalf("overwrite %#v", ow)
	}
	kp, err := MergeJSON(base, overlay, MergeKeep)
	if err != nil {
		t.Fatal(err)
	}
	wantKP := map[string]any{
		"meta": map[string]any{"name": "x", "n": int64(1), "extra": true},
		"tags": []any{"a"},
	}
	if !valuesEqual(kp, wantKP) {
		t.Fatalf("keep %#v", kp)
	}
}

func TestMergeJSONDoesNotMutate(t *testing.T) {
	base := map[string]any{"a": map[string]any{"x": int64(1)}}
	overlay := map[string]any{"a": map[string]any{"y": int64(2)}}
	out, err := MergeJSON(base, overlay, MergeOverwrite)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(out, map[string]any{"a": map[string]any{"x": int64(1), "y": int64(2)}}) {
		t.Fatalf("out %#v", out)
	}
	if !valuesEqual(base, map[string]any{"a": map[string]any{"x": int64(1)}}) {
		t.Fatalf("base mutated %#v", base)
	}
	if !valuesEqual(overlay, map[string]any{"a": map[string]any{"y": int64(2)}}) {
		t.Fatalf("overlay mutated %#v", overlay)
	}
}

func TestMergeToJSON(t *testing.T) {
	overlayWire, err := Encode(map[string]any{"b": int64(2), "a": int64(9)}, EncodeOptions{DotPolicy: "none", TrailingNewline: true})
	if err != nil {
		t.Fatal(err)
	}
	got, err := MergeToJSON(map[string]any{"a": int64(1), "c": int64(3)}, overlayWire, MergeOptions{Conflict: MergeOverwrite})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"a": int64(9), "c": int64(3), "b": int64(2)}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
	kept, err := MergeToJSON(map[string]any{"a": int64(1), "c": int64(3)}, overlayWire, MergeOptions{Conflict: MergeKeep})
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(kept, map[string]any{"a": int64(1), "c": int64(3), "b": int64(2)}) {
		t.Fatalf("kept %#v", kept)
	}
}

func TestMergeToXAIOPRoundTrip(t *testing.T) {
	out, err := MergeToXAIOP(map[string]any{"a": int64(1)}, ">\nb:2\n", MergeOptions{Conflict: MergeOverwrite})
	if err != nil {
		t.Fatal(err)
	}
	got, err := Parse(out)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"a": int64(1), "b": int64(2)}) {
		t.Fatalf("got %#v", got)
	}
}

func TestEngineInjectXAIOP(t *testing.T) {
	e := NewEngine(false)
	id, err := e.UploadJSON(map[string]any{"a": int64(1), "nested": map[string]any{"x": int64(1)}}, EncodeOptions{DotPolicy: "none"})
	if err != nil {
		t.Fatal(err)
	}
	wire, err := Encode(map[string]any{"nested": map[string]any{"y": int64(2)}, "b": int64(3)}, EncodeOptions{DotPolicy: "none", TrailingNewline: true})
	if err != nil {
		t.Fatal(err)
	}
	result, err := e.InjectXAIOP(id, wire, MergeOverwrite, InjectFormatOptions{})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"a": int64(1), "nested": map[string]any{"x": int64(1), "y": int64(2)}, "b": int64(3)}
	if !valuesEqual(result, want) {
		t.Fatalf("result %#v", result)
	}
	stored, err := e.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(stored, want) {
		t.Fatalf("store %#v", stored)
	}
}

func TestEngineInjectJSONKeep(t *testing.T) {
	e := NewEngine(false)
	id, err := e.UploadJSON(map[string]any{"a": int64(1), "b": int64(2)}, EncodeOptions{DotPolicy: "none"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = e.InjectJSON(id, map[string]any{"a": int64(9), "c": int64(3)}, MergeKeep, InjectFormatOptions{})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := e.Get(id)
	if !valuesEqual(got, map[string]any{"a": int64(1), "b": int64(2), "c": int64(3)}) {
		t.Fatalf("got %#v", got)
	}
}

func TestEngineInjectUnknownID(t *testing.T) {
	e := NewEngine(false)
	_, err := e.InjectJSON("missing", map[string]any{"a": int64(1)}, MergeOverwrite, InjectFormatOptions{})
	if err == nil {
		t.Fatal("expected unknown id error")
	}
}

func TestMergeInvalidConflict(t *testing.T) {
	_, err := MergeJSON(map[string]any{"a": int64(1)}, map[string]any{"a": int64(2)}, "nope")
	if err == nil {
		t.Fatal("expected invalid conflict")
	}
}
