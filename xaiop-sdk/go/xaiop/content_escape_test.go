package xaiop

import (
	"strings"
	"testing"
)

func TestContentRoundTripLfCrCrlfBackslash(t *testing.T) {
	cases := []map[string]any{
		{"t": "hello\nworld"},
		{"t": "a\rb"},
		{"t": "a\r\nb"},
		{"t": "a\\b"},
		{"t": "a\\nb"},
	}
	for _, value := range cases {
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
}

func TestContentLiteralBackslashNIsNotNewline(t *testing.T) {
	twoChar := "a" + `\` + "n" + "b"
	wire, err := encNone(map[string]any{"t": twoChar})
	if err != nil {
		t.Fatal(err)
	}
	got, err := Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	m := got.(map[string]any)
	if m["t"] != twoChar {
		t.Fatalf("got %q", m["t"])
	}
	if m["t"] == "a\nb" {
		t.Fatal("literal \\n collapsed to newline")
	}
}

func TestContentRealNewlineDistinctOnWire(t *testing.T) {
	nl, err := encNone(map[string]any{"t": "a\nb"})
	if err != nil {
		t.Fatal(err)
	}
	lit, err := encNone(map[string]any{"t": "a\\nb"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(nl, `t:a\nb`) {
		t.Fatalf("newline wire %q", nl)
	}
	if !strings.Contains(lit, `t:a\\nb`) {
		t.Fatalf("literal wire %q", lit)
	}
	if nl == lit {
		t.Fatal("wires should differ")
	}
}

func TestContentEmptyNewlineUnicodeArrayColon(t *testing.T) {
	for _, value := range []any{
		map[string]any{"t": ""},
		map[string]any{"t": "\n"},
		map[string]any{"t": "\n\n"},
		map[string]any{"t": "你好\n世界"},
		[]any{"line1\nline2"},
		map[string]any{"t": "a:b\nc"},
		map[string]any{"t": "\\"},
		map[string]any{"t": "\\\\"},
		map[string]any{"t": "\nstart"},
		map[string]any{"t": "end\n"},
		map[string]any{"t": "a\\\nb"},
		map[string]any{"t": "a\tb"},
	} {
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
}

func TestContentTypingAfterUnescape(t *testing.T) {
	v, err := Parse(">\nn:1\n")
	if err != nil {
		t.Fatal(err)
	}
	if v.(map[string]any)["n"] != int64(1) && v.(map[string]any)["n"] != 1 {
		t.Fatalf("int typing %#v", v)
	}
	v, err = Parse(">\nf:true\n")
	if err != nil {
		t.Fatal(err)
	}
	if v.(map[string]any)["f"] != true {
		t.Fatal(v)
	}
	v, err = Parse(">\nz:null\n")
	if err != nil {
		t.Fatal(err)
	}
	if v.(map[string]any)["z"] != nil {
		t.Fatal(v)
	}
	v, err = Parse(">\ns:1\\n2\n")
	if err != nil {
		t.Fatal(err)
	}
	s, ok := v.(map[string]any)["s"].(string)
	if !ok || s != "1\n2" {
		t.Fatalf("got %#v", v)
	}
}

func TestContentForcedStringThenUnescape(t *testing.T) {
	v, err := Parse(">\ns: hello\\nworld\n")
	if err != nil {
		t.Fatal(err)
	}
	if v.(map[string]any)["s"] != "hello\nworld" {
		t.Fatal(v)
	}
	v, err = Parse(">\ns: true\\n\n")
	if err != nil {
		t.Fatal(err)
	}
	if v.(map[string]any)["s"] != "true\n" {
		t.Fatal(v)
	}
	v, err = Parse(">\ns:true\n")
	if err != nil {
		t.Fatal(err)
	}
	if v.(map[string]any)["s"] != true {
		t.Fatal(v)
	}
}

func TestContentUnknownEscapeAndTrailingBackslash(t *testing.T) {
	for _, wire := range []string{">\na:x\\ty\n", ">\na:x\\xy\n", ">\na:x\\Ny\n", ">\na:x\\0y\n"} {
		_, err := Parse(wire)
		if err == nil || !strings.Contains(err.Error(), "unknown Content escape") {
			t.Fatalf("%q → %v", wire, err)
		}
	}
	_, err := Parse(">\na:end\\\n")
	if err == nil || !strings.Contains(err.Error(), "incomplete Content escape") {
		t.Fatalf("dangling: %v", err)
	}
}

func TestContentPhysicalLfStillNewLine(t *testing.T) {
	if _, err := Parse(">\na:hello\nworld\n"); err == nil {
		t.Fatal("expected syntax error")
	}
}

func TestContentCompleteTrailingBackslash(t *testing.T) {
	v, err := Parse(">\na:end\\\\\n")
	if err != nil {
		t.Fatal(err)
	}
	if v.(map[string]any)["a"] != `end\` {
		t.Fatal(v)
	}
}

func TestContentEncodeKeepsLfInToken(t *testing.T) {
	wire, err := encNone(map[string]any{"t": "a\nb"})
	if err != nil {
		t.Fatal(err)
	}
	var content string
	for _, line := range strings.Split(wire, "\n") {
		if strings.HasPrefix(line, "t:") {
			content = line
		}
	}
	if content != `t:a\nb` {
		t.Fatalf("got %q", content)
	}
}

func TestContentLiveParser(t *testing.T) {
	v, err := Parse(">\na:\\nhey\n")
	if err != nil {
		t.Fatal(err)
	}
	if v.(map[string]any)["a"] != "\nhey" {
		t.Fatal(v)
	}
	wire, err := encNone(map[string]any{"t": "p1\np2"})
	if err != nil {
		t.Fatal(err)
	}
	got, err := NewLiveParser().FeedText(wire).Value()
	if err != nil {
		t.Fatal(err)
	}
	if got.(map[string]any)["t"] != "p1\np2" {
		t.Fatal(got)
	}
}

func TestContentFeedLine(t *testing.T) {
	got, err := NewLiveParser().FeedLine(">").FeedLine(`t:a\nb`).Value()
	if err != nil {
		t.Fatal(err)
	}
	if got.(map[string]any)["t"] != "a\nb" {
		t.Fatal(got)
	}
}

func TestContentEmojiConsecutiveUnknownQuote(t *testing.T) {
	wire, err := encNone(map[string]any{"t": "🙂\n🎉"})
	if err != nil {
		t.Fatal(err)
	}
	got, err := Parse(wire)
	if err != nil {
		t.Fatal(err)
	}
	if got.(map[string]any)["t"] != "🙂\n🎉" {
		t.Fatal(got)
	}
	v, err := Parse(">\ns:a\\n\\nb\n")
	if err != nil {
		t.Fatal(err)
	}
	if v.(map[string]any)["s"] != "a\n\nb" {
		t.Fatal(v)
	}
	if _, err := Parse(">\na:x\\\"y\n"); err == nil {
		t.Fatal("expected unknown escape")
	}
}

func TestContentMergeOverlay(t *testing.T) {
	got, err := MergeToJSON(map[string]any{"a": int64(1)}, ">\ns:hello\\nworld\n", MergeOptions{})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"a": int64(1), "s": "hello\nworld"}
	if !valuesEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
}
