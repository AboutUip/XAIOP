package xaiop

import (
	"encoding/json"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

var encodeFloatRE = regexp.MustCompile(
	`^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$|^[+-]?\d+[eE][+-]?\d+$`,
)

var encodeIntRE = regexp.MustCompile(`^[+-]?\d+$`)

// EncodeOptions configures wire encoding.
type EncodeOptions struct {
	Root            string // "auto", "object", "array", "fragment"
	TrailingNewline bool
	KeyOrder        string // "insertion", "sorted"
}

func defaultEncodeOptions() EncodeOptions {
	return EncodeOptions{
		Root:            "auto",
		TrailingNewline: true,
		KeyOrder:        "insertion",
	}
}

// Encode encodes a JSON value as XAIOP wire (simplified single-phase relative style).
func Encode(value any, opts EncodeOptions) (string, error) {
	if value == nil {
		return "", &EncodeError{Message: "cannot encode null as a document root"}
	}
	if opts.Root == "" {
		opts.Root = "auto"
	}
	if opts.KeyOrder == "" {
		opts.KeyOrder = "insertion"
	}

	rootKind, err := resolveRoot(value, opts.Root)
	if err != nil {
		return "", err
	}

	var lines []string

	switch rootKind {
	case "array":
		arr, ok := value.([]any)
		if !ok {
			return "", &EncodeError{Message: "root:'array' requires an array value"}
		}
		lines = append(lines, "-")
		if err := emitArrayElements(&lines, arr, "$", opts.KeyOrder); err != nil {
			return "", err
		}
		return joinWire(lines, opts.TrailingNewline), nil

	case "fragment":
		obj, ok := value.(map[string]any)
		if !ok {
			return "", &EncodeError{Message: "root:'fragment' requires a plain object", Path: "$"}
		}
		keys := orderedKeys(obj, opts.KeyOrder)
		for _, key := range keys {
			if err := emitObjectEntry(&lines, key, obj[key], "$."+key, opts.KeyOrder); err != nil {
				return "", err
			}
		}
		return joinWire(lines, opts.TrailingNewline), nil
	}

	obj, ok := value.(map[string]any)
	if !ok {
		return "", &EncodeError{
			Message: "object document root requires a plain object (or use an array root)",
			Path:    "$",
		}
	}
	keys := orderedKeys(obj, opts.KeyOrder)
	if len(keys) == 0 {
		lines = append(lines, ">")
		return joinWire(lines, opts.TrailingNewline), nil
	}
	lines = append(lines, ">")
	for _, key := range keys {
		if err := emitObjectEntry(&lines, key, obj[key], "$."+key, opts.KeyOrder); err != nil {
			return "", err
		}
	}
	return joinWire(lines, opts.TrailingNewline), nil
}

func resolveRoot(value any, root string) (string, error) {
	switch root {
	case "object":
		return "object", nil
	case "array":
		return "array", nil
	case "fragment":
		return "fragment", nil
	case "auto":
		if _, ok := value.([]any); ok {
			return "array", nil
		}
		return "object", nil
	default:
		return "", &EncodeError{Message: "invalid root option: " + root}
	}
}

func orderedKeys(obj map[string]any, keyOrder string) []string {
	keys := make([]string, 0, len(obj))
	for k := range obj {
		keys = append(keys, k)
	}
	if keyOrder == "sorted" {
		sort.Strings(keys)
	}
	return keys
}

func emitObjectEntry(lines *[]string, key string, value any, path string, keyOrder string) error {
	if err := assertKey(key, path); err != nil {
		return err
	}

	if value == nil {
		*lines = append(*lines, key+":null")
		return nil
	}

	if arr, ok := value.([]any); ok {
		*lines = append(*lines, ">"+key+"-")
		if err := emitArrayElements(lines, arr, path, keyOrder); err != nil {
			return err
		}
		*lines = append(*lines, "<")
		return nil
	}

	if obj, ok := value.(map[string]any); ok {
		*lines = append(*lines, ">"+key)
		for _, k := range orderedKeys(obj, keyOrder) {
			if err := emitObjectEntry(lines, k, obj[k], path+"."+k, keyOrder); err != nil {
				return err
			}
		}
		*lines = append(*lines, "<")
		return nil
	}

	line, err := formatContent(key, value, path)
	if err != nil {
		return err
	}
	*lines = append(*lines, line)
	return nil
}

func emitArrayElements(lines *[]string, arr []any, path string, keyOrder string) error {
	for i, el := range arr {
		elPath := path + "[" + strconv.Itoa(i) + "]"
		if el == nil {
			*lines = append(*lines, ":null")
			continue
		}
		if sub, ok := el.([]any); ok {
			*lines = append(*lines, "-")
			if err := emitArrayElements(lines, sub, elPath, keyOrder); err != nil {
				return err
			}
			*lines = append(*lines, "<")
			continue
		}
		if obj, ok := el.(map[string]any); ok {
			*lines = append(*lines, ">")
			for _, k := range orderedKeys(obj, keyOrder) {
				if err := emitObjectEntry(lines, k, obj[k], elPath+"."+k, keyOrder); err != nil {
					return err
				}
			}
			*lines = append(*lines, "<")
			continue
		}
		line, err := formatScalarElement(el, elPath)
		if err != nil {
			return err
		}
		*lines = append(*lines, line)
	}
	return nil
}

func formatScalarElement(value any, path string) (string, error) {
	if value == nil {
		return ":null", nil
	}
	if b, ok := value.(bool); ok {
		if b {
			return ":true", nil
		}
		return ":false", nil
	}
	if n, ok := asInt64(value); ok {
		token, err := formatNumberToken(n, path)
		if err != nil {
			return "", err
		}
		return ":" + token, nil
	}
	if f, ok := value.(float64); ok {
		token, err := formatNumberToken(f, path)
		if err != nil {
			return "", err
		}
		return ":" + token, nil
	}
	if s, ok := value.(string); ok {
		if err := assertEncodableString(s, path); err != nil {
			return "", err
		}
		if needsForcedString(s) {
			return ": " + s, nil
		}
		return ":" + s, nil
	}
	return "", &EncodeError{
		Message: "unsupported array element type: " + typeName(value),
		Path:    path,
	}
}

func formatContent(key string, value any, path string) (string, error) {
	if b, ok := value.(bool); ok {
		if b {
			return key + ":true", nil
		}
		return key + ":false", nil
	}
	if n, ok := asInt64(value); ok {
		token, err := formatNumberToken(n, path)
		if err != nil {
			return "", err
		}
		return key + ":" + token, nil
	}
	if f, ok := value.(float64); ok {
		token, err := formatNumberToken(f, path)
		if err != nil {
			return "", err
		}
		return key + ":" + token, nil
	}
	if s, ok := value.(string); ok {
		if err := assertEncodableString(s, path); err != nil {
			return "", err
		}
		if needsForcedString(s) {
			return key + ": " + s, nil
		}
		return key + ":" + s, nil
	}
	return "", &EncodeError{
		Message: "unsupported value type: " + typeName(value),
		Path:    path,
	}
}

func formatNumberToken(n any, path string) (string, error) {
	switch v := n.(type) {
	case int64:
		if v == v {
			return strconv.FormatInt(v, 10), nil
		}
	case int:
		return strconv.Itoa(v), nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return "", &EncodeError{
				Message: "non-finite numbers are not encodable as float tokens (" + strconv.FormatFloat(v, 'g', -1, 64) + ")",
				Path:    path,
			}
		}
		if v == math.Trunc(v) && math.Abs(v) < 1<<53 {
			return strconv.FormatInt(int64(v), 10), nil
		}
		s := strconv.FormatFloat(v, 'g', -1, 64)
		if encodeIntRE.MatchString(s) {
			return s, nil
		}
		if encodeFloatRE.MatchString(s) {
			return s, nil
		}
		j, err := json.Marshal(v)
		if err != nil {
			return "", &EncodeError{Message: "cannot format number: " + strconv.FormatFloat(v, 'g', -1, 64), Path: path}
		}
		return string(j), nil
	}
	return "", &EncodeError{Message: "cannot format number", Path: path}
}

func needsForcedString(s string) bool {
	if s == "true" || s == "false" || s == "null" {
		return true
	}
	if encodeIntRE.MatchString(s) {
		return true
	}
	return encodeFloatRE.MatchString(s)
}

func assertKey(key string, path string) error {
	if key == "" {
		return &EncodeError{Message: "object keys must be non-empty strings", Path: path}
	}
	for _, c := range key {
		if unicode.IsSpace(c) || c == ':' {
			return &EncodeError{Message: "invalid label name: " + repr(key), Path: path}
		}
	}
	if strings.HasSuffix(key, "-") {
		return &EncodeError{
			Message: "invalid label name (trailing \"-\" reserved for arrays): " + repr(key),
			Path:    path,
		}
	}
	if len(key) > 0 && operatorHeads[rune(key[0])] {
		return &EncodeError{
			Message: "invalid label name (must not begin with line-operator): " + repr(key),
			Path:    path,
		}
	}
	if strings.ContainsAny(key, "><=!&") {
		return &EncodeError{
			Message: "invalid label name (contains Cursor/operator character): " + repr(key),
			Path:    path,
		}
	}
	return nil
}

func assertEncodableString(s string, path string) error {
	if strings.ContainsAny(s, "\n\r") {
		return &EncodeError{Message: "string values must not contain CR/LF", Path: path}
	}
	if len(s) > 0 && s[0] == ' ' {
		return &EncodeError{
			Message: "string values must not begin with U+0020 SPACE (wire forced-string marker would strip leading spaces)",
			Path:    path,
		}
	}
	return nil
}

func joinWire(lines []string, trailingNewline bool) string {
	cleaned := collapseRedundantLeaves(lines)
	if len(cleaned) == 0 {
		return ""
	}
	text := strings.Join(cleaned, "\n")
	if trailingNewline {
		text += "\n"
	}
	return text
}

func collapseRedundantLeaves(lines []string) []string {
	drop := 0
	for i := range lines {
		nxt := ""
		if i+1 < len(lines) {
			nxt = lines[i+1]
		}
		if lines[i] == "<" && (nxt == "." || nxt == "") {
			drop++
		}
	}
	if drop == 0 {
		return lines
	}
	out := make([]string, 0, len(lines))
	for i, line := range lines {
		nxt := ""
		if i+1 < len(lines) {
			nxt = lines[i+1]
		}
		if line == "<" && (nxt == "." || nxt == "") {
			continue
		}
		out = append(out, line)
	}
	return out
}

func asInt64(v any) (int64, bool) {
	switch n := v.(type) {
	case int64:
		return n, true
	case int:
		return int64(n), true
	case int32:
		return int64(n), true
	}
	return 0, false
}

func typeName(v any) string {
	switch v.(type) {
	case bool:
		return "bool"
	case string:
		return "string"
	case int64:
		return "int64"
	case int:
		return "int"
	case float64:
		return "float64"
	case []any:
		return "[]any"
	case map[string]any:
		return "map[string]any"
	default:
		return "unknown"
	}
}
