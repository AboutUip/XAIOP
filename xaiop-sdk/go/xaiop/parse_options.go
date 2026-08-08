package xaiop

import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/compat"

// ParseOptions configures ingest (strict by default).
type ParseOptions struct {
	// Compat is a snapshot from compat.Resolve; nil means strict.
	Compat map[string]bool
	// SymbolKeys enables U+001F label decode on wire names.
	SymbolKeys bool
}

// ParseWithOptions parses with optional Compat ×8 / symbolKeys.
// Nil Compat remains STRICT (same as Parse).
func ParseWithOptions(source string, opts ParseOptions) (any, error) {
	if opts.Compat == nil && !opts.SymbolKeys {
		return Parse(source)
	}
	p := newParserWithOptions(source, opts)
	return p.parseOneShot(source)
}

// ParseCompat is a convenience for ParseWithOptions with Compat=true defaults.
func ParseCompat(source string, compatArg any) (any, error) {
	return ParseWithOptions(source, ParseOptions{Compat: compat.Resolve(compatArg)})
}
