package xaiop

// Materialize deep-copies a parsed document or fragment entries.
func Materialize(parsed any) any {
	if f, ok := parsed.(*Fragment); ok {
		return deepCopy(f.Entries)
	}
	return deepCopy(parsed)
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
