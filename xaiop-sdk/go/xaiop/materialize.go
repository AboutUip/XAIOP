package xaiop

// Materialize deep-copies a parsed document or fragment entries.
func Materialize(parsed any) any {
	if f, ok := parsed.(*Fragment); ok {
		return deepCopy(f.Entries)
	}
	return deepCopy(parsed)
}

// MaterializeSnapshot is an alias of Materialize (Node/Python materializeSnapshot).
func MaterializeSnapshot(parsed any) any {
	return Materialize(parsed)
}

// MaterializeOwned transfers parser output without cloning a plain document root.
// Fragment entries are still deep-copied.
func MaterializeOwned(parsed any) any {
	if f, ok := parsed.(*Fragment); ok {
		return deepCopy(f.Entries)
	}
	return parsed
}

func deepCopy(v any) any {
	switch x := v.(type) {
	case nil:
		return nil
	case bool:
		return x
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return x
	case string:
		return x
	case []any:
		out := make([]any, len(x))
		for i, el := range x {
			out[i] = deepCopy(el)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			out[k] = deepCopy(val)
		}
		return out
	default:
		return x
	}
}
