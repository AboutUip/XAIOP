package xaiop

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func addSeedFiles(f *testing.F) {
	// xaiop-sdk/go/xaiop → xaiop-sdk/conformance/fuzz/seeds
	seedsDir := filepath.Join("..", "..", "conformance", "fuzz", "seeds")
	entries, err := os.ReadDir(seedsDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".xaiop" {
			continue
		}
		b, err := os.ReadFile(filepath.Join(seedsDir, e.Name()))
		if err != nil {
			continue
		}
		f.Add(string(b))
	}
}

// FuzzParse ensures Parse never panics: success or *SyntaxError only.
func FuzzParse(f *testing.F) {
	f.Add(">\nx:1\n")
	f.Add("-\n:a\n:b\n")
	f.Add(">a\nx:1\n")
	f.Add(">\n>a\nx:1\n.\n&a\n")
	f.Add(">\n# note\nx:1\n")
	f.Add("")
	addSeedFiles(f)

	f.Fuzz(func(t *testing.T, data string) {
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("Parse panic: %v", r)
			}
		}()
		_, err := Parse(data)
		if err == nil {
			return
		}
		var se *SyntaxError
		if !errors.As(err, &se) {
			t.Fatalf("unexpected parse error type %T: %v", err, err)
		}
	})
}

// FuzzLiveFeed ensures LiveParser FeedText never panics.
func FuzzLiveFeed(f *testing.F) {
	f.Add(">\nx:1\n")
	f.Add(">\n>a\nx:1\n.\n>b\ny:2\n")
	f.Add("-\n:a\n")
	addSeedFiles(f)

	f.Fuzz(func(t *testing.T, data string) {
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("LiveParser panic: %v", r)
			}
		}()
		lp := NewLiveParser().FeedText(data)
		_, err := lp.Value()
		if err == nil {
			return
		}
		var se *SyntaxError
		if !errors.As(err, &se) {
			t.Fatalf("unexpected live error type %T: %v", err, err)
		}
	})
}
