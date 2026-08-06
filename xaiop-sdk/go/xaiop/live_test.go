package xaiop

import (
	"os"
	"path/filepath"
	"testing"
)

func fixtureDir() string {
	return filepath.Join("..", "..", "conformance", "core-wire")
}

func TestLiveMatchesParseSyncOnComplex(t *testing.T) {
	source, err := os.ReadFile(filepath.Join(fixtureDir(), "complex.xaiop"))
	if err != nil {
		t.Fatal(err)
	}
	expected := Materialize(mustParse(string(source)))
	live := NewLiveParser()
	live.FeedText(string(source))
	got, err := live.Value()
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(Materialize(got), expected) {
		t.Fatal("live value differs from parse_sync")
	}
}

func TestFeedLineMatchesFeedText(t *testing.T) {
	source := ">\n>a\nx:1\n.\n>b\ny:2\n"
	viaText, err := NewLiveParser().FeedText(source).Value()
	if err != nil {
		t.Fatal(err)
	}
	live := NewLiveParser()
	for _, line := range splitLines(source) {
		live.FeedLine(line)
	}
	viaLine, err := live.Value()
	if err != nil {
		t.Fatal(err)
	}
	if !valuesEqual(Materialize(viaLine), Materialize(viaText)) {
		t.Fatal("feed_line differs from feed_text")
	}
}

func TestCursorRestoreLines(t *testing.T) {
	live := NewLiveParser()
	live.FeedText(">\n>a\nx:1\n.\n>b\ny:1\n")
	lines, err := live.CursorRestoreLines()
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 1 || lines[0] != ">b" {
		t.Fatalf("lines = %v, want [>b]", lines)
	}
}

func TestLiveOpsCorpus(t *testing.T) {
	samples := []string{
		">\n>left\n>test\nx:1\n.\n>right\n>test\ny:2\n.\n!test\nz:9\n.",
		">\n>wrap\n>a\n>b\nx:1\n.\n=a>b\nz:3\n.",
		">\n>a\n.\n@b>c\nn:1\n.",
	}
	for _, s := range samples {
		live := NewLiveParser()
		live.FeedText(s)
		lv, err := live.Value()
		if err != nil {
			t.Fatalf("live error for %q: %v", s, err)
		}
		sync := mustParse(s)
		if !valuesEqual(Materialize(lv), Materialize(sync)) {
			t.Fatalf("live != sync for %q", s)
		}
	}
}
