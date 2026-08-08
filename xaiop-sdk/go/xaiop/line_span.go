package xaiop

// AnnotationSpanKeep is the Go sentinel for Node `return undefined` (keep tree).
var AnnotationSpanKeep = &annotationSpanKeep{}

type annotationSpanKeep struct{}

func (annotationSpanKeep) String() string { return "AnnotationSpanKeep" }

// LineInterceptor rewrites or filters a logical wire line before parse.
// Return the line to use (possibly modified). Empty string drops the line.
type LineInterceptor func(line string, meta map[string]any) (string, bool)

// AnnotationSpanHandler handles a `#` annotation line within a phase.
// Return AnnotationSpanKeep to leave the tree unchanged; return a JSON value
// to remount; return nil with ok=false to skip.
type AnnotationSpanHandler func(line string, meta map[string]any) (any, bool)

// ClassifyLine returns a coarse line kind for intercept chains.
func ClassifyLine(line string) string {
	if line == "" {
		return "empty"
	}
	switch line[0] {
	case '#':
		if len(line) > 1 && line[1] == '!' {
			return "control"
		}
		return "annotation"
	case '.':
		if line == "." {
			return "dot"
		}
	case '>', '<', '-', '=', '@', '!', '&':
		return "operator"
	}
	if idx := indexByte(line, ':'); idx > 0 {
		return "content"
	}
	return "other"
}

func indexByte(s string, c byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return i
		}
	}
	return -1
}

// RunLineInterceptChain applies interceptors in order.
func RunLineInterceptChain(line string, meta map[string]any, chain []LineInterceptor) (string, bool) {
	cur := line
	keep := true
	for _, fn := range chain {
		if fn == nil {
			continue
		}
		next, ok := fn(cur, meta)
		if !ok {
			return "", false
		}
		cur = next
		keep = true
	}
	return cur, keep
}
