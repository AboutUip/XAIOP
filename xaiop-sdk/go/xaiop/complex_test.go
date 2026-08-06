package xaiop

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestComplexFixture(t *testing.T) {
	dir := fixtureDir()
	source, err := os.ReadFile(filepath.Join(dir, "complex.xaiop"))
	if err != nil {
		t.Fatal(err)
	}
	expectedBytes, err := os.ReadFile(filepath.Join(dir, "complex.expected.json"))
	if err != nil {
		t.Fatal(err)
	}
	var expected map[string]any
	if err := json.Unmarshal(expectedBytes, &expected); err != nil {
		t.Fatal(err)
	}
	got := Materialize(mustParse(string(source)))
	if !valuesEqual(got, expected) {
		t.Fatalf("parsed value differs from fixture expected JSON")
	}
}
