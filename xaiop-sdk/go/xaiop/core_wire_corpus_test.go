package xaiop

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type corpusFile struct {
	Cases []corpusCase `json:"cases"`
}

type corpusCase struct {
	ID         string          `json:"id"`
	Kind       string          `json:"kind"`
	Wire       string          `json:"wire"`
	File       string          `json:"file"`
	ExpectFile string          `json:"expect_file"`
	Fragment   bool            `json:"fragment"`
	Chunks     []string        `json:"chunks"`
	Value      json.RawMessage `json:"value"`
	Root       string          `json:"root"`
	KeyOrder   string          `json:"key_order"`
	Expect     json.RawMessage `json:"expect"`
	ExpectWire string          `json:"expect_wire"`
}

func coreWireDir(t *testing.T) string {
	t.Helper()
	// xaiop-sdk/go/xaiop → xaiop-sdk/conformance/core-wire
	dir := filepath.Join("..", "..", "conformance", "core-wire")
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		t.Fatalf("core-wire dir not found at %s", dir)
	}
	return dir
}

func loadCorpus(t *testing.T) []corpusCase {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(coreWireDir(t), "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var doc corpusFile
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	return doc.Cases
}

func TestCoreWireCorpus(t *testing.T) {
	for _, c := range loadCorpus(t) {
		c := c
		t.Run(c.ID, func(t *testing.T) {
			switch c.Kind {
			case "parse":
				parsed, err := Parse(c.Wire)
				if err != nil {
					t.Fatal(err)
				}
				_, isFrag := parsed.(*Fragment)
				if isFrag != c.Fragment {
					t.Fatalf("fragment=%v want %v", isFrag, c.Fragment)
				}
				var expect any
				if err := json.Unmarshal(c.Expect, &expect); err != nil {
					t.Fatal(err)
				}
				if !valuesEqual(Materialize(parsed), expect) {
					t.Fatalf("tree mismatch\ngot %#v\nwant %#v", Materialize(parsed), expect)
				}

			case "parse_file":
				dir := coreWireDir(t)
				wireB, err := os.ReadFile(filepath.Join(dir, c.File))
				if err != nil {
					t.Fatal(err)
				}
				expB, err := os.ReadFile(filepath.Join(dir, c.ExpectFile))
				if err != nil {
					t.Fatal(err)
				}
				var expect any
				if err := json.Unmarshal(expB, &expect); err != nil {
					t.Fatal(err)
				}
				parsed, err := Parse(string(wireB))
				if err != nil {
					t.Fatal(err)
				}
				if !valuesEqual(Materialize(parsed), expect) {
					t.Fatalf("complex mismatch")
				}

			case "parse_error":
				_, err := Parse(c.Wire)
				if err == nil {
					t.Fatal("expected syntax error")
				}
				if _, ok := err.(*SyntaxError); !ok {
					t.Fatalf("want SyntaxError, got %T %v", err, err)
				}

			case "live":
				live := NewLiveParser()
				for _, chunk := range c.Chunks {
					live.FeedText(chunk)
				}
				parsed, err := live.Value()
				if err != nil {
					t.Fatal(err)
				}
				var expect any
				if err := json.Unmarshal(c.Expect, &expect); err != nil {
					t.Fatal(err)
				}
				if !valuesEqual(Materialize(parsed), expect) {
					t.Fatalf("live mismatch")
				}

			case "encode":
				var value any
				if err := json.Unmarshal(c.Value, &value); err != nil {
					t.Fatal(err)
				}
				root := c.Root
				if root == "" {
					root = "auto"
				}
				keyOrder := c.KeyOrder
				if keyOrder == "" {
					keyOrder = "sorted"
				}
				wire, err := Encode(value, EncodeOptions{Root: root, TrailingNewline: true, KeyOrder: keyOrder})
				if err != nil {
					t.Fatal(err)
				}
				if wire != c.ExpectWire {
					t.Fatalf("wire mismatch\ngot %q\nwant %q", wire, c.ExpectWire)
				}

			case "encode_error":
				var value any
				if err := json.Unmarshal(c.Value, &value); err != nil {
					t.Fatal(err)
				}
				root := c.Root
				if root == "" {
					root = "auto"
				}
				_, err := Encode(value, EncodeOptions{Root: root, TrailingNewline: true})
				if err == nil {
					t.Fatal("expected encode error")
				}
				if _, ok := err.(*EncodeError); !ok {
					t.Fatalf("want EncodeError, got %T", err)
				}

			case "roundtrip":
				var value any
				if err := json.Unmarshal(c.Value, &value); err != nil {
					t.Fatal(err)
				}
				keyOrder := c.KeyOrder
				if keyOrder == "" {
					keyOrder = "sorted"
				}
				wire, err := Encode(value, EncodeOptions{TrailingNewline: true, KeyOrder: keyOrder})
				if err != nil {
					t.Fatal(err)
				}
				parsed, err := Parse(wire)
				if err != nil {
					t.Fatal(err)
				}
				if !valuesEqual(Materialize(parsed), value) {
					t.Fatalf("roundtrip mismatch")
				}

			default:
				t.Fatalf("unknown kind %s", c.Kind)
			}
		})
	}
}
