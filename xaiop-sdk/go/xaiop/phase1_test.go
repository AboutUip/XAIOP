package xaiop

import (
	"strings"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/compat"
)

func TestCompatPolicyDefaults(t *testing.T) {
	p := compat.NewPolicy(nil)
	snap := p.Snapshot()
	if len(snap) != 8 {
		t.Fatalf("want 8 fixes, got %d", len(snap))
	}
	for _, id := range compat.FixIDs {
		if !snap[id] {
			t.Fatalf("%s should default true", id)
		}
	}
}

func TestCompatResolve(t *testing.T) {
	if compat.Resolve(false) != nil {
		t.Fatal("false → nil")
	}
	if compat.Resolve(true) == nil {
		t.Fatal("true → snapshot")
	}
}

func TestEncodeProductPhases(t *testing.T) {
	wire, err := Encode(map[string]any{"a": int64(1), "b": int64(2)}, defaultEncodeOptions())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(wire, ".\n") {
		t.Fatalf("expected phase separator, wire=%q", wire)
	}
	got, err := Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"a": int64(1), "b": int64(2)}) {
		t.Fatalf("got %v", got)
	}
}

func TestEncodeRelativeNoneSinglePhase(t *testing.T) {
	wire, err := Encode(map[string]any{"a": int64(1), "b": int64(2)}, EncodeOptions{
		Style: "relative", DotPolicy: "none", TrailingNewline: true, KeyOrder: "sorted",
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(wire, ".\n") {
		t.Fatalf("did not expect phase dots, wire=%q", wire)
	}
}

func TestMergeJSONOverwriteKeep(t *testing.T) {
	base := map[string]any{"a": int64(1), "b": int64(2)}
	overlay := map[string]any{"b": int64(9), "c": int64(3)}
	ow, err := MergeJSON(base, overlay, MergeOverwrite)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(ow, map[string]any{"a": int64(1), "b": int64(9), "c": int64(3)}) {
		t.Fatalf("overwrite = %v", ow)
	}
	kp, err := MergeJSON(base, overlay, MergeKeep)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(kp, map[string]any{"a": int64(1), "b": int64(2), "c": int64(3)}) {
		t.Fatalf("keep = %v", kp)
	}
}

func TestEngineUploadGet(t *testing.T) {
	e := NewEngine(false)
	id, err := e.Upload(">\na:1\n")
	if err != nil {
		t.Fatal(err)
	}
	got, err := e.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"a": int64(1)}) {
		t.Fatalf("got %v", got)
	}
	if !e.Has(id) || !e.Delete(id) || e.Has(id) {
		t.Fatal("has/delete")
	}
}
