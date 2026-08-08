package types_test

import (
	"testing"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/types"
)

func TestTypeRegistryBasics(t *testing.T) {
	reg := types.NewTypeRegistry()
	ok, err := reg.Register("a", "int", nil)
	if err != nil || !ok {
		t.Fatalf("register: ok=%v err=%v", ok, err)
	}
	ok, err = reg.Register("a", "string", nil)
	if err != nil || ok {
		t.Fatalf("duplicate should reject: ok=%v err=%v", ok, err)
	}
	if !reg.Has("a") {
		t.Fatal("Has(a) expected true")
	}
	entry := reg.Get("a")
	if entry == nil || entry.Type["kind"] != "int" {
		t.Fatalf("Get(a) = %#v", entry)
	}
}

func TestCanonicalizeAndMatch(t *testing.T) {
	arr, err := types.CanonicalizeType("array<string>")
	if err != nil {
		t.Fatal(err)
	}
	if !types.ValueMatchesType([]any{"x", "y"}, arr) {
		t.Fatal("array<string> should match")
	}
	if types.ValueMatchesType([]any{1}, arr) {
		t.Fatal("array<string> should reject ints")
	}
}

func TestTypeCheckerAllow(t *testing.T) {
	reg := types.NewTypeRegistry()
	_, _ = reg.Register("n", "int", nil)
	checker := types.NewTypeChecker(reg, nil)
	_, err := checker.CheckTree(map[string]any{"n": int64(1)}, true)
	if err != nil {
		t.Fatal(err)
	}
	_, err = checker.CheckTree(map[string]any{"n": "bad"}, true)
	if err == nil {
		t.Fatal("expected type error")
	}
}

func TestFreezeObserve(t *testing.T) {
	s, err := types.NewTypeFreezeSession(nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.ObserveTree(map[string]any{"a": int64(1)}, true, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Freezes()["a"]; !ok {
		t.Fatal("expected freeze at a")
	}
}
