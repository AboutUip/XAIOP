package xaiop

// OrderedObject is a JSON object with insertion-ordered keys.
// DecodeJSONOrdered returns these so Encode with KeyOrder "insertion" matches Node/Python.
type OrderedObject struct {
	Keys []string
	Vals map[string]any
}

// AsMap returns the underlying map (mutable).
func (o *OrderedObject) AsMap() map[string]any {
	if o == nil {
		return nil
	}
	return o.Vals
}

// plainObject returns map + ordered keys when available.
func plainObject(v any) (m map[string]any, keys []string, ok bool) {
	switch o := v.(type) {
	case *OrderedObject:
		if o == nil {
			return nil, nil, false
		}
		return o.Vals, append([]string(nil), o.Keys...), true
	case OrderedObject:
		return o.Vals, append([]string(nil), o.Keys...), true
	case map[string]any:
		keys := make([]string, 0, len(o))
		for k := range o {
			keys = append(keys, k)
		}
		return o, keys, true
	default:
		return nil, nil, false
	}
}

// ToPlainJSON converts OrderedObject trees to plain map[string]any (for Materialize / compare).
func ToPlainJSON(v any) any {
	switch o := v.(type) {
	case *OrderedObject:
		out := make(map[string]any, len(o.Vals))
		for _, k := range o.Keys {
			out[k] = ToPlainJSON(o.Vals[k])
		}
		// include any keys not in Keys
		for k, val := range o.Vals {
			if _, ok := out[k]; !ok {
				out[k] = ToPlainJSON(val)
			}
		}
		return out
	case OrderedObject:
		return ToPlainJSON(&o)
	case map[string]any:
		out := make(map[string]any, len(o))
		for k, val := range o {
			out[k] = ToPlainJSON(val)
		}
		return out
	case []any:
		out := make([]any, len(o))
		for i, val := range o {
			out[i] = ToPlainJSON(val)
		}
		return out
	default:
		return o
	}
}
