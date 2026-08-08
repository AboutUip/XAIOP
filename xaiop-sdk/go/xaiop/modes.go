package xaiop

import "fmt"

// Stream mode constants (multi-select; default callback-only).
const (
	StreamModeCallback      = "callback"
	StreamModePromise       = "promise"
	StreamModeAsyncIterator = "asyncIterator"
	StreamModeEvents        = "events"
)

// NormalizeModes normalizes stream consumption modes.
func NormalizeModes(modes []string) (map[string]struct{}, error) {
	out := make(map[string]struct{})
	if len(modes) == 0 {
		out[StreamModeCallback] = struct{}{}
		return out, nil
	}
	for _, m := range modes {
		switch m {
		case StreamModeCallback, StreamModePromise, StreamModeAsyncIterator, StreamModeEvents:
			out[m] = struct{}{}
		default:
			return nil, fmt.Errorf("unknown stream mode: %q", m)
		}
	}
	if len(out) == 0 {
		out[StreamModeCallback] = struct{}{}
	}
	return out, nil
}
