// Package types implements TypeRegistry / TypeChecker / freeze basics
// aligned with the Node.js xaiop 0.16.0 reference.
package types

import (
	"fmt"
	"math"
	"strings"
	"unicode"
)

// Polarity for registry entries.
const (
	PolarityAllow = "allow"
	PolarityDeny  = "deny"
)

// Canonical kind constants.
const (
	KindInt    = "int"
	KindFloat  = "float"
	KindBool   = "bool"
	KindString = "string"
	KindNull   = "null"
	KindObject = "object"
	KindArray  = "array"
	KindAny    = "any"
)

// TYPE is the built-in canonical type table (Node TYPE.*).
var TYPE = map[string]map[string]any{
	"INT":    {"kind": KindInt},
	"FLOAT":  {"kind": KindFloat},
	"BOOL":   {"kind": KindBool},
	"STRING": {"kind": KindString},
	"NULL":   {"kind": KindNull},
	"OBJECT": {"kind": KindObject},
	"ARRAY":  {"kind": KindArray},
	"ANY":    {"kind": KindAny},
}

// TypeError is a type mismatch or registry violation.
type TypeError struct {
	Message  string
	Path     string
	Expected map[string]any
	Actual   map[string]any
	Polarity string
}

func (e *TypeError) Error() string {
	if e == nil {
		return "type error"
	}
	return e.Message
}

// TypeEntry is one registry binding.
type TypeEntry struct {
	Path     string
	Type     map[string]any
	Polarity string
}

// TypeRegistry maps JSON paths to expected types.
type TypeRegistry struct {
	entries map[string]TypeEntry
}

// NewTypeRegistry creates an empty registry.
func NewTypeRegistry() *TypeRegistry {
	return &TypeRegistry{entries: map[string]TypeEntry{}}
}

// Size returns the number of registered paths.
func (r *TypeRegistry) Size() int { return len(r.entries) }

// RegisterOptions configures Register polarity.
type RegisterOptions struct {
	Polarity string // allow | deny
}

// Register binds path → type. Returns false when path already exists.
func (r *TypeRegistry) Register(path string, typeInput any, opts *RegisterOptions) (bool, error) {
	canon, err := normalizeRegistryPath(path)
	if err != nil {
		return false, err
	}
	if _, ok := r.entries[canon]; ok {
		return false, nil
	}
	polarity := PolarityAllow
	if opts != nil && opts.Polarity == PolarityDeny {
		polarity = PolarityDeny
	}
	t, err := CanonicalizeType(typeInput)
	if err != nil {
		return false, err
	}
	if polarity == PolarityDeny && t["kind"] == KindAny {
		return false, fmt.Errorf("cannot register deny polarity for type any")
	}
	r.entries[canon] = TypeEntry{Path: canon, Type: CloneType(t), Polarity: polarity}
	return true, nil
}

// RegisterMany registers a map of path → type.
func (r *TypeRegistry) RegisterMany(mapping map[string]any, opts *RegisterOptions) (okPaths, rejected []string, err error) {
	for path, typeInput := range mapping {
		ok, e := r.Register(path, typeInput, opts)
		canon, _ := normalizeRegistryPath(path)
		if e != nil {
			return okPaths, rejected, e
		}
		if ok {
			okPaths = append(okPaths, canon)
		} else {
			rejected = append(rejected, canon)
		}
	}
	return okPaths, rejected, nil
}

// Has reports whether path is registered.
func (r *TypeRegistry) Has(path string) bool {
	canon, err := normalizeRegistryPath(path)
	if err != nil {
		return false
	}
	_, ok := r.entries[canon]
	return ok
}

// Get returns a cloned entry or nil.
func (r *TypeRegistry) Get(path string) *TypeEntry {
	canon, err := normalizeRegistryPath(path)
	if err != nil {
		return nil
	}
	e, ok := r.entries[canon]
	if !ok {
		return nil
	}
	cp := e
	cp.Type = CloneType(e.Type)
	return &cp
}

// List returns cloned entries.
func (r *TypeRegistry) List() []TypeEntry {
	out := make([]TypeEntry, 0, len(r.entries))
	for _, e := range r.entries {
		out = append(out, TypeEntry{Path: e.Path, Type: CloneType(e.Type), Polarity: e.Polarity})
	}
	return out
}

// Snapshot returns a versioned schema snapshot.
func (r *TypeRegistry) Snapshot() map[string]any {
	entries := make([]any, 0, len(r.entries))
	for _, e := range r.List() {
		entries = append(entries, map[string]any{
			"path":     e.Path,
			"type":     e.Type,
			"polarity": e.Polarity,
		})
	}
	return map[string]any{"version": 1, "entries": entries}
}

// FromSnapshot rebuilds a registry from Snapshot / peer schema.
func FromSnapshot(snap any) (*TypeRegistry, error) {
	reg := NewTypeRegistry()
	if other, ok := snap.(*TypeRegistry); ok {
		for _, e := range other.List() {
			ok, err := reg.Register(e.Path, e.Type, &RegisterOptions{Polarity: e.Polarity})
			if err != nil {
				return nil, err
			}
			if !ok {
				return nil, &TypeError{Message: "duplicate path in schema: " + e.Path, Path: e.Path}
			}
		}
		return reg, nil
	}
	m, ok := snap.(map[string]any)
	if !ok || m == nil {
		return nil, fmt.Errorf("invalid type schema snapshot")
	}
	ver, _ := m["version"].(int)
	if ver != 1 {
		if f, ok := m["version"].(float64); ok {
			ver = int(f)
		}
	}
	entries, _ := m["entries"].([]any)
	if ver != 1 || entries == nil {
		return nil, fmt.Errorf("invalid type schema snapshot")
	}
	for _, raw := range entries {
		e, ok := raw.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("invalid type schema entry")
		}
		path, _ := e["path"].(string)
		if path == "" {
			return nil, fmt.Errorf("invalid type schema entry")
		}
		pol, _ := e["polarity"].(string)
		okReg, err := reg.Register(path, e["type"], &RegisterOptions{Polarity: pol})
		if err != nil {
			return nil, err
		}
		if !okReg {
			return nil, &TypeError{Message: "duplicate path in schema: " + path, Path: path}
		}
	}
	return reg, nil
}

// ObjectType builds {"kind":"object","fields":…}.
func ObjectType(fields map[string]any) (map[string]any, error) {
	if fields == nil {
		return nil, fmt.Errorf("object_type(fields) requires a plain object")
	}
	out := map[string]any{}
	for k, v := range fields {
		if k == "" {
			return nil, fmt.Errorf("object_type field names must be non-empty strings")
		}
		ct, err := CanonicalizeType(v)
		if err != nil {
			return nil, err
		}
		out[k] = ct
	}
	return map[string]any{"kind": KindObject, "fields": out}, nil
}

// ArrayType builds {"kind":"array","element":…}.
func ArrayType(element any) (map[string]any, error) {
	ct, err := CanonicalizeType(element)
	if err != nil {
		return nil, err
	}
	return map[string]any{"kind": KindArray, "element": ct}, nil
}

// CanonicalizeType normalizes string / object type surfaces.
func CanonicalizeType(input any) (map[string]any, error) {
	if input == nil {
		return nil, fmt.Errorf("type is required")
	}
	if s, ok := input.(string); ok {
		return ParseTypeSurface(strings.TrimSpace(s))
	}
	m, ok := input.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid type: %T", input)
	}
	kind, _ := m["kind"].(string)
	if kind == "" {
		return nil, fmt.Errorf("type object must have a kind")
	}
	switch kind {
	case KindInt, KindFloat, KindBool, KindString, KindNull, KindAny:
		return map[string]any{"kind": kind}, nil
	case KindObject:
		if fields, ok := m["fields"].(map[string]any); ok && fields != nil {
			return ObjectType(fields)
		}
		return map[string]any{"kind": KindObject}, nil
	case KindArray:
		if el, ok := m["element"]; ok && el != nil {
			return ArrayType(el)
		}
		return map[string]any{"kind": KindArray}, nil
	default:
		return nil, fmt.Errorf("unknown type kind: %s", kind)
	}
}

// ParseTypeSurface parses "int", "array<string>", "object<a:int>" etc.
func ParseTypeSurface(text string) (map[string]any, error) {
	if text == "" {
		return nil, fmt.Errorf("type surface must be a non-empty string")
	}
	t, nxt, err := parseTypeExpr(text, 0)
	if err != nil {
		return nil, err
	}
	if nxt != len(text) {
		return nil, fmt.Errorf("unexpected trailing type syntax: %q", text[nxt:])
	}
	return t, nil
}

func skipWS(s string, i int) int {
	for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
		i++
	}
	return i
}

func parseTypeExpr(s string, i int) (map[string]any, int, error) {
	i = skipWS(s, i)
	start := i
	for i < len(s) && (unicode.IsLetter(rune(s[i])) || s[i] == '_') {
		i++
	}
	if i == start {
		return nil, i, fmt.Errorf("expected type name at %q", s[i:])
	}
	name := strings.ToLower(s[start:i])
	i = skipWS(s, i)
	if i < len(s) && s[i] == '<' {
		i++
		if name == "array" {
			inner, ni, err := parseTypeExpr(s, i)
			if err != nil {
				return nil, ni, err
			}
			i = skipWS(s, ni)
			if i >= len(s) || s[i] != '>' {
				return nil, i, fmt.Errorf("array<...> missing '>'")
			}
			return map[string]any{"kind": KindArray, "element": inner}, i + 1, nil
		}
		if name == "object" {
			fields := map[string]any{}
			i = skipWS(s, i)
			if i < len(s) && s[i] == '>' {
				return map[string]any{"kind": KindObject}, i + 1, nil
			}
			for {
				i = skipWS(s, i)
				keyStart := i
				for i < len(s) && (unicode.IsLetter(rune(s[i])) || unicode.IsDigit(rune(s[i])) || s[i] == '_') {
					i++
				}
				if i == keyStart {
					return nil, i, fmt.Errorf("object field name expected")
				}
				key := s[keyStart:i]
				i = skipWS(s, i)
				if i >= len(s) || s[i] != ':' {
					return nil, i, fmt.Errorf("object field %s missing ':'", key)
				}
				i++
				val, ni, err := parseTypeExpr(s, i)
				if err != nil {
					return nil, ni, err
				}
				fields[key] = val
				i = skipWS(s, ni)
				if i < len(s) && s[i] == ',' {
					i++
					continue
				}
				if i < len(s) && s[i] == '>' {
					return map[string]any{"kind": KindObject, "fields": fields}, i + 1, nil
				}
				return nil, i, fmt.Errorf("object<...> expected ',' or '>'")
			}
		}
		return nil, i, fmt.Errorf("type %s does not take parameters", name)
	}
	switch name {
	case KindInt, KindFloat, KindBool, KindString, KindNull, KindObject, KindArray, KindAny:
		return map[string]any{"kind": name}, i, nil
	default:
		return nil, i, fmt.Errorf("unknown type name: %s", name)
	}
}

// ClassifyValue returns the runtime type of a JSON value.
func ClassifyValue(value any) (map[string]any, error) {
	switch v := value.(type) {
	case nil:
		return map[string]any{"kind": KindNull}, nil
	case bool:
		return map[string]any{"kind": KindBool}, nil
	case int:
		return map[string]any{"kind": KindInt}, nil
	case int64:
		return map[string]any{"kind": KindInt}, nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil, &TypeError{Message: fmt.Sprintf("non-finite number cannot be typed (%v)", v)}
		}
		if v == math.Trunc(v) && math.Abs(v) <= float64(1<<53-1) {
			return map[string]any{"kind": KindInt}, nil
		}
		return map[string]any{"kind": KindFloat}, nil
	case string:
		return map[string]any{"kind": KindString}, nil
	case []any:
		var element map[string]any
		for _, el := range v {
			if el == nil {
				continue
			}
			t, err := ClassifyValue(el)
			if err != nil {
				return nil, err
			}
			leaf := StripShape(t)
			if element == nil {
				element = leaf
			} else if !TypeCompatible(element, leaf) {
				return nil, &TypeError{
					Message:  "array elements must share one type",
					Expected: element,
					Actual:   leaf,
				}
			}
		}
		out := map[string]any{"kind": KindArray}
		if element != nil {
			out["element"] = element
		}
		return out, nil
	case map[string]any:
		return map[string]any{"kind": KindObject}, nil
	default:
		return nil, &TypeError{Message: fmt.Sprintf("unsupported runtime type: %T", value)}
	}
}

// StripShape reduces object/array shapes for comparison.
func StripShape(t map[string]any) map[string]any {
	if t == nil {
		return nil
	}
	kind, _ := t["kind"].(string)
	if kind == KindObject {
		return map[string]any{"kind": KindObject}
	}
	if kind == KindArray {
		if el, ok := t["element"].(map[string]any); ok && el != nil {
			return map[string]any{"kind": KindArray, "element": StripShape(el)}
		}
		return map[string]any{"kind": KindArray}
	}
	return map[string]any{"kind": kind}
}

// ValueMatchesType reports whether value satisfies expected.
func ValueMatchesType(value any, expected map[string]any) bool {
	if expected == nil {
		return false
	}
	kind, _ := expected["kind"].(string)
	if kind == KindAny {
		return true
	}
	if value == nil {
		return kind == KindNull
	}
	if kind == KindNull {
		return false
	}
	switch kind {
	case KindBool:
		_, ok := value.(bool)
		return ok
	case KindString:
		_, ok := value.(string)
		return ok
	case KindInt:
		switch value.(type) {
		case int, int64:
			return true
		case float64:
			f := value.(float64)
			return f == math.Trunc(f) && !math.IsNaN(f) && !math.IsInf(f, 0)
		default:
			return false
		}
	case KindFloat:
		_, ok := value.(float64)
		return ok
	case KindObject:
		m, ok := value.(map[string]any)
		if !ok {
			return false
		}
		fields, _ := expected["fields"].(map[string]any)
		if fields == nil {
			return true
		}
		for k, ft := range fields {
			ftm, _ := ft.(map[string]any)
			v, has := m[k]
			if !has {
				if ftm != nil && ftm["kind"] == KindAny {
					continue
				}
				return false
			}
			if !ValueMatchesType(v, ftm) {
				return false
			}
		}
		return true
	case KindArray:
		arr, ok := value.([]any)
		if !ok {
			return false
		}
		element, _ := expected["element"].(map[string]any)
		if element == nil {
			return true
		}
		for _, el := range arr {
			if !ValueMatchesType(el, element) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

// TypeCompatible reports whether two type descriptors are compatible.
func TypeCompatible(a, b map[string]any) bool {
	if a == nil || b == nil {
		return false
	}
	if a["kind"] == KindAny || b["kind"] == KindAny {
		return true
	}
	if a["kind"] != b["kind"] {
		return false
	}
	if a["kind"] == KindArray {
		ae, _ := a["element"].(map[string]any)
		be, _ := b["element"].(map[string]any)
		if ae == nil || be == nil {
			return true
		}
		return TypeCompatible(ae, be)
	}
	return true
}

// TypeToString renders a type descriptor.
func TypeToString(t map[string]any) string {
	if t == nil {
		return "?"
	}
	kind, _ := t["kind"].(string)
	if kind == KindArray {
		if el, ok := t["element"].(map[string]any); ok && el != nil {
			return "array<" + TypeToString(el) + ">"
		}
		return "array"
	}
	if kind == KindObject {
		if fields, ok := t["fields"].(map[string]any); ok && len(fields) > 0 {
			parts := make([]string, 0, len(fields))
			for k, v := range fields {
				vm, _ := v.(map[string]any)
				parts = append(parts, k+":"+TypeToString(vm))
			}
			return "object<" + strings.Join(parts, ",") + ">"
		}
	}
	return kind
}

// CloneType deep-clones a type descriptor.
func CloneType(t map[string]any) map[string]any {
	if t == nil {
		return nil
	}
	if t["kind"] == KindObject {
		if fields, ok := t["fields"].(map[string]any); ok && fields != nil {
			out := map[string]any{}
			for k, v := range fields {
				vm, _ := v.(map[string]any)
				out[k] = CloneType(vm)
			}
			return map[string]any{"kind": KindObject, "fields": out}
		}
	}
	if t["kind"] == KindArray {
		if el, ok := t["element"].(map[string]any); ok && el != nil {
			return map[string]any{"kind": KindArray, "element": CloneType(el)}
		}
	}
	return map[string]any{"kind": t["kind"]}
}

// ViolationHook is called on each type violation (before throw).
type ViolationHook func(err *TypeError, ctx map[string]any)

// TypeChecker walks a JSON tree against a registry.
type TypeChecker struct {
	registry    *TypeRegistry
	onViolation ViolationHook
}

// NewTypeChecker creates a checker.
func NewTypeChecker(registry *TypeRegistry, onViolation ViolationHook) *TypeChecker {
	return &TypeChecker{registry: registry, onViolation: onViolation}
}

// Registry returns the bound registry.
func (c *TypeChecker) Registry() *TypeRegistry { return c.registry }

// CheckTree validates value. When throw is true, returns the first error.
func (c *TypeChecker) CheckTree(value any, throw bool) ([]*TypeError, error) {
	var errors []*TypeError
	root := unwrapFragment(value)
	c.walk(root, nil, &errors)
	if throw && len(errors) > 0 {
		return errors, errors[0]
	}
	return errors, nil
}

func (c *TypeChecker) walk(value any, segs []any, errors *[]*TypeError) {
	if len(segs) > 0 {
		path := formatJSONPath(segs)
		if entry := c.registry.Get(path); entry != nil {
			c.checkEntry(path, value, entry, errors)
		}
	}
	switch v := value.(type) {
	case []any:
		path := ""
		if len(segs) > 0 {
			path = formatJSONPath(segs)
		}
		var elemType map[string]any
		if path != "" {
			if entry := c.registry.Get(path); entry != nil && entry.Polarity == PolarityAllow && entry.Type["kind"] == KindArray {
				elemType, _ = entry.Type["element"].(map[string]any)
			}
		}
		for i, el := range v {
			child := append(append([]any{}, segs...), i)
			if elemType != nil && el != nil {
				childPath := formatJSONPath(child)
				if !ValueMatchesType(el, elemType) {
					c.fail(&TypeError{
						Message: fmt.Sprintf("type mismatch at %s: expected %s, got %s",
							childPath, TypeToString(elemType), TypeToString(classifySafe(el))),
						Path:     childPath,
						Expected: elemType,
						Actual:   classifySafe(el),
						Polarity: PolarityAllow,
					}, map[string]any{"path": childPath, "value": el}, errors)
				}
			}
			c.walk(el, child, errors)
		}
	case map[string]any:
		for key, childVal := range v {
			c.walk(childVal, append(append([]any{}, segs...), key), errors)
		}
	}
}

func (c *TypeChecker) checkEntry(path string, value any, entry *TypeEntry, errors *[]*TypeError) {
	matches := ValueMatchesType(value, entry.Type)
	if entry.Polarity == PolarityAllow {
		if !matches {
			c.fail(&TypeError{
				Message: fmt.Sprintf("type mismatch at %s: expected %s, got %s",
					path, TypeToString(entry.Type), TypeToString(classifySafe(value))),
				Path:     path,
				Expected: entry.Type,
				Actual:   classifySafe(value),
				Polarity: PolarityAllow,
			}, map[string]any{"path": path, "value": value, "entry": entry}, errors)
		}
		return
	}
	if matches {
		c.fail(&TypeError{
			Message: fmt.Sprintf("type denied at %s: must not be %s", path, TypeToString(entry.Type)),
			Path:    path, Expected: entry.Type, Actual: classifySafe(value), Polarity: PolarityDeny,
		}, map[string]any{"path": path, "value": value, "entry": entry}, errors)
	}
}

func (c *TypeChecker) fail(err *TypeError, ctx map[string]any, errors *[]*TypeError) {
	if c.onViolation != nil {
		c.onViolation(err, ctx)
	}
	*errors = append(*errors, err)
}

func classifySafe(v any) map[string]any {
	t, err := ClassifyValue(v)
	if err != nil {
		return map[string]any{"kind": KindAny}
	}
	return t
}

func unwrapFragment(value any) any {
	if m, ok := value.(map[string]any); ok {
		if m["isFragment"] == true {
			if entries, ok := m["entries"].(map[string]any); ok {
				return entries
			}
		}
	}
	// *Fragment from parent package is handled via map shape after Materialize.
	return value
}
