package xaiop

import (
	"strings"
	"testing"
)

func TestAmpDeleteKeyCursorUnchanged(t *testing.T) {
	got, err := Parse(wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"b": map[string]any{"y": int64(2), "z": int64(3)}}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
}

func TestAmpDeleteNestedDeepestOnly(t *testing.T) {
	got, err := Parse(wire(">", ">a", ">b", "x:1", "y:2", ".", ">c", "z:1", "&a>b", "keep:9"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"a":    map[string]any{},
		"c":    map[string]any{"z": int64(1), "keep": int64(9)},
	}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
}

func TestAmpDeleteEmptyParentRemains(t *testing.T) {
	got, err := Parse(wire(">", ">a", ">b", "x:1", ".", ">keep", "v:1", "&a>b"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"a": map[string]any{}, "keep": map[string]any{"v": int64(1)}}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
}

func TestAmpDeleteMissingNoop(t *testing.T) {
	cases := []string{
		wire(">", ">a", "x:1", "&missing"),
		wire(">", ">a", "x:1", "&a>nope>z"),
		wire("&ghost", ">", "x:1"),
	}
	wants := []any{
		map[string]any{"a": map[string]any{"x": int64(1)}},
		map[string]any{"a": map[string]any{"x": int64(1)}},
		map[string]any{"x": int64(1)},
	}
	for i, src := range cases {
		got, err := Parse(src)
		if err != nil {
			t.Fatalf("case %d: %v", i, err)
		}
		if !valuesEqual(got, wants[i]) {
			t.Fatalf("case %d: got %#v want %#v", i, got, wants[i])
		}
	}
}

func TestAmpDeleteThenRecreate(t *testing.T) {
	got, err := Parse(wire(">", ">a", "old:1", ".", ">b", "t:1", "&a", ".", ">a", "new:2"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"b": map[string]any{"t": int64(1)},
		"a": map[string]any{"new": int64(2)},
	}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
}

func TestAmpDeleteMultiple(t *testing.T) {
	got, err := Parse(wire(
		">", ">a", "x:1", ".", ">b", "y:1", ".", ">c", "z:1", "&a", ".", ">d", "w:1", "&b",
	))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"c": map[string]any{"z": int64(1)},
		"d": map[string]any{"w": int64(1)},
	}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
	got2, err := Parse(wire(">", ">a", "x:1", ".", ">b", "y:1", ".", ">c", "z:1", "&a", "&b"))
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got2, map[string]any{"c": map[string]any{"z": int64(1)}}) {
		t.Fatalf("got2 %#v", got2)
	}
}

func TestAmpDeleteCursorChainForbidden(t *testing.T) {
	for _, src := range []string{
		wire(">", ">a", "x:1", "&a"),
		wire(">", ">a", ">b", "x:1", "&a"),
	} {
		_, err := Parse(src)
		if err == nil || !strings.Contains(err.Error(), "Cursor chain") {
			t.Fatalf("expected Cursor chain error, got %v", err)
		}
	}
	got, err := Parse(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a"))
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"b": map[string]any{"y": int64(1)}}) {
		t.Fatalf("got %#v", got)
	}
}

func TestAmpDeleteDotThenOk(t *testing.T) {
	got, err := Parse(wire(">", ">a", "x:1", ".", "&a", ">", "z:1"))
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"z": int64(1)}) {
		t.Fatalf("got %#v", got)
	}
}

func TestAmpDeleteArrayWhole(t *testing.T) {
	got, err := Parse(wire(">", ">items-", ":a", ":b", ".", ">keep", "v:1", "&items"))
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"keep": map[string]any{"v": int64(1)}}) {
		t.Fatalf("got %#v", got)
	}
}

func TestAmpDeleteIndexLikePathNoop(t *testing.T) {
	got, err := Parse(wire(">", ">items-", ":a", ":b", ".", "&items>0"))
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"items": []any{"a", "b"}}) {
		t.Fatalf("got %#v", got)
	}
}

func TestAmpDeleteNoTypedNullLeft(t *testing.T) {
	got, err := Parse(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a"))
	if err != nil {
		t.Fatal(err)
	}
	m := got.(map[string]any)
	if _, ok := m["a"]; ok {
		t.Fatalf("a should be absent, got %#v", got)
	}
}

func TestAmpContentNullNotDelete(t *testing.T) {
	got, err := Parse(wire(">", "a:null"))
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"a": nil}) {
		t.Fatalf("got %#v", got)
	}
}

func TestEncodeRejectsAmpKey(t *testing.T) {
	_, err := Encode(map[string]any{"&a": int64(1)}, EncodeOptions{DotPolicy: "none", TrailingNewline: true})
	if err == nil {
		t.Fatal("expected encode error")
	}
	if _, ok := err.(*EncodeError); !ok {
		t.Fatalf("want EncodeError, got %T %v", err, err)
	}
}

func TestAmpLiveEqualsSync(t *testing.T) {
	text := wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3")
	live := NewLiveParser()
	live.FeedText(text)
	got, err := live.Value()
	if err != nil {
		t.Fatal(err)
	}
	want, err := Parse(text)
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, want) {
		t.Fatalf("live %#v want %#v", got, want)
	}
}
