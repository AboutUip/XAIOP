package xaiop

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/compat"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/types"
)

// MergeConflict policies for offline merge / inject.
const (
	MergeOverwrite = "overwrite"
	MergeKeep      = "keep"
)

// MergeJSON deep-merges overlay into a clone of base.
func MergeJSON(base, overlay any, conflict string) (any, error) {
	policy, err := normalizeConflict(conflict)
	if err != nil {
		return nil, err
	}
	return mergeInto(CloneJSON(base), CloneJSON(overlay), policy), nil
}

func normalizeConflict(conflict string) (string, error) {
	if conflict == "" {
		return MergeOverwrite, nil
	}
	if conflict != MergeOverwrite && conflict != MergeKeep {
		return "", fmt.Errorf(`merge conflict must be "overwrite" or "keep", got %q`, conflict)
	}
	return conflict, nil
}

func isPlainObject(v any) bool {
	_, ok := v.(map[string]any)
	return ok
}

func mergeInto(target, overlay any, conflict string) any {
	if !isPlainObject(target) || !isPlainObject(overlay) {
		if conflict == MergeOverwrite {
			return overlay
		}
		return target
	}
	t := target.(map[string]any)
	o := overlay.(map[string]any)
	for key, ov := range o {
		tv, ok := t[key]
		if !ok {
			t[key] = ov
			continue
		}
		if isPlainObject(tv) && isPlainObject(ov) {
			mergeInto(tv, ov, conflict)
			continue
		}
		if conflict == MergeOverwrite {
			t[key] = ov
		}
	}
	return t
}

// ToMergeableJSON materializes fragments and clones JSON values.
func ToMergeableJSON(value any) any {
	if f, ok := value.(*Fragment); ok {
		return Materialize(f)
	}
	return CloneJSON(value)
}

// MergeOptions configures MergeToJSON / MergeToXAIOP.
type MergeOptions struct {
	Conflict string
	Compat   any // passed to ParseWithOptions via compat.Resolve
	Encode   EncodeOptions
}

// MergeToJSON parses xaiopSource and merges onto baseJSON.
func MergeToJSON(baseJSON any, xaiopSource string, opts MergeOptions) (any, error) {
	overlay, err := ParseWithOptions(xaiopSource, ParseOptions{Compat: compat.Resolve(opts.Compat)})
	if err != nil {
		return nil, err
	}
	return MergeJSON(baseJSON, Materialize(overlay), opts.Conflict)
}

// MergeToXAIOP merges then encodes (default encode uses DotPolicy none when unset).
func MergeToXAIOP(baseJSON any, xaiopSource string, opts MergeOptions) (string, error) {
	merged, err := MergeToJSON(baseJSON, xaiopSource, opts)
	if err != nil {
		return "", err
	}
	enc := opts.Encode
	enc = applyMergeEncodeDefaults(enc)
	return Encode(merged, enc)
}

func applyMergeEncodeDefaults(enc EncodeOptions) EncodeOptions {
	if enc.Style == "" {
		enc.Style = "relative"
	}
	if enc.DotPolicy == nil {
		enc.DotPolicy = "none"
	}
	if enc.KeyOrder == "" {
		enc.KeyOrder = "insertion"
	}
	if !enc.TrailingNewline {
		enc.TrailingNewline = true
	}
	return enc
}

// InjectFormatOptions selects inject return shape.
type InjectFormatOptions struct {
	As            string // "json" | "xaiop"
	EncodeOptions EncodeOptions
}

// FormatInjectResult returns cloned JSON or encoded wire.
func FormatInjectResult(value any, opts InjectFormatOptions) (any, error) {
	as := opts.As
	if as == "" {
		as = "json"
	}
	if as == "xaiop" {
		enc := applyMergeEncodeDefaults(opts.EncodeOptions)
		return Encode(value, enc)
	}
	if as != "json" {
		return nil, fmt.Errorf(`inject as must be "json" or "xaiop", got %q`, as)
	}
	return CloneJSON(value), nil
}

// Engine is the in-memory XAIOP store (sync-first).
type Engine struct {
	store             map[string]any
	seq               int
	compatibilityMode bool
	compatPolicy      *compat.Policy
	typeCheck         bool
	typeRegistry      *types.TypeRegistry
}

// NewEngine creates an empty engine.
func NewEngine(compatibilityMode bool) *Engine {
	return &Engine{
		store:             map[string]any{},
		compatibilityMode: compatibilityMode,
		compatPolicy:      compat.NewPolicy(nil),
		typeRegistry:      types.NewTypeRegistry(),
	}
}

// CompatibilityMode reports whether compat ingest is on.
func (e *Engine) CompatibilityMode() bool { return e.compatibilityMode }

// SetCompatibilityMode toggles compat mode (disables typeCheck when enabling).
func (e *Engine) SetCompatibilityMode(enabled bool) *Engine {
	e.compatibilityMode = enabled
	if enabled {
		e.typeCheck = false
	}
	return e
}

// TypeCheck reports whether type checking is enabled (forced off in compat mode).
func (e *Engine) TypeCheck() bool { return e.typeCheck && !e.compatibilityMode }

// SetTypeCheck enables type checking (no-op while compatibility mode is on).
func (e *Engine) SetTypeCheck(enabled bool) *Engine {
	if enabled && e.compatibilityMode {
		return e
	}
	e.typeCheck = enabled
	return e
}

// TypeRegistry returns the engine type registry.
func (e *Engine) TypeRegistry() *types.TypeRegistry {
	if e.typeRegistry == nil {
		e.typeRegistry = types.NewTypeRegistry()
	}
	return e.typeRegistry
}

// SetTypeRegistry replaces the type registry.
func (e *Engine) SetTypeRegistry(reg *types.TypeRegistry) *Engine {
	if reg == nil {
		reg = types.NewTypeRegistry()
	}
	e.typeRegistry = reg
	return e
}

// CheckStored runs TypeChecker against a stored document.
func (e *Engine) CheckStored(dataID string, throw bool) ([]*types.TypeError, error) {
	value, err := e.Get(dataID)
	if err != nil {
		return nil, err
	}
	checker := types.NewTypeChecker(e.TypeRegistry(), nil)
	return checker.CheckTree(value, throw)
}

func (e *Engine) parseCompatArg() any {
	if !e.compatibilityMode {
		return false
	}
	return e.compatPolicy.Snapshot()
}

func (e *Engine) setCompatFix(fixID string, enabled bool) bool {
	if !e.compatibilityMode {
		return false
	}
	return e.compatPolicy.Set(fixID, enabled)
}

// Compat setters (no-op when compatibility mode is off).
func (e *Engine) SetCompatForcedRoot(v bool) bool {
	return e.setCompatFix(compat.ForcedRoot, v)
}
func (e *Engine) SetCompatRewriteBareNameArray(v bool) bool {
	return e.setCompatFix(compat.RewriteBareNameArray, v)
}
func (e *Engine) SetCompatRewriteEnterLine(v bool) bool {
	return e.setCompatFix(compat.RewriteEnterLine, v)
}
func (e *Engine) SetCompatIgnoreBareLeaveAtRoot(v bool) bool {
	return e.setCompatFix(compat.IgnoreBareLeaveAtRoot, v)
}
func (e *Engine) SetCompatPopAndRetry(v bool) bool {
	return e.setCompatFix(compat.PopAndRetry, v)
}
func (e *Engine) SetCompatLocatePathTrim(v bool) bool {
	return e.setCompatFix(compat.LocatePathTrim, v)
}
func (e *Engine) SetCompatLocatePathStripSpaces(v bool) bool {
	return e.setCompatFix(compat.LocatePathStripSpaces, v)
}
func (e *Engine) SetCompatLocatePathArraySuffix(v bool) bool {
	return e.setCompatFix(compat.LocatePathArraySuffix, v)
}

// Upload parses source into the store and returns a data id.
func (e *Engine) Upload(source string) (string, error) {
	value, err := ParseWithOptions(source, ParseOptions{Compat: compat.Resolve(e.parseCompatArg())})
	if err != nil {
		return "", err
	}
	e.seq++
	id := nextDataID(e.seq)
	e.store[id] = value
	return id, nil
}

// UploadJSON encodes value then uploads.
func (e *Engine) UploadJSON(value any, encodeOpts EncodeOptions) (string, error) {
	if !encodeOpts.TrailingNewline && encodeOpts.Root == "" {
		encodeOpts.TrailingNewline = true
	}
	wire, err := Encode(value, encodeOpts)
	if err != nil {
		return "", err
	}
	return e.Upload(wire)
}

// Encode is a thin wrapper around package Encode.
func (e *Engine) Encode(value any, opts EncodeOptions) (string, error) {
	return Encode(value, opts)
}

// Get returns a cloned stored value.
func (e *Engine) Get(dataID string) (any, error) {
	if dataID == "" {
		return nil, fmt.Errorf("dataId must be a non-empty string")
	}
	value, ok := e.store[dataID]
	if !ok {
		return nil, fmt.Errorf("unknown data id: %s", dataID)
	}
	if f, ok := value.(*Fragment); ok {
		return &Fragment{Entries: CloneJSON(f.Entries).(map[string]any)}, nil
	}
	return CloneJSON(value), nil
}

// Has reports whether dataID exists.
func (e *Engine) Has(dataID string) bool {
	_, ok := e.store[dataID]
	return ok
}

// Delete removes a stored value.
func (e *Engine) Delete(dataID string) bool {
	if _, ok := e.store[dataID]; !ok {
		return false
	}
	delete(e.store, dataID)
	return true
}

// Clear empties the store.
func (e *Engine) Clear() { e.store = map[string]any{} }

func (e *Engine) requireStored(dataID string) (any, error) {
	if dataID == "" {
		return nil, fmt.Errorf("dataId must be a non-empty string")
	}
	value, ok := e.store[dataID]
	if !ok {
		return nil, fmt.Errorf("unknown data id: %s", dataID)
	}
	return ToMergeableJSON(value), nil
}

// MergeToJSON merges xaiopSource onto baseJSON using engine compat by default.
func (e *Engine) MergeToJSON(baseJSON any, xaiopSource string, opts MergeOptions) (any, error) {
	if opts.Compat == nil {
		opts.Compat = e.parseCompatArg()
	}
	return MergeToJSON(baseJSON, xaiopSource, opts)
}

// InjectXAIOP merges wire onto a stored document.
func (e *Engine) InjectXAIOP(dataID, xaiopSource string, conflict string, format InjectFormatOptions) (any, error) {
	base, err := e.requireStored(dataID)
	if err != nil {
		return nil, err
	}
	merged, err := MergeToJSON(base, xaiopSource, MergeOptions{
		Conflict: conflict,
		Compat:   e.parseCompatArg(),
	})
	if err != nil {
		return nil, err
	}
	e.store[dataID] = merged
	return FormatInjectResult(merged, format)
}

// InjectJSON merges a JSON overlay onto a stored document.
func (e *Engine) InjectJSON(dataID string, jsonValue any, conflict string, format InjectFormatOptions) (any, error) {
	base, err := e.requireStored(dataID)
	if err != nil {
		return nil, err
	}
	merged, err := MergeJSON(base, jsonValue, conflict)
	if err != nil {
		return nil, err
	}
	e.store[dataID] = merged
	return FormatInjectResult(merged, format)
}

func nextDataID(seq int) string {
	var b [4]byte
	_, _ = rand.Read(b[:])
	ms := time.Now().UnixMilli()
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], uint64(ms))
	return fmt.Sprintf("xaiop_%d_%s_%s", seq, hex.EncodeToString(buf[4:]), hex.EncodeToString(b[:3]))
}
