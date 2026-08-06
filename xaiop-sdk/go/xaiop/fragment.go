package xaiop

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Fragment holds named bindings at root without an anonymous outer object.
type Fragment struct {
	Entries map[string]any
}

// IsFragment reports that this value is a fragment root.
func (f *Fragment) IsFragment() bool {
	return true
}

// Notation returns a compact JSON-like summary of fragment entries.
func (f *Fragment) Notation() string {
	if f == nil || f.Entries == nil {
		return ""
	}
	keys := make([]string, 0, len(f.Entries))
	for k := range f.Entries {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		v := f.Entries[k]
		kj, _ := json.Marshal(k)
		vj, _ := json.Marshal(v)
		parts = append(parts, fmt.Sprintf("%s:%s", string(kj), string(vj)))
	}
	return strings.Join(parts, ",")
}
