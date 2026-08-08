// Package compat implements CompatPolicy and the eight ingest fix IDs
// aligned with the Node.js xaiop 0.15.1 reference.
package compat

// Fix IDs (same strings as Node / Java / Python).
const (
	ForcedRoot             = "forcedRoot"
	RewriteBareNameArray   = "rewriteBareNameArray"
	RewriteEnterLine       = "rewriteEnterLine"
	IgnoreBareLeaveAtRoot  = "ignoreBareLeaveAtRoot"
	PopAndRetry            = "popAndRetry"
	LocatePathTrim         = "locatePathTrim"
	LocatePathStripSpaces  = "locatePathStripSpaces"
	LocatePathArraySuffix  = "locatePathArraySuffix"
)

// FixIDs is the ordered list of all eight compat fix IDs.
var FixIDs = []string{
	ForcedRoot,
	RewriteBareNameArray,
	RewriteEnterLine,
	IgnoreBareLeaveAtRoot,
	PopAndRetry,
	LocatePathTrim,
	LocatePathStripSpaces,
	LocatePathArraySuffix,
}

// DefaultFixes are the defaults when compatibility mode is on.
var DefaultFixes = map[string]bool{
	ForcedRoot:            true,
	RewriteBareNameArray:  true,
	RewriteEnterLine:      true,
	IgnoreBareLeaveAtRoot: true,
	PopAndRetry:           true,
	LocatePathTrim:        true,
	LocatePathStripSpaces: true,
	LocatePathArraySuffix: true,
}

// Policy is a mutable per-engine (or per-parse) compatibility fix map.
type Policy struct {
	ForcedRoot            bool
	RewriteBareNameArray  bool
	RewriteEnterLine      bool
	IgnoreBareLeaveAtRoot bool
	PopAndRetry           bool
	LocatePathTrim        bool
	LocatePathStripSpaces bool
	LocatePathArraySuffix bool
}

// NewPolicy builds a policy from optional overrides (missing keys use defaults).
func NewPolicy(overrides map[string]bool) *Policy {
	p := &Policy{
		ForcedRoot:            DefaultFixes[ForcedRoot],
		RewriteBareNameArray:  DefaultFixes[RewriteBareNameArray],
		RewriteEnterLine:      DefaultFixes[RewriteEnterLine],
		IgnoreBareLeaveAtRoot: DefaultFixes[IgnoreBareLeaveAtRoot],
		PopAndRetry:           DefaultFixes[PopAndRetry],
		LocatePathTrim:        DefaultFixes[LocatePathTrim],
		LocatePathStripSpaces: DefaultFixes[LocatePathStripSpaces],
		LocatePathArraySuffix: DefaultFixes[LocatePathArraySuffix],
	}
	for id, v := range overrides {
		_ = p.Set(id, v)
	}
	return p
}

// ResetToDefaults restores all eight flags to defaults.
func (p *Policy) ResetToDefaults() *Policy {
	p.ForcedRoot = DefaultFixes[ForcedRoot]
	p.RewriteBareNameArray = DefaultFixes[RewriteBareNameArray]
	p.RewriteEnterLine = DefaultFixes[RewriteEnterLine]
	p.IgnoreBareLeaveAtRoot = DefaultFixes[IgnoreBareLeaveAtRoot]
	p.PopAndRetry = DefaultFixes[PopAndRetry]
	p.LocatePathTrim = DefaultFixes[LocatePathTrim]
	p.LocatePathStripSpaces = DefaultFixes[LocatePathStripSpaces]
	p.LocatePathArraySuffix = DefaultFixes[LocatePathArraySuffix]
	return p
}

// Snapshot returns a copy of all fix flags.
func (p *Policy) Snapshot() map[string]bool {
	return map[string]bool{
		ForcedRoot:            p.ForcedRoot,
		RewriteBareNameArray:  p.RewriteBareNameArray,
		RewriteEnterLine:      p.RewriteEnterLine,
		IgnoreBareLeaveAtRoot: p.IgnoreBareLeaveAtRoot,
		PopAndRetry:           p.PopAndRetry,
		LocatePathTrim:        p.LocatePathTrim,
		LocatePathStripSpaces: p.LocatePathStripSpaces,
		LocatePathArraySuffix: p.LocatePathArraySuffix,
	}
}

// Set updates one fix flag. Returns false if fixID is unknown.
func (p *Policy) Set(fixID string, enabled bool) bool {
	switch fixID {
	case ForcedRoot:
		p.ForcedRoot = enabled
	case RewriteBareNameArray:
		p.RewriteBareNameArray = enabled
	case RewriteEnterLine:
		p.RewriteEnterLine = enabled
	case IgnoreBareLeaveAtRoot:
		p.IgnoreBareLeaveAtRoot = enabled
	case PopAndRetry:
		p.PopAndRetry = enabled
	case LocatePathTrim:
		p.LocatePathTrim = enabled
	case LocatePathStripSpaces:
		p.LocatePathStripSpaces = enabled
	case LocatePathArraySuffix:
		p.LocatePathArraySuffix = enabled
	default:
		return false
	}
	return true
}

// Get returns the flag for fixID.
func (p *Policy) Get(fixID string) bool {
	switch fixID {
	case ForcedRoot:
		return p.ForcedRoot
	case RewriteBareNameArray:
		return p.RewriteBareNameArray
	case RewriteEnterLine:
		return p.RewriteEnterLine
	case IgnoreBareLeaveAtRoot:
		return p.IgnoreBareLeaveAtRoot
	case PopAndRetry:
		return p.PopAndRetry
	case LocatePathTrim:
		return p.LocatePathTrim
	case LocatePathStripSpaces:
		return p.LocatePathStripSpaces
	case LocatePathArraySuffix:
		return p.LocatePathArraySuffix
	default:
		return false
	}
}

// Resolve normalizes a compat argument:
//   - nil / false → nil (strict)
//   - true → default policy snapshot
//   - *Policy → snapshot
//   - map[string]bool → NewPolicy overrides snapshot
func Resolve(arg any) map[string]bool {
	if arg == nil {
		return nil
	}
	switch v := arg.(type) {
	case bool:
		if !v {
			return nil
		}
		return NewPolicy(nil).Snapshot()
	case *Policy:
		if v == nil {
			return nil
		}
		return v.Snapshot()
	case Policy:
		return v.Snapshot()
	case map[string]bool:
		return NewPolicy(v).Snapshot()
	default:
		return nil
	}
}
