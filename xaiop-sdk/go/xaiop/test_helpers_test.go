package xaiop

import (
	"math"
	"reflect"
)

func valuesEqual(a, b any) bool {
	return valuesEqualWithPath(a, b, "$")
}

func valuesEqualWithPath(a, b any, path string) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}

	if fa, ok := a.(float64); ok {
		if fb, ok := b.(float64); ok {
			return fa == fb || (math.IsNaN(fa) && math.IsNaN(fb))
		}
		if ib, ok := asInt64(b); ok {
			return fa == float64(ib)
		}
		return false
	}
	if fb, ok := b.(float64); ok {
		if ia, ok := asInt64(a); ok {
			return float64(ia) == fb
		}
		return false
	}

	if ia, ok := asInt64(a); ok {
		if ib, ok := asInt64(b); ok {
			return ia == ib
		}
		return false
	}

	if sa, ok := a.(string); ok {
		if sb, ok := b.(string); ok {
			return sa == sb
		}
		return false
	}
	if ba, ok := a.(bool); ok {
		if bb, ok := b.(bool); ok {
			return ba == bb
		}
		return false
	}

	if arrA, ok := a.([]any); ok {
		arrB, ok := b.([]any)
		if !ok || len(arrA) != len(arrB) {
			return false
		}
		for i := range arrA {
			if !valuesEqualWithPath(arrA[i], arrB[i], path+"["+itoa(i)+"]") {
				return false
			}
		}
		return true
	}

	if mapA, ok := a.(map[string]any); ok {
		mapB, ok := b.(map[string]any)
		if !ok || len(mapA) != len(mapB) {
			return false
		}
		for k, va := range mapA {
			vb, has := mapB[k]
			if !has {
				return false
			}
			if !valuesEqualWithPath(va, vb, path+"."+k) {
				return false
			}
		}
		return true
	}

	return reflect.DeepEqual(a, b)
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := false
	if i < 0 {
		neg = true
		i = -i
	}
	var buf [20]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}

func mustParse(source string) any {
	v, err := Parse(source)
	if err != nil {
		panic(err)
	}
	return v
}

func wire(lines ...string) string {
	out := ""
	for i, line := range lines {
		if i > 0 {
			out += "\n"
		}
		out += line
	}
	return out
}
