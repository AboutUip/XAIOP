package xaiop

import (
	"strings"
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/compat"
)

const missingLeaveArray = ">\n>tags-\n:alpha\n:beta\n>users-\n>\nid:1\nname:alice\n<\n"
const locateBase = ">\n>meta\na:1\n.\n"

func allBut(disabled string) map[string]bool {
	out := map[string]bool{}
	for _, id := range compat.FixIDs {
		out[id] = id != disabled
	}
	return out
}

func parseCompatTrue(t *testing.T, source string) any {
	t.Helper()
	got, err := ParseWithOptions(source, ParseOptions{Compat: compat.Resolve(true)})
	if err != nil {
		t.Fatal(err)
	}
	return Materialize(got)
}

func TestCompatEightFixIDs(t *testing.T) {
	if len(compat.FixIDs) != 8 {
		t.Fatalf("want 8, got %d", len(compat.FixIDs))
	}
	p := compat.NewPolicy(nil)
	snap := p.Snapshot()
	for _, id := range compat.FixIDs {
		if !snap[id] {
			t.Fatalf("%s default false", id)
		}
	}
}

func TestCompatStrictValidUnchanged(t *testing.T) {
	for _, src := range []string{">\nx:1", "-\n:a\n:b"} {
		strict, err := Parse(src)
		if err != nil {
			t.Fatal(err)
		}
		compatV, err := ParseWithOptions(src, ParseOptions{Compat: compat.Resolve(true)})
		if err != nil {
			t.Fatal(err)
		}
		if !valuesEqual(Materialize(strict), Materialize(compatV)) {
			t.Fatalf("mismatch for %q", src)
		}
	}
}

func TestCompatForcedRoot(t *testing.T) {
	source := ">meta\nname:demo\n.\n>characters-\n>\nname:alice\n<\n"
	_, err := Parse(source)
	if err == nil {
		t.Fatal("strict should fail")
	}
	got := parseCompatTrue(t, source)
	want := map[string]any{
		"meta":       map[string]any{"name": "demo"},
		"characters": []any{map[string]any{"name": "alice"}},
	}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v", got)
	}

	only := map[string]bool{}
	for _, id := range compat.FixIDs {
		only[id] = false
	}
	only[compat.ForcedRoot] = true
	frag, err := ParseWithOptions(">meta\nname:demo", ParseOptions{Compat: only})
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(Materialize(frag), map[string]any{"meta": map[string]any{"name": "demo"}}) {
		t.Fatalf("forcedRoot alone %#v", frag)
	}
}

func TestCompatRewriteBareNameArray(t *testing.T) {
	source := ">\n>characters-\n>\nname:江辞\naliases-\n:绝世神医\n:楚家大少\n<\ngender:男\n<\n"
	_, err := Parse(source)
	if err == nil || !strings.Contains(err.Error(), "Bare Label") {
		t.Fatalf("strict want Bare Label, got %v", err)
	}
	got := parseCompatTrue(t, source)
	want := map[string]any{
		"characters": []any{map[string]any{
			"name":    "江辞",
			"aliases": []any{"绝世神医", "楚家大少"},
			"gender":  "男",
		}},
	}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
	_, err = ParseWithOptions(">\ntags-\n:a", ParseOptions{Compat: allBut(compat.RewriteBareNameArray)})
	if err == nil {
		t.Fatal("off should fail")
	}
}

func TestCompatRewriteEnterLine(t *testing.T) {
	source := ">  \nid:wideflat-bench  \nok:true\n"
	_, err := Parse(source)
	if err == nil {
		t.Fatal("strict should fail")
	}
	got := parseCompatTrue(t, source)
	if !valuesEqual(got, map[string]any{"id": "wideflat-bench", "ok": true}) {
		t.Fatalf("got %#v", got)
	}
	glued := ">\n>shard_index:1\n>shard_total:3\n>characters-\n>\nname:江辞\n<\n"
	got2 := parseCompatTrue(t, glued)
	want := map[string]any{
		"shard_index": int64(1),
		"shard_total": int64(3),
		"characters":  []any{map[string]any{"name": "江辞"}},
	}
	if !valuesEqual(got2, want) {
		t.Fatalf("glued %#v", got2)
	}
}

func TestCompatIgnoreBareLeaveAtRoot(t *testing.T) {
	source := ">\n>beats-\n>\nkind:dialogue\ntext:hi\n<\n.\n<\n>\nid:23-1\nlocation:神医大会\n"
	_, err := Parse(source)
	if err == nil || !strings.Contains(err.Error(), "< at Root") {
		t.Fatalf("strict want < at Root, got %v", err)
	}
	got := parseCompatTrue(t, source)
	want := map[string]any{
		"beats":    []any{map[string]any{"kind": "dialogue", "text": "hi"}},
		"id":       "23-1",
		"location": "神医大会",
	}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
}

func TestCompatPopAndRetry(t *testing.T) {
	_, err := Parse(missingLeaveArray)
	if err == nil {
		t.Fatal("strict should fail")
	}
	got := parseCompatTrue(t, missingLeaveArray)
	want := map[string]any{
		"tags":  []any{"alpha", "beta"},
		"users": []any{map[string]any{"id": int64(1), "name": "alice"}},
	}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
	_, err = ParseWithOptions(missingLeaveArray, ParseOptions{Compat: allBut(compat.PopAndRetry)})
	if err == nil {
		t.Fatal("popAndRetry off should fail")
	}
}

func TestCompatLocatePathTrim(t *testing.T) {
	source := locateBase + "= meta\nb:2\n"
	_, err := Parse(source)
	if err == nil {
		t.Fatal("strict should fail")
	}
	got := parseCompatTrue(t, source)
	if !valuesEqual(got, map[string]any{"meta": map[string]any{"a": int64(1), "b": int64(2)}}) {
		t.Fatalf("got %#v", got)
	}
}

func TestCompatLocatePathStripSpaces(t *testing.T) {
	source := ">\n>child\n>inner\na:1\n.\n=child > inner\nb:2\n"
	_, err := Parse(source)
	if err == nil {
		t.Fatal("strict should fail")
	}
	got := parseCompatTrue(t, source)
	want := map[string]any{"child": map[string]any{"inner": map[string]any{"a": int64(1), "b": int64(2)}}}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
}

func TestCompatLocatePathArraySuffix(t *testing.T) {
	source := ">\n>siblings-\n>\ni:1\n<\n.\n=siblings-\n>\ni:2\nlabel:S-2\n<\n"
	_, err := Parse(source)
	if err == nil {
		t.Fatal("strict should fail")
	}
	got := parseCompatTrue(t, source)
	want := map[string]any{
		"siblings": []any{
			map[string]any{"i": int64(1)},
			map[string]any{"i": int64(2), "label": "S-2"},
		},
	}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
}

func TestSymbolKeysRoundTrip(t *testing.T) {
	esc := LabelEscapeIntroducer
	cases := map[string]any{
		"#k": int64(1), "@m": int64(2), ">test": "test",
		"<pop": true, "=eq": nil, "!bang": int64(0), "&amp": "x",
		esc + "hello": int64(3),
	}
	for key, val := range cases {
		wire, err := Encode(map[string]any{key: val}, EncodeOptions{
			DotPolicy: "none", SymbolKeys: true, TrailingNewline: true,
		})
		if err != nil {
			t.Fatalf("%q encode: %v", key, err)
		}
		got, err := ParseWithOptions(wire, ParseOptions{SymbolKeys: true})
		if err != nil {
			t.Fatalf("%q parse: %v", key, err)
		}
		if !valuesEqual(got, map[string]any{key: val}) {
			t.Fatalf("%q got %#v wire=%q", key, got, wire)
		}
	}
}

func TestSymbolKeysCoexistWithHashAnno(t *testing.T) {
	esc := LabelEscapeIntroducer
	wire := ">\n# human note\n" + esc + "#k:1\na:2\n"
	got, err := ParseWithOptions(wire, ParseOptions{SymbolKeys: true})
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(got, map[string]any{"#k": int64(1), "a": int64(2)}) {
		t.Fatalf("got %#v", got)
	}
}
