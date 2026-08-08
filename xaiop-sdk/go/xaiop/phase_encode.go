package xaiop

import "fmt"

// PhaseEncodeOptions controls trailing phase '.' for skeleton push.
type PhaseEncodeOptions struct {
	Final  bool // when true, omit trailing ".\n"
	Encode EncodeOptions
}

// PhaseEncodeJSON encodes a single Diff/phase payload as XAIOP with
// DotPolicy forced to "none" (Node phaseEncode).
func PhaseEncodeJSON(value any, opts EncodeOptions) (string, error) {
	opts.DotPolicy = "none"
	if opts.Style == "" {
		opts.Style = "relative"
	}
	if !opts.TrailingNewline {
		opts.TrailingNewline = true
	}
	return Encode(value, opts)
}

// PhaseEncodeObject is an alias for PhaseEncodeJSON for object roots.
func PhaseEncodeObject(value map[string]any, opts EncodeOptions) (string, error) {
	return PhaseEncodeJSON(value, opts)
}

// PhaseEncodeKeyValue encodes {key: value} as one skeleton phase (append ".\n" unless Final).
func PhaseEncodeKeyValue(key string, value any, opts PhaseEncodeOptions) (string, error) {
	if key == "" {
		return "", fmt.Errorf("phase key must be a non-empty string")
	}
	return finishPhaseEncode(map[string]any{key: value}, opts)
}

// PhaseEncodeObjectPhase encodes a plain object as one skeleton phase.
func PhaseEncodeObjectPhase(obj map[string]any, opts PhaseEncodeOptions) (string, error) {
	if obj == nil {
		return "", fmt.Errorf("phase object must be a plain object")
	}
	return finishPhaseEncode(obj, opts)
}

func finishPhaseEncode(value any, opts PhaseEncodeOptions) (string, error) {
	enc := opts.Encode
	enc.DotPolicy = "none"
	if enc.Style == "" {
		enc.Style = "relative"
	}
	enc.TrailingNewline = true
	wire, err := Encode(value, enc)
	if err != nil {
		return "", err
	}
	if opts.Final {
		return wire, nil
	}
	if !hasTrailingNewline(wire) {
		wire += "\n"
	}
	return wire + ".\n", nil
}

func hasTrailingNewline(s string) bool {
	return len(s) > 0 && s[len(s)-1] == '\n'
}
