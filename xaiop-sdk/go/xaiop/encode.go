package xaiop

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

var encodePathIdentRE = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

const (
	dotPolicyNone           = "none"
	dotPolicyPerTopLevelKey = "perTopLevelKey"
	dotPolicyPerNKeys       = "perNKeys"
	dotPolicyCustom         = "custom"
	dotPolicyPaths          = "__paths__"
)

// EncodeOptions configures wire encoding.
type EncodeOptions struct {
	Root             string // auto|object|array|fragment
	Style            string // reset|relative ; empty → reset
	DotPolicy        any    // string none|perTopLevelKey|perNKeys|custom OR []string path cuts; nil/empty → perTopLevelKey
	PhaseEvery       int    // 0 means default
	MaxPhases        *int
	FinalDot         bool
	KeyOrder         string // insertion|sorted
	NullPolicy       string // encode|omit|error
	UndefinedPolicy  string // omit|error (inert in Go; no undefined)
	ShouldPhase      func(ctx map[string]any) bool
	SymbolKeys       bool
	TrailingNewline  bool
}

type normalizedEncodeOpt struct {
	root            string
	style           string
	dotPolicy       string
	phaseEvery      int
	maxPhases       *int
	finalDot        bool
	keyOrder        string
	nullPolicy      string
	undefinedPolicy string
	shouldPhase     func(ctx map[string]any) bool
	symbolKeys      bool
	pathCuts        []string
	trailingNewline bool
}

func defaultEncodeOptions() EncodeOptions {
	return EncodeOptions{
		Root:            "auto",
		Style:           "reset",
		DotPolicy:       dotPolicyPerTopLevelKey,
		TrailingNewline: true,
		KeyOrder:        "insertion",
		NullPolicy:      "encode",
	}
}

// Encode encodes a JSON value as XAIOP wire.
func Encode(value any, opts EncodeOptions) (string, error) {
	opt, err := normalizeEncodeOptions(opts)
	if err != nil {
		return "", err
	}

	if value == nil {
		return "", &EncodeError{Message: "cannot encode null as a document root"}
	}

	if opt.pathCuts != nil {
		lines, err := encodeWithPathCuts(value, opt)
		if err != nil {
			return "", err
		}
		return finalizeWire(lines, opt.finalDot, opt.trailingNewline), nil
	}

	rootKind, err := resolveRoot(value, opt.root)
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
		if err := emitArrayElements(&lines, arr, opt, "$"); err != nil {
			return "", err
		}
		return finalizeWire(lines, opt.finalDot, opt.trailingNewline), nil

	case "fragment":
		keys, obj, ok := orderedKeysFor(value, opt.keyOrder)
		if !ok {
			return "", &EncodeError{Message: "root:'fragment' requires a plain object", Path: "$"}
		}
		for _, key := range keys {
			if err := emitObjectEntry(&lines, key, obj[key], opt, "$."+key); err != nil {
				return "", err
			}
		}
		return finalizeWire(lines, opt.finalDot, opt.trailingNewline), nil
	}

	keys, obj, ok := orderedKeysFor(value, opt.keyOrder)
	if !ok {
		return "", &EncodeError{
			Message: "object document root requires a plain object (or use an array root)",
			Path:    "$",
		}
	}
	if len(keys) == 0 {
		lines = append(lines, ">")
		return finalizeWire(lines, opt.finalDot, opt.trailingNewline), nil
	}

	if opt.dotPolicy == dotPolicyNone && opt.style == "relative" {
		lines = append(lines, ">")
		for _, key := range keys {
			if err := emitObjectEntry(&lines, key, obj[key], opt, "$."+key); err != nil {
				return "", err
			}
		}
		return finalizeWire(lines, opt.finalDot, opt.trailingNewline), nil
	}

	plan, err := planPhases(keys, opt)
	if err != nil {
		return "", err
	}
	for phaseIdx, phaseKeys := range plan {
		if phaseIdx > 0 {
			lines = append(lines, ".")
		}
		lines = append(lines, ">")
		for _, key := range phaseKeys {
			if err := emitObjectEntry(&lines, key, obj[key], opt, "$."+key); err != nil {
				return "", err
			}
		}
	}
	return finalizeWire(lines, opt.finalDot, opt.trailingNewline), nil
}

func normalizeEncodeOptions(opts EncodeOptions) (normalizedEncodeOpt, error) {
	root := opts.Root
	if root == "" {
		root = "auto"
	}
	style := opts.Style
	if style == "" {
		style = "reset"
	}
	keyOrder := opts.KeyOrder
	if keyOrder == "" {
		keyOrder = "insertion"
	}
	nullPolicy := opts.NullPolicy
	if nullPolicy == "" {
		nullPolicy = "encode"
	}
	undefinedPolicy := opts.UndefinedPolicy
	if undefinedPolicy == "" {
		undefinedPolicy = "omit"
	}

	switch v := opts.DotPolicy.(type) {
	case nil:
		return normalizeNamedDotPolicy(root, style, dotPolicyPerTopLevelKey, opts.PhaseEvery, opts.MaxPhases, opts.FinalDot, keyOrder, nullPolicy, undefinedPolicy, opts.ShouldPhase, opts.SymbolKeys, opts.TrailingNewline)
	case string:
		dp := v
		if dp == "" {
			dp = dotPolicyPerTopLevelKey
		}
		return normalizeNamedDotPolicy(root, style, dp, opts.PhaseEvery, opts.MaxPhases, opts.FinalDot, keyOrder, nullPolicy, undefinedPolicy, opts.ShouldPhase, opts.SymbolKeys, opts.TrailingNewline)
	case []string:
		return normalizePathCutOptions(root, v, opts.FinalDot, keyOrder, nullPolicy, undefinedPolicy, opts.SymbolKeys, opts.TrailingNewline)
	default:
		return normalizedEncodeOpt{}, &EncodeError{Message: fmt.Sprintf("unknown dotPolicy type: %T", opts.DotPolicy)}
	}
}

func normalizeNamedDotPolicy(
	root, style, dotPolicy string,
	phaseEvery int,
	maxPhases *int,
	finalDot bool,
	keyOrder, nullPolicy, undefinedPolicy string,
	shouldPhase func(ctx map[string]any) bool,
	symbolKeys bool,
	trailingNewline bool,
) (normalizedEncodeOpt, error) {
	switch dotPolicy {
	case dotPolicyNone, dotPolicyPerTopLevelKey, dotPolicyPerNKeys, dotPolicyCustom:
	default:
		return normalizedEncodeOpt{}, &EncodeError{Message: "unknown dotPolicy: " + repr(dotPolicy)}
	}

	every := 1
	if phaseEvery != 0 {
		if phaseEvery < 1 {
			return normalizedEncodeOpt{}, &EncodeError{Message: "phaseEvery must be a positive integer"}
		}
		every = phaseEvery
	}
	if dotPolicy == dotPolicyPerTopLevelKey {
		every = 1
	}
	if dotPolicy == dotPolicyNone {
		every = math.MaxInt32
	}
	if every < 1 {
		return normalizedEncodeOpt{}, &EncodeError{Message: "phaseEvery must be a positive integer"}
	}

	if maxPhases != nil && *maxPhases < 1 {
		return normalizedEncodeOpt{}, &EncodeError{Message: "maxPhases must be a positive integer when set"}
	}

	if dotPolicy == dotPolicyCustom && shouldPhase == nil {
		return normalizedEncodeOpt{}, &EncodeError{Message: "dotPolicy:'custom' requires should_phase(ctx)"}
	}

	if style != "reset" && style != "relative" {
		return normalizedEncodeOpt{}, &EncodeError{Message: "unknown style: " + repr(style)}
	}
	if root != "auto" && root != "object" && root != "array" && root != "fragment" {
		return normalizedEncodeOpt{}, &EncodeError{Message: "unknown root: " + repr(root)}
	}
	if keyOrder != "insertion" && keyOrder != "sorted" {
		return normalizedEncodeOpt{}, &EncodeError{Message: "unknown keyOrder: " + repr(keyOrder)}
	}
	if nullPolicy != "encode" && nullPolicy != "omit" && nullPolicy != "error" {
		return normalizedEncodeOpt{}, &EncodeError{Message: "unknown nullPolicy: " + repr(nullPolicy)}
	}
	if undefinedPolicy != "omit" && undefinedPolicy != "error" {
		return normalizedEncodeOpt{}, &EncodeError{Message: "unknown undefinedPolicy: " + repr(undefinedPolicy)}
	}

	return normalizedEncodeOpt{
		root:            root,
		style:           style,
		dotPolicy:       dotPolicy,
		phaseEvery:      every,
		maxPhases:       maxPhases,
		finalDot:        finalDot,
		keyOrder:        keyOrder,
		nullPolicy:      nullPolicy,
		undefinedPolicy: undefinedPolicy,
		shouldPhase:     shouldPhase,
		symbolKeys:      symbolKeys,
		pathCuts:        nil,
		trailingNewline: trailingNewline,
	}, nil
}

func normalizePathCutOptions(
	root string,
	paths []string,
	finalDot bool,
	keyOrder, nullPolicy, undefinedPolicy string,
	symbolKeys bool,
	trailingNewline bool,
) (normalizedEncodeOpt, error) {
	if root != "auto" && root != "object" && root != "array" && root != "fragment" {
		return normalizedEncodeOpt{}, &EncodeError{Message: "unknown root: " + repr(root)}
	}
	if keyOrder != "insertion" && keyOrder != "sorted" {
		return normalizedEncodeOpt{}, &EncodeError{Message: "unknown keyOrder: " + repr(keyOrder)}
	}
	if nullPolicy != "encode" && nullPolicy != "omit" && nullPolicy != "error" {
		return normalizedEncodeOpt{}, &EncodeError{Message: "unknown nullPolicy: " + repr(nullPolicy)}
	}
	if undefinedPolicy != "omit" && undefinedPolicy != "error" {
		return normalizedEncodeOpt{}, &EncodeError{Message: "unknown undefinedPolicy: " + repr(undefinedPolicy)}
	}

	normalized := make([]string, 0, len(paths))
	seen := map[string]bool{}
	for i, path := range paths {
		if path == "" {
			return normalizedEncodeOpt{}, &EncodeError{
				Message: fmt.Sprintf("dotPolicy path array entry %d must be a non-empty string", i),
			}
		}
		segs, err := ParseJSONPath(path)
		if err != nil {
			return normalizedEncodeOpt{}, err
		}
		for s := 0; s < len(segs); s++ {
			if _, ok := segs[s].(int); ok {
				for t := s + 1; t < len(segs); t++ {
					if _, ok := segs[t].(int); !ok {
						return normalizedEncodeOpt{}, &EncodeError{
							Message: "dotPolicy path cannot cut inside an array element object (index must be final): " + repr(path),
							Path:    path,
						}
					}
				}
				break
			}
		}
		canon := FormatJSONPath(segs)
		if seen[canon] {
			return normalizedEncodeOpt{}, &EncodeError{Message: "duplicate dotPolicy path: " + repr(path)}
		}
		seen[canon] = true
		normalized = append(normalized, canon)
	}

	return normalizedEncodeOpt{
		root:            root,
		style:           "reset",
		dotPolicy:       dotPolicyPaths,
		phaseEvery:      math.MaxInt32,
		maxPhases:       nil,
		finalDot:        finalDot,
		keyOrder:        keyOrder,
		nullPolicy:      nullPolicy,
		undefinedPolicy: undefinedPolicy,
		shouldPhase:     nil,
		symbolKeys:      symbolKeys,
		pathCuts:        normalized,
		trailingNewline: trailingNewline,
	}, nil
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

// orderedKeysFor returns keys for encoding, preferring OrderedObject insertion order.
func orderedKeysFor(v any, keyOrder string) ([]string, map[string]any, bool) {
	m, keys, ok := plainObject(v)
	if !ok {
		return nil, nil, false
	}
	if keyOrder == "sorted" {
		out := make([]string, len(keys))
		copy(out, keys)
		sort.Strings(out)
		return out, m, true
	}
	// insertion: use OrderedObject keys when present and complete
	if _, isOrdered := v.(*OrderedObject); isOrdered {
		return keys, m, true
	}
	if _, isOrdered := v.(OrderedObject); isOrdered {
		return keys, m, true
	}
	// plain map — unstable order
	return orderedKeys(m, keyOrder), m, true
}

func planPhases(keys []string, opt normalizedEncodeOpt) ([][]string, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	if opt.dotPolicy == dotPolicyNone {
		return [][]string{append([]string(nil), keys...)}, nil
	}

	if opt.dotPolicy == dotPolicyCustom {
		var phases [][]string
		cur := []string{}
		for i, key := range keys {
			cur = append(cur, key)
			isLast := i == len(keys)-1
			ctx := map[string]any{
				"key":         key,
				"index":       i,
				"total":       len(keys),
				"keysInPhase": len(cur),
				"phaseIndex":  len(phases),
			}
			cut := !isLast && opt.shouldPhase != nil && opt.shouldPhase(ctx)
			if cut {
				phases = append(phases, cur)
				cur = []string{}
			}
		}
		if len(cur) > 0 {
			phases = append(phases, cur)
		}
		return applyMaxPhases(phases, opt.maxPhases), nil
	}

	every := opt.phaseEvery
	if opt.maxPhases != nil {
		need := (len(keys) + every - 1) / every
		if need > *opt.maxPhases {
			every = (len(keys) + *opt.maxPhases - 1) / *opt.maxPhases
		}
	}

	var phases [][]string
	for i := 0; i < len(keys); i += every {
		end := i + every
		if end > len(keys) {
			end = len(keys)
		}
		phases = append(phases, keys[i:end])
	}
	return phases, nil
}

func applyMaxPhases(phases [][]string, maxPhases *int) [][]string {
	if maxPhases == nil || len(phases) <= *maxPhases {
		return phases
	}
	head := phases[:*maxPhases-1]
	var tail []string
	for _, phase := range phases[*maxPhases-1:] {
		tail = append(tail, phase...)
	}
	return append(append([][]string{}, head...), tail)
}

func emitObjectEntry(lines *[]string, key string, value any, opt normalizedEncodeOpt, path string) error {
	if err := assertKey(key, path, opt.symbolKeys); err != nil {
		return err
	}
	wk := EncodeWireLabel(key, opt.symbolKeys)

	if value == nil {
		if opt.nullPolicy == "error" {
			return &EncodeError{Message: "null value not allowed", Path: path}
		}
		if opt.nullPolicy == "omit" {
			return nil
		}
		*lines = append(*lines, formatContentNull(wk))
		return nil
	}

	if arr, ok := value.([]any); ok {
		*lines = append(*lines, ">"+wk+"-")
		if err := emitArrayElements(lines, arr, opt, path); err != nil {
			return err
		}
		*lines = append(*lines, "<")
		return nil
	}

	if keys, obj, ok := orderedKeysFor(value, opt.keyOrder); ok {
		*lines = append(*lines, ">"+wk)
		for _, k := range keys {
			if err := emitObjectEntry(lines, k, obj[k], opt, path+"."+k); err != nil {
				return err
			}
		}
		*lines = append(*lines, "<")
		return nil
	}

	line, err := formatContent(wk, value, path)
	if err != nil {
		return err
	}
	*lines = append(*lines, line)
	return nil
}

func emitArrayElements(lines *[]string, arr []any, opt normalizedEncodeOpt, path string) error {
	for i, el := range arr {
		elPath := path + "[" + strconv.Itoa(i) + "]"
		if el == nil {
			if opt.nullPolicy == "error" {
				return &EncodeError{Message: "null array element not allowed", Path: elPath}
			}
			*lines = append(*lines, ":null")
			continue
		}
		if sub, ok := el.([]any); ok {
			*lines = append(*lines, "-")
			if err := emitArrayElements(lines, sub, opt, elPath); err != nil {
				return err
			}
			*lines = append(*lines, "<")
			continue
		}
		if keys, obj, ok := orderedKeysFor(el, opt.keyOrder); ok {
			*lines = append(*lines, ">")
			for _, k := range keys {
				if err := emitObjectEntry(lines, k, obj[k], opt, elPath+"."+k); err != nil {
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
		wire := escapeContent(s)
		if needsForcedString(s) {
			return ": " + wire, nil
		}
		return ":" + wire, nil
	}
	return "", &EncodeError{
		Message: "unsupported array element type: " + typeName(value),
		Path:    path,
	}
}

func formatContentNull(key string) string {
	return key + ":null"
}

func formatContent(key string, value any, path string) (string, error) {
	if value == nil {
		return key + ":null", nil
	}
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
		wire := escapeContent(s)
		if needsForcedString(s) {
			return key + ": " + wire, nil
		}
		return key + ":" + wire, nil
	}
	return "", &EncodeError{
		Message: "unsupported value type: " + typeName(value),
		Path:    path,
	}
}

func formatNumberToken(n any, path string) (string, error) {
	switch v := n.(type) {
	case int64:
		return strconv.FormatInt(v, 10), nil
	case int:
		return strconv.Itoa(v), nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return "", &EncodeError{
				Message: "non-finite numbers are not encodable as float tokens (" + strconv.FormatFloat(v, 'g', -1, 64) + ")",
				Path:    path,
			}
		}
		if v == math.Trunc(v) && math.Abs(v) <= float64(1<<53) {
			return strconv.FormatInt(int64(v), 10), nil
		}
		return jsNumberToken(v), nil
	case json.Number:
		f, err := v.Float64()
		if err != nil {
			return "", &EncodeError{Message: "cannot format number", Path: path}
		}
		return formatNumberToken(f, path)
	}
	return "", &EncodeError{Message: "cannot format number", Path: path}
}

func needsForcedString(s string) bool {
	if s == "" {
		return false
	}
	// Fast reject on head byte: t/f/n keywords, sign/dot/digit numeric tokens.
	switch c := s[0]; {
	case c == 't' || c == 'f' || c == 'n':
		return s == "true" || s == "false" || s == "null"
	case c == '+' || c == '-' || c == '.' || (c >= '0' && c <= '9'):
		return isNumberLikeToken(s)
	}
	return false
}

// isNumberLikeToken reports an int or float token per PROT-CONTENT §5 (union
// of the former encodeIntRE / encodeFloatRE): `[+-]? ( \d+ (\.\d*)? | \.\d+ ) ([eE][+-]?\d+)?`
// with a lone `.` (no digits at all) rejected. Hand-rolled single pass.
func isNumberLikeToken(s string) bool {
	n := len(s)
	i := 0
	if s[0] == '+' || s[0] == '-' {
		i++
		if i >= n {
			return false
		}
	}
	intDigits := 0
	for i < n {
		c := s[i]
		if c < '0' || c > '9' {
			break
		}
		intDigits++
		i++
	}
	fracDigits := -1 // -1: no dot seen
	if i < n && s[i] == '.' {
		i++
		fracDigits = 0
		for i < n {
			c := s[i]
			if c < '0' || c > '9' {
				break
			}
			fracDigits++
			i++
		}
	}
	if intDigits == 0 && fracDigits <= 0 {
		return false
	}
	if i < n {
		if s[i] != 'e' && s[i] != 'E' {
			return false
		}
		i++
		if i < n && (s[i] == '+' || s[i] == '-') {
			i++
		}
		expDigits := 0
		for i < n {
			c := s[i]
			if c < '0' || c > '9' {
				break
			}
			expDigits++
			i++
		}
		if expDigits == 0 {
			return false
		}
	}
	return i == n
}

func assertKey(key string, path string, symbolKeys bool) error {
	if key == "" {
		return &EncodeError{Message: "object keys must be non-empty strings", Path: path}
	}
	for _, c := range key {
		if c == ':' || (unicode.IsSpace(c) && c != 0x1F) {
			return &EncodeError{Message: "invalid label name: " + repr(key), Path: path}
		}
	}
	if strings.HasSuffix(key, "-") {
		return &EncodeError{
			Message: "invalid label name (trailing \"-\" reserved for arrays): " + repr(key),
			Path:    path,
		}
	}
	if KeyNeedsSymbolEscape(key) && !symbolKeys {
		return &EncodeError{
			Message: "invalid label name (must not begin with line-operator or U+001F; enable symbolKeys to escape): " + repr(key),
			Path:    path,
		}
	}
	body := key
	if KeyNeedsSymbolEscape(key) && symbolKeys {
		body = key[1:]
	}
	if strings.ContainsAny(body, "><=!&") {
		return &EncodeError{
			Message: "invalid label name (contains Cursor/operator character): " + repr(key),
			Path:    path,
		}
	}
	return nil
}

func assertEncodableString(s string, path string) error {
	if len(s) > 0 && s[0] == ' ' {
		return &EncodeError{
			Message: "string values must not begin with U+0020 SPACE (wire forced-string marker would strip leading spaces)",
			Path:    path,
		}
	}
	return nil
}

// escapeContent implements PROT-CONTENT §4.1 (always-on `\\` `\n` `\r`).
func escapeContent(s string) string {
	if strings.IndexByte(s, '\\') < 0 && strings.IndexByte(s, '\n') < 0 && strings.IndexByte(s, '\r') < 0 {
		return s
	}
	var b strings.Builder
	b.Grow(len(s) + 8)
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '\\':
			b.WriteString("\\\\")
		case '\n':
			b.WriteString("\\n")
		case '\r':
			b.WriteString("\\r")
		default:
			b.WriteByte(c)
		}
	}
	return b.String()
}

func finalizeWire(lines []string, finalDot bool, trailingNewline bool) string {
	cleaned := collapseRedundantLeaves(lines)
	if len(cleaned) == 0 && !finalDot {
		return ""
	}
	// Single sized build (no Join + `+= "\n"` re-copy).
	size := 0
	for _, l := range cleaned {
		size += len(l) + 1
	}
	if finalDot {
		size += 2
	}
	var b strings.Builder
	b.Grow(size)
	for i, l := range cleaned {
		if i > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(l)
	}
	if finalDot {
		if len(cleaned) > 0 {
			b.WriteByte('\n')
		}
		b.WriteByte('.')
	}
	if trailingNewline {
		b.WriteByte('\n')
	}
	return b.String()
}

func joinWire(lines []string, trailingNewline bool) string {
	return finalizeWire(lines, false, trailingNewline)
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

func isDecimalDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
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

// ParseJSONPath parses paths like a.b[0].c into string/int segments.
func ParseJSONPath(path string) ([]any, error) {
	if path == "" {
		return nil, &EncodeError{Message: "JSON path must be a non-empty string"}
	}
	var segs []any
	i := 0
	for i < len(path) {
		c := path[i]
		if c == '.' {
			if i == 0 || i == len(path)-1 {
				return nil, &EncodeError{Message: "invalid JSON path: " + repr(path)}
			}
			i++
			if i >= len(path) || path[i] == '.' || path[i] == '[' {
				return nil, &EncodeError{Message: "invalid JSON path: " + repr(path)}
			}
			continue
		}
		if c == '[' {
			end := strings.IndexByte(path[i:], ']')
			if end < 0 {
				return nil, &EncodeError{Message: "invalid JSON path: " + repr(path)}
			}
			end = i + end
			raw := path[i+1 : end]
			if !isDecimalDigits(raw) {
				return nil, &EncodeError{Message: "invalid array index in path: " + repr(path)}
			}
			if len(segs) == 0 {
				return nil, &EncodeError{Message: "JSON path cannot start with an index: " + repr(path)}
			}
			n, err := strconv.Atoi(raw)
			if err != nil {
				return nil, &EncodeError{Message: "invalid array index in path: " + repr(path)}
			}
			segs = append(segs, n)
			i = end + 1
			continue
		}
		j := i
		for j < len(path) && path[j] != '.' && path[j] != '[' {
			j++
		}
		if j == i {
			return nil, &EncodeError{Message: "invalid JSON path: " + repr(path)}
		}
		name := path[i:j]
		if !encodePathIdentRE.MatchString(name) {
			if name == "" || strings.HasSuffix(name, "-") || strings.ContainsAny(name, " \t\n\r:") || strings.ContainsAny(name, "><=!") {
				return nil, &EncodeError{Message: "invalid path segment: " + repr(name)}
			}
		}
		segs = append(segs, name)
		i = j
	}
	if len(segs) == 0 {
		return nil, &EncodeError{Message: "invalid JSON path: " + repr(path)}
	}
	return segs, nil
}

// FormatJSONPath formats path segments back to a.b[0].c form.
func FormatJSONPath(segs []any) string {
	var out strings.Builder
	for i, seg := range segs {
		switch v := seg.(type) {
		case int:
			out.WriteByte('[')
			out.WriteString(strconv.Itoa(v))
			out.WriteByte(']')
		case string:
			if i > 0 {
				out.WriteByte('.')
			}
			out.WriteString(v)
		default:
			if i > 0 {
				out.WriteByte('.')
			}
			out.WriteString(fmt.Sprint(v))
		}
	}
	return out.String()
}

type pathCutEncoder struct {
	opt       normalizedEncodeOpt
	rootKind  string
	cutSet    map[string]bool
	lines     []string
	openStack []any
	afterDot  bool
}

func encodeWithPathCuts(value any, opt normalizedEncodeOpt) ([]string, error) {
	rootKind, err := resolveRoot(value, opt.root)
	if err != nil {
		return nil, err
	}
	cutSet := make(map[string]bool, len(opt.pathCuts))
	for _, p := range opt.pathCuts {
		cutSet[p] = true
	}
	for p := range cutSet {
		segs, err := ParseJSONPath(p)
		if err != nil {
			return nil, err
		}
		if err := assertPathExists(value, segs, p); err != nil {
			return nil, err
		}
	}

	enc := &pathCutEncoder{
		opt:      opt,
		rootKind: rootKind,
		cutSet:   cutSet,
	}

	if rootKind == "array" {
		arr, ok := value.([]any)
		if !ok {
			return nil, &EncodeError{Message: "root:'array' requires an array value"}
		}
		if err := enc.emitArrayPath(arr, nil); err != nil {
			return nil, err
		}
	} else {
		obj, ok := value.(map[string]any)
		if !ok {
			return nil, &EncodeError{
				Message: "object document root requires a plain object (or use an array root)",
				Path:    "$",
			}
		}
		keys := orderedKeys(obj, opt.keyOrder)
		if len(keys) == 0 {
			enc.lines = append(enc.lines, ">")
			return enc.lines, nil
		}
		for _, key := range keys {
			if err := enc.emitObjectPath(key, obj[key], []any{key}); err != nil {
				return nil, err
			}
		}
	}

	if len(enc.cutSet) > 0 {
		left := make([]string, 0, len(enc.cutSet))
		for p := range enc.cutSet {
			left = append(left, p)
		}
		sort.Strings(left)
		return nil, &EncodeError{Message: "dotPolicy paths not reached during encode: " + strings.Join(left, ", ")}
	}
	return enc.lines, nil
}

func (e *pathCutEncoder) reopenTo(targetAncestors []any, arrayTail bool) {
	if e.afterDot || len(e.lines) == 0 {
		if e.rootKind == "array" {
			e.lines = append(e.lines, "-")
		} else {
			e.lines = append(e.lines, ">")
		}
		e.afterDot = false
		e.openStack = nil
	}

	i := 0
	for i < len(e.openStack) && i < len(targetAncestors) && pathSegEqual(e.openStack[i], targetAncestors[i]) {
		i++
	}
	for len(e.openStack) > i {
		e.lines = append(e.lines, "<")
		e.openStack = e.openStack[:len(e.openStack)-1]
	}
	for j := i; j < len(targetAncestors); j++ {
		seg := targetAncestors[j]
		if _, ok := seg.(int); ok {
			e.openStack = append(e.openStack, seg)
			continue
		}
		var nxt any
		if j+1 < len(targetAncestors) {
			nxt = targetAncestors[j+1]
		}
		_, nxtIsInt := nxt.(int)
		isArrayEnter := nxtIsInt || (arrayTail && j == len(targetAncestors)-1)
		wk := EncodeWireLabel(fmt.Sprint(seg), e.opt.symbolKeys)
		if isArrayEnter {
			e.lines = append(e.lines, ">"+wk+"-")
		} else {
			e.lines = append(e.lines, ">"+wk)
		}
		e.openStack = append(e.openStack, seg)
	}
}

func (e *pathCutEncoder) maybeCut(segs []any) {
	canon := FormatJSONPath(segs)
	if !e.cutSet[canon] {
		return
	}
	delete(e.cutSet, canon)
	e.lines = append(e.lines, ".")
	e.afterDot = true
	e.openStack = nil
}

func (e *pathCutEncoder) emitObjectPath(key string, val any, segs []any) error {
	path := FormatJSONPath(segs)
	if err := assertKey(key, path, e.opt.symbolKeys); err != nil {
		return err
	}
	wk := EncodeWireLabel(key, e.opt.symbolKeys)

	parentSegs := segs[:len(segs)-1]
	e.reopenTo(parentSegs, false)

	if val == nil {
		if e.opt.nullPolicy == "error" {
			return &EncodeError{Message: "null value not allowed", Path: path}
		}
		if e.opt.nullPolicy == "omit" {
			return nil
		}
		e.lines = append(e.lines, formatContentNull(wk))
		e.maybeCut(segs)
		return nil
	}

	if arr, ok := val.([]any); ok {
		e.lines = append(e.lines, ">"+wk+"-")
		e.openStack = append(e.openStack, key)
		if err := e.emitArrayPath(arr, segs); err != nil {
			return err
		}
		if !e.afterDot && len(e.openStack) > 0 && pathSegEqual(e.openStack[len(e.openStack)-1], key) {
			e.lines = append(e.lines, "<")
			e.openStack = e.openStack[:len(e.openStack)-1]
		}
		e.maybeCut(segs)
		return nil
	}

	if obj, ok := val.(map[string]any); ok {
		e.lines = append(e.lines, ">"+wk)
		e.openStack = append(e.openStack, key)
		for _, k := range orderedKeys(obj, e.opt.keyOrder) {
			child := append(append([]any{}, segs...), k)
			if err := e.emitObjectPath(k, obj[k], child); err != nil {
				return err
			}
		}
		if !e.afterDot && len(e.openStack) > 0 && pathSegEqual(e.openStack[len(e.openStack)-1], key) {
			e.lines = append(e.lines, "<")
			e.openStack = e.openStack[:len(e.openStack)-1]
		}
		e.maybeCut(segs)
		return nil
	}

	line, err := formatContent(wk, val, path)
	if err != nil {
		return err
	}
	e.lines = append(e.lines, line)
	e.maybeCut(segs)
	return nil
}

func (e *pathCutEncoder) emitArrayPath(arr []any, arrSegs []any) error {
	if len(arrSegs) == 0 {
		e.reopenTo(nil, false)
	}
	for i, el := range arr {
		elSegs := append(append([]any{}, arrSegs...), i)
		elPath := FormatJSONPath(elSegs)
		e.reopenTo(arrSegs, len(arrSegs) > 0)
		e.openStack = append(e.openStack, i)

		if el == nil {
			if e.opt.nullPolicy == "error" {
				return &EncodeError{Message: "null array element not allowed", Path: elPath}
			}
			e.lines = append(e.lines, ":null")
			e.openStack = e.openStack[:len(e.openStack)-1]
			e.maybeCut(elSegs)
			continue
		}
		if sub, ok := el.([]any); ok {
			e.lines = append(e.lines, "-")
			if err := e.emitArrayPathNested(sub, elSegs); err != nil {
				return err
			}
			if !e.afterDot {
				e.lines = append(e.lines, "<")
			}
			if !e.afterDot && len(e.openStack) > 0 && pathSegEqual(e.openStack[len(e.openStack)-1], i) {
				e.openStack = e.openStack[:len(e.openStack)-1]
			}
			e.maybeCut(elSegs)
			continue
		}
		if obj, ok := el.(map[string]any); ok {
			e.lines = append(e.lines, ">")
			for _, k := range orderedKeys(obj, e.opt.keyOrder) {
				child := append(append([]any{}, elSegs...), k)
				if err := e.emitObjectPath(k, obj[k], child); err != nil {
					return err
				}
			}
			if !e.afterDot {
				e.lines = append(e.lines, "<")
			}
			if !e.afterDot && len(e.openStack) > 0 && pathSegEqual(e.openStack[len(e.openStack)-1], i) {
				e.openStack = e.openStack[:len(e.openStack)-1]
			}
			e.maybeCut(elSegs)
			continue
		}
		line, err := formatScalarElement(el, elPath)
		if err != nil {
			return err
		}
		e.lines = append(e.lines, line)
		e.openStack = e.openStack[:len(e.openStack)-1]
		e.maybeCut(elSegs)
	}
	return nil
}

func (e *pathCutEncoder) emitArrayPathNested(arr []any, arrSegs []any) error {
	for i, el := range arr {
		elSegs := append(append([]any{}, arrSegs...), i)
		elPath := FormatJSONPath(elSegs)
		e.openStack = append(e.openStack, i)

		if el == nil {
			if e.opt.nullPolicy == "error" {
				return &EncodeError{Message: "null array element not allowed", Path: elPath}
			}
			e.lines = append(e.lines, ":null")
			e.openStack = e.openStack[:len(e.openStack)-1]
			e.maybeCut(elSegs)
			continue
		}
		if sub, ok := el.([]any); ok {
			e.lines = append(e.lines, "-")
			if err := e.emitArrayPathNested(sub, elSegs); err != nil {
				return err
			}
			if !e.afterDot {
				e.lines = append(e.lines, "<")
			}
			if !e.afterDot && len(e.openStack) > 0 && pathSegEqual(e.openStack[len(e.openStack)-1], i) {
				e.openStack = e.openStack[:len(e.openStack)-1]
			}
			e.maybeCut(elSegs)
			continue
		}
		if obj, ok := el.(map[string]any); ok {
			e.lines = append(e.lines, ">")
			for _, k := range orderedKeys(obj, e.opt.keyOrder) {
				child := append(append([]any{}, elSegs...), k)
				if err := e.emitObjectPath(k, obj[k], child); err != nil {
					return err
				}
			}
			if !e.afterDot {
				e.lines = append(e.lines, "<")
			}
			if !e.afterDot && len(e.openStack) > 0 && pathSegEqual(e.openStack[len(e.openStack)-1], i) {
				e.openStack = e.openStack[:len(e.openStack)-1]
			}
			e.maybeCut(elSegs)
			continue
		}
		line, err := formatScalarElement(el, elPath)
		if err != nil {
			return err
		}
		e.lines = append(e.lines, line)
		e.openStack = e.openStack[:len(e.openStack)-1]
		e.maybeCut(elSegs)
	}
	return nil
}

func pathSegEqual(a, b any) bool {
	switch av := a.(type) {
	case string:
		bv, ok := b.(string)
		return ok && av == bv
	case int:
		bv, ok := b.(int)
		return ok && av == bv
	default:
		return a == b
	}
}

func assertPathExists(root any, segs []any, pathStr string) error {
	cur := root
	for _, seg := range segs {
		switch s := seg.(type) {
		case int:
			arr, ok := cur.([]any)
			if !ok {
				return &EncodeError{
					Message: "dotPolicy path not found (not an array): " + repr(pathStr),
					Path:    pathStr,
				}
			}
			if s < 0 || s >= len(arr) {
				return &EncodeError{Message: "dotPolicy path not found: " + repr(pathStr), Path: pathStr}
			}
			cur = arr[s]
		case string:
			obj, ok := cur.(map[string]any)
			if !ok {
				return &EncodeError{Message: "dotPolicy path not found: " + repr(pathStr), Path: pathStr}
			}
			v, ok := obj[s]
			if !ok {
				return &EncodeError{Message: "dotPolicy path not found: " + repr(pathStr), Path: pathStr}
			}
			cur = v
		default:
			return &EncodeError{Message: "dotPolicy path not found: " + repr(pathStr), Path: pathStr}
		}
	}
	return nil
}
