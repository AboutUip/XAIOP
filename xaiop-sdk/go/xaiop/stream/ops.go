package stream

// Package-private checkpoint helpers (Diff wire shaping · cover · line scan).

// LineInfo is the result of ReadLine.
type LineInfo struct {
	Line             string
	End              int
	ConsumedNewline  bool
}

// ReadLine scans one line from text starting at from.
// When atEOF is false and no newline is found, returns nil (incomplete).
func ReadLine(text string, from int, atEOF bool) *LineInfo {
	if from >= len(text) {
		return nil
	}
	n := len(text)
	for i := from; i < n; i++ {
		if text[i] == '\n' {
			end := i
			if end > from && text[end-1] == '\r' {
				end--
			}
			return &LineInfo{
				Line:            text[from:end],
				End:             i + 1,
				ConsumedNewline: true,
			}
		}
	}
	if !atEOF {
		return nil
	}
	return &LineInfo{
		Line:            text[from:],
		End:             n,
		ConsumedNewline: false,
	}
}

// LinesToWire joins lines with newlines and a trailing newline.
func LinesToWire(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	n := 0
	for _, line := range lines {
		n += len(line) + 1
	}
	buf := make([]byte, 0, n)
	for i, line := range lines {
		if i > 0 {
			buf = append(buf, '\n')
		}
		buf = append(buf, line...)
	}
	buf = append(buf, '\n')
	return string(buf)
}

// IsAmpLine reports whether line starts with '&'.
func IsAmpLine(line string) bool {
	return len(line) > 0 && line[0] == '&'
}

func splitPathSegments(path string) []string {
	var segs []string
	start := 0
	n := len(path)
	for i := 0; i < n; i++ {
		if path[i] == '>' {
			if i > start {
				segs = append(segs, path[start:i])
			}
			start = i + 1
		}
	}
	if start < n {
		segs = append(segs, path[start:])
	}
	return segs
}

// BuildDeleteTombstone builds deepest-key null tombstones from &path lines.
func BuildDeleteTombstone(amps []string) map[string]any {
	root := map[string]any{}
	for _, line := range amps {
		path := line[1:]
		segments := splitPathSegments(path)
		if len(segments) == 0 {
			continue
		}
		cur := root
		for _, seg := range segments[:len(segments)-1] {
			existing, ok := cur[seg]
			if !ok {
				next := map[string]any{}
				cur[seg] = next
				cur = next
				continue
			}
			m, ok := existing.(map[string]any)
			if !ok {
				next := map[string]any{}
				cur[seg] = next
				cur = next
				continue
			}
			cur = m
		}
		cur[segments[len(segments)-1]] = nil
	}
	return root
}

// WithLeadingDot ensures phase wire starts with a leading '.' phase marker.
func WithLeadingDot(raw string) string {
	if raw == "." || hasPrefix(raw, ".\n") || hasPrefix(raw, ".\r\n") {
		return raw
	}
	if hasPrefix(raw, "\n") {
		return "." + raw
	}
	return ".\n" + raw
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}

// FirstPhaseLine returns the first substantive phase line (skip leading '.' / blanks).
func FirstPhaseLine(raw string) string {
	i := 0
	n := len(raw)
	for i < n {
		if raw[i] == '\r' || raw[i] == '\n' {
			i++
			continue
		}
		j := i
		for j < n && raw[j] != '\n' && raw[j] != '\r' {
			j++
		}
		line := raw[i:j]
		if len(line) > 0 && line[len(line)-1] == '\r' {
			line = line[:len(line)-1]
		}
		if line == "." || line == "" {
			i = j + 1
			continue
		}
		return line
	}
	return ""
}

// PhaseHasBareDocumentRoot reports whether the phase opens with '>' or '-'.
func PhaseHasBareDocumentRoot(raw string) bool {
	line := FirstPhaseLine(raw)
	return line == ">" || line == "-"
}

// EnsureDiffDocumentRoot prefixes a synthetic object root when needed for Diff parse.
func EnsureDiffDocumentRoot(raw string, rootKind string) string {
	if PhaseHasBareDocumentRoot(raw) {
		return raw
	}
	if rootKind == "array" {
		return raw
	}
	return ">\n" + raw
}

// PhaseNeedsPriorTree reports whether the phase contains = / ! / & / @ (needs prior tree).
func PhaseNeedsPriorTree(raw string) bool {
	i := 0
	n := len(raw)
	for i < n {
		if raw[i] == '\r' || raw[i] == '\n' {
			i++
			continue
		}
		c := raw[i]
		if c == '=' || c == '!' || c == '&' || c == '@' {
			return true
		}
		for i < n {
			ch := raw[i]
			if ch == '\n' {
				i++
				break
			}
			if ch == '\r' {
				i++
				if i < n && raw[i] == '\n' {
					i++
				}
				break
			}
			i++
		}
	}
	return false
}

// IsEmptyPhaseWire reports whether raw is an empty phase (only '.' / whitespace).
func IsEmptyPhaseWire(raw string) bool {
	start := 0
	end := len(raw)
	if start < end && raw[start] == '.' {
		start++
		if start < end && raw[start] == '\r' {
			start++
		}
		if start < end && raw[start] == '\n' {
			start++
		}
	}
	if end > start {
		e := end
		if e > start && raw[e-1] == '\n' {
			e--
		}
		if e > start && raw[e-1] == '\r' {
			e--
		}
		if e > start && raw[e-1] == '.' {
			e--
			if e > start && raw[e-1] == '\n' {
				e--
			}
			if e > start && raw[e-1] == '\r' {
				e--
			}
			end = e
		}
	}
	for start < end {
		c := raw[start]
		if c == ' ' || c == '\t' || c == '\n' || c == '\r' {
			start++
			continue
		}
		break
	}
	for end > start {
		c := raw[end-1]
		if c == ' ' || c == '\t' || c == '\n' || c == '\r' {
			end--
			continue
		}
		break
	}
	return start >= end
}

// NormalizeEmptyPhase returns nil for empty phase wire, otherwise value.
func NormalizeEmptyPhase(raw string, value any) any {
	if IsEmptyPhaseWire(raw) {
		return nil
	}
	return value
}
