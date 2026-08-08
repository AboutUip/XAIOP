package xaiop

// CloneJSON deep-clones JSON-compatible values (maps / slices / scalars).
func CloneJSON(value any) any {
	if value == nil {
		return nil
	}
	switch v := value.(type) {
	case string, bool:
		return v
	case int:
		return v
	case int64:
		return v
	case float64:
		return v
	case []any:
		out := make([]any, len(v))
		for i, el := range v {
			out[i] = CloneJSON(el)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(v))
		for k, el := range v {
			out[k] = CloneJSON(el)
		}
		return out
	default:
		return v
	}
}
