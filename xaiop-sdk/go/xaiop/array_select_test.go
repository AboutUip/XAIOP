package xaiop

import (
	"reflect"
	"testing"
)

func TestArraySelectIndexThenWrite(t *testing.T) {
	got, err := Parse(">\n>orders-\nid:A1\nid:A2\n.\n@orders\n?1\nstatus:shipped\n")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"orders": []any{
			map[string]any{"id": "A1"},
			map[string]any{"id": "A2", "status": "shipped"},
		},
	}
	assertTree(t, want, got)
}

func TestArraySelectPredicate(t *testing.T) {
	got, err := Parse(">\n>orders-\nid:A1\nid:A2\n.\n@orders\n?id:A2\nstatus:shipped\n")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"orders": []any{
			map[string]any{"id": "A1"},
			map[string]any{"id": "A2", "status": "shipped"},
		},
	}
	assertTree(t, want, got)
}

func TestArraySelectStarPredicate(t *testing.T) {
	got, err := Parse(">\n>orders-\n>\nid:A1\nstatus:pending\n<\n>\nid:A2\nstatus:pending\n<\n>\nid:A3\nstatus:done\n.\n@orders\n?*status:pending\nchecked:true\n")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"orders": []any{
			map[string]any{"id": "A1", "status": "pending", "checked": true},
			map[string]any{"id": "A2", "status": "pending", "checked": true},
			map[string]any{"id": "A3", "status": "done"},
		},
	}
	assertTree(t, want, got)
}

func TestArraySelectBareAmpAfterEnter(t *testing.T) {
	got, err := Parse(">\n>items-\n>\nid:keep\n<\n>\nid:drop\n&\n")
	if err != nil {
		t.Fatal(err)
	}
	assertTree(t, map[string]any{"items": []any{map[string]any{"id": "keep"}}}, got)
}

func TestArraySelectBareAmpPredicate(t *testing.T) {
	got, err := Parse(">\n>orders-\nid:A1\nid:A2\nid:A3\n.\n@orders\n?id:A2\n&\n")
	if err != nil {
		t.Fatal(err)
	}
	assertTree(t, map[string]any{
		"orders": []any{map[string]any{"id": "A1"}, map[string]any{"id": "A3"}},
	}, got)
}

func TestArraySelectStarThenAmp(t *testing.T) {
	got, err := Parse(">\n>orders-\nid:A1\nid:A2\n.\n@orders\n?*\n&\n")
	if err != nil {
		t.Fatal(err)
	}
	assertTree(t, map[string]any{"orders": []any{}}, got)
}

func TestArraySelectScalarDelete(t *testing.T) {
	got, err := Parse(">\n>n-\n:a\n:b\n:c\n.\n@n\n?1\n&\n")
	if err != nil {
		t.Fatal(err)
	}
	assertTree(t, map[string]any{"n": []any{"a", "c"}}, got)
}

func TestArraySelectNestedAppend(t *testing.T) {
	got, err := Parse(">\n>wrap-\n-\n:a\n:b\n.\n@wrap\n?0\n:c\n")
	if err != nil {
		t.Fatal(err)
	}
	assertTree(t, map[string]any{"wrap": []any{[]any{"a", "b", "c"}}}, got)
}

func TestArraySelectRoot(t *testing.T) {
	got, err := Parse("-\nid:A\nid:B\n?1\nx:1\n")
	if err != nil {
		t.Fatal(err)
	}
	assertTree(t, []any{map[string]any{"id": "A"}, map[string]any{"id": "B", "x": int64(1)}}, got)
}

func TestArraySelectErrors(t *testing.T) {
	fails := []string{
		">\n?0\n",
		">\n>a\nx:1\n?0\n",
		">\n>n-\n:a\n.\n@n\n?\n",
		">\n>n-\n:a\n.\n@n\n?9\n",
		">\n>n-\nid:A\n.\n@n\n?id:Z\n",
		">\n>n-\n.\n@n\n?*\n",
		">\n>n-\n:a\n.\n@n\n?01\n",
		">\n>n-\n:a\n.\n@n\n?00\n",
		">\n>n-\n:a\n.\n@n\n?-1\n",
		">\n>n-\n:a\n.\n@n\n?*2\n",
		">\n>n-\n:a\n.\n@n\n?:x\n",
		">\n>n-\n:a\n.\n@n\n?0\nk:v\n",
		">\n>a\nx:1\n.\n!a\n?0\n",
		">\n&\n",
		">\n>n-\n:a\n.\n@n\n&\n",
		">\n>n-\n:a\n:b\n.\n@n\n?*\n?0\n",
		">\n>n-\n:a\n:b\n.\n@n\n?0\n?0\n",
		">\n>n-\n:a\n:b\n.\n@n\n?id:A\n",
		">\n>rows-\nok:1\n.\n@rows\n?ok:true\n",
		">\n>n-\n:a\n:b\n.\n@n\n? 1\n",
		">\n>n-\n:a\n.\n@n\n?+1\n",
		">\n>n-\n:a\n:b\n.\n@n\n?1.5\n",
	}
	for _, src := range fails {
		_, err := Parse(src)
		if err == nil {
			t.Fatalf("expected error for %q", src)
		}
	}
}

func TestArraySelectAtSlotIsKey(t *testing.T) {
	got, err := Parse(">\n>orders-\nid:A1\n.\n@orders>0\nx:1\n")
	if err != nil {
		t.Fatal(err)
	}
	assertTree(t, map[string]any{
		"orders": map[string]any{"0": map[string]any{"x": int64(1)}},
	}, got)
}

func TestArraySelectAmpPathNoopIndex(t *testing.T) {
	got, err := Parse(">\n>orders-\nid:A1\nid:A2\n.\n&orders>0\n")
	if err != nil {
		t.Fatal(err)
	}
	assertTree(t, map[string]any{
		"orders": []any{map[string]any{"id": "A1"}, map[string]any{"id": "A2"}},
	}, got)
}

func TestArraySelectStarAmpPath(t *testing.T) {
	got, err := Parse(">\n>orders-\n>\nid:A1\nstatus:pending\n<\n>\nid:A2\nstatus:pending\n.\n@orders\n?*\n&status\n")
	if err != nil {
		t.Fatal(err)
	}
	assertTree(t, map[string]any{
		"orders": []any{map[string]any{"id": "A1"}, map[string]any{"id": "A2"}},
	}, got)
}

func TestArraySelectEqThenQ(t *testing.T) {
	got, err := Parse(">\n>orders-\nid:A1\nid:A2\n.\n=orders\n?1\nstatus:ok\n")
	if err != nil {
		t.Fatal(err)
	}
	assertTree(t, map[string]any{
		"orders": []any{
			map[string]any{"id": "A1"},
			map[string]any{"id": "A2", "status": "ok"},
		},
	}, got)
}

func assertTree(t *testing.T, want, got any) {
	t.Helper()
	if !treeEqual(want, got) {
		t.Fatalf("mismatch\nwant %#v\ngot  %#v", want, got)
	}
}

func treeEqual(a, b any) bool {
	if av, ok := asFloat64(a); ok {
		if bv, ok := asFloat64(b); ok {
			return av == bv
		}
	}
	if aa, ok := asAnySlice(a); ok {
		bb, ok := asAnySlice(b)
		if !ok || len(aa) != len(bb) {
			return false
		}
		for i := range aa {
			if !treeEqual(aa[i], bb[i]) {
				return false
			}
		}
		return true
	}
	am, aok := a.(map[string]any)
	bm, bok := b.(map[string]any)
	if aok && bok {
		if len(am) != len(bm) {
			return false
		}
		for k, v := range am {
			if !treeEqual(v, bm[k]) {
				return false
			}
		}
		return true
	}
	return reflect.DeepEqual(a, b)
}

func asFloat64(v any) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case float64:
		return n, true
	default:
		return 0, false
	}
}

func asAnySlice(v any) ([]any, bool) {
	switch a := v.(type) {
	case []any:
		return a, true
	case *[]any:
		return *a, true
	default:
		return nil, false
	}
}
