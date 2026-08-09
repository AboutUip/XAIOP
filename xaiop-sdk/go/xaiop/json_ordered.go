package xaiop

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/big"
	"strconv"
	"strings"
)

// DecodeJSONOrdered unmarshals JSON preserving object key insertion order
// as *OrderedObject trees (Encode KeyOrder "insertion" matches Node/Python).
func DecodeJSONOrdered(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	return decodeOrderedValue(dec)
}

// DecodeJSONOrderedFrom reads one JSON value from r.
func DecodeJSONOrderedFrom(r io.Reader) (any, error) {
	dec := json.NewDecoder(r)
	dec.UseNumber()
	return decodeOrderedValue(dec)
}

func decodeOrderedValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			obj := &OrderedObject{Vals: map[string]any{}}
			for dec.More() {
				keyTok, err := dec.Token()
				if err != nil {
					return nil, err
				}
				key, ok := keyTok.(string)
				if !ok {
					return nil, fmt.Errorf("expected string key, got %T", keyTok)
				}
				val, err := decodeOrderedValue(dec)
				if err != nil {
					return nil, err
				}
				obj.Keys = append(obj.Keys, key)
				obj.Vals[key] = val
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return obj, nil
		case '[':
			var arr []any
			for dec.More() {
				val, err := decodeOrderedValue(dec)
				if err != nil {
					return nil, err
				}
				arr = append(arr, val)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return arr, nil
		default:
			return nil, fmt.Errorf("unexpected delim %v", t)
		}
	case bool, string:
		return t, nil
	case json.Number:
		s := t.String()
		if !strings.ContainsAny(s, ".eE") {
			if i, err := strconv.ParseInt(s, 10, 64); err == nil {
				return i, nil
			}
		}
		f, err := t.Float64()
		if err != nil {
			return nil, err
		}
		return f, nil
	case nil:
		return nil, nil
	default:
		return nil, fmt.Errorf("unexpected token %T", tok)
	}
}

// jsNumberToken renders a finite float like ECMAScript Number#toString
// (port of Java Encoder.jsNumberToken).
//
// Fast path: strconv's shortest round-trip decimal ('e' form is uniform to
// parse) already carries the digits ECMAScript picks; only reformat per the
// ES fixed/scientific cut-over. The big.Float search stays as fallback.
func jsNumberToken(value float64) string {
	sign := ""
	d := value
	if value < 0 {
		sign = "-"
		d = -value
	}
	if d == 0 {
		return "0"
	}
	repr := strconv.FormatFloat(d, 'e', -1, 64)
	e := strings.IndexByte(repr, 'e')
	if e < 0 {
		return jsNumberTokenSlow(value)
	}
	mant := repr[:e]
	exp10, err := strconv.Atoi(repr[e+1:])
	if err != nil {
		return jsNumberTokenSlow(value)
	}
	if dot := strings.IndexByte(mant, '.'); dot >= 0 {
		exp10 -= len(mant) - dot - 1
		mant = mant[:dot] + mant[dot+1:]
	}
	// Shortest 'e' form never emits leading/trailing zero digits; stay defensive.
	for len(mant) > 1 && mant[0] == '0' {
		mant = mant[1:]
	}
	for len(mant) > 1 && mant[len(mant)-1] == '0' {
		mant = mant[:len(mant)-1]
		exp10++
	}
	if mant == "" || mant == "0" {
		return jsNumberTokenSlow(value)
	}
	return formatECMADigits(sign, mant, len(mant)+exp10)
}

// formatECMADigits lays out shortest digits per ECMAScript Number::toString
// with value = 0.<digits> x 10^n.
func formatECMADigits(sign, digits string, n int) string {
	k := len(digits)
	if k <= n && n <= 21 {
		return sign + digits + strings.Repeat("0", n-k)
	}
	if n > 0 && n <= 21 {
		return sign + digits[:n] + "." + digits[n:]
	}
	if n > -6 && n <= 0 {
		return sign + "0." + strings.Repeat("0", -n) + digits
	}
	mantissa := digits
	if k > 1 {
		mantissa = digits[:1] + "." + digits[1:]
	}
	exp := n - 1
	expSign := "+"
	if exp < 0 {
		expSign = "-"
		exp = -exp
	}
	return sign + mantissa + "e" + expSign + strconv.Itoa(exp)
}

// jsNumberTokenSlow is the big.Float shortest-round-trip search; reference
// and fallback path.
func jsNumberTokenSlow(value float64) string {
	sign := ""
	d := value
	if value < 0 {
		sign = "-"
		d = -value
	}
	exact := new(big.Float).SetPrec(128).SetMode(big.ToNearestEven).SetFloat64(d)
	upper := significantDigitCount(strconv.FormatFloat(d, 'g', -1, 64))
	var shortest *big.Float
	for k := upper; k >= 1; k-- {
		cand := roundToSignificantDigits(exact, k)
		cf, _ := cand.Float64()
		if cf != d {
			break
		}
		shortest = cand
	}
	if shortest == nil {
		shortest = roundToSignificantDigits(exact, 17)
	}
	digits, n := bigFloatToECMADigits(shortest)
	return formatECMADigits(sign, digits, n)
}

func significantDigitCount(repr string) int {
	e := strings.IndexAny(repr, "eE")
	mant := repr
	if e >= 0 {
		mant = repr[:e]
	}
	digits := 0
	started := false
	for i := 0; i < len(mant); i++ {
		c := mant[i]
		if c < '0' || c > '9' {
			continue
		}
		if c != '0' {
			started = true
		}
		if started {
			digits++
		}
	}
	if digits < 1 {
		digits = 1
	}
	if digits > 17 {
		digits = 17
	}
	return digits
}

func roundToSignificantDigits(exact *big.Float, k int) *big.Float {
	// Convert to decimal string with k significant digits via Text, then parse back.
	s := exact.Text('g', k)
	out := new(big.Float).SetPrec(128).SetMode(big.ToNearestEven)
	_, _, _ = out.Parse(s, 10)
	return out
}

func bigFloatToECMADigits(f *big.Float) (digits string, n int) {
	// Use scientific form from Text('e', -1) then derive digits and n.
	s := f.Text('e', -1)
	// e.g. "1.234e-06" or "1e+00"
	neg := false
	if strings.HasPrefix(s, "-") {
		neg = true
		s = s[1:]
	}
	_ = neg
	parts := strings.SplitN(s, "e", 2)
	if len(parts) != 2 {
		parts = strings.SplitN(s, "E", 2)
	}
	mant := parts[0]
	exp := 0
	if len(parts) == 2 {
		exp, _ = strconv.Atoi(parts[1])
	}
	intPart, frac := mant, ""
	if i := strings.IndexByte(mant, '.'); i >= 0 {
		intPart = mant[:i]
		frac = mant[i+1:]
	}
	digits = strings.TrimRight(intPart+frac, "0")
	digits = strings.TrimLeft(digits, "0")
	if digits == "" {
		return "0", 1
	}
	// value = 0.digits × 10^(exp+1) when mant is d.ddd form with leading digit
	// For "1.23e-6": digits=123, exp_ecma n = exp+1 = -5; check: 0.123 * 10^-5 = 1.23e-6 OK
	// For "1e+0": digits=1, n = 0+1 = 1; 0.1 * 10^1 = 1 OK
	n = exp + 1
	return digits, n
}

// ensure jsNumberToken handles zero
func init() {
	_ = math.Abs
}
