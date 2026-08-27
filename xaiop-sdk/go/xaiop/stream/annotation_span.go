package stream

import (
	"encoding/json"
	"strings"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
)

// AnnotationSpanResult is the output of ApplyAnnotationSpans.
type AnnotationSpanResult struct {
	Lines       []string
	EscapePaths []string
}

type simFrame struct {
	kind string
	key  string
}

type captureResult struct {
	lines []string
	end   int
}

// ApplyAnnotationSpans runs # annotation-span handlers over phase lines.
// Handler semantics (via xaiop.AnnotationSpanHandler):
//   - (AnnotationSpanKeep, true) → try next handler; final keep leaves wire
//   - (nil, true) → drop # + capture
//   - (value, true) → remount JSON as sibling wire
//   - (_, false) → skip this handler
func ApplyAnnotationSpans(phaseLines []string, handlers []xaiop.AnnotationSpanHandler) AnnotationSpanResult {
	if len(handlers) == 0 {
		return AnnotationSpanResult{Lines: phaseLines}
	}
	stack := []simFrame{}
	out := make([]string, 0, len(phaseLines))
	var escapePaths []string

	i := 0
	for i < len(phaseLines) {
		line := phaseLines[i]
		if line == "." {
			out = append(out, line)
			stack = nil
			i++
			continue
		}
		if strings.HasPrefix(line, "#!") {
			out = append(out, line)
			i++
			continue
		}
		if strings.HasPrefix(line, "#") {
			depth := len(stack)
			parentPath := pathFromStack(stack)
			annotation := line[1:]
			collected := collectForwardSiblings(phaseLines, i+1, depth)
			parentKind := "object"
			if len(stack) > 0 && stack[len(stack)-1].kind == "array" {
				parentKind = "array"
			}
			jsonVal := materializeCapture(collected.lines, parentKind)
			jsonText, _ := json.Marshal(jsonVal)
			meta := map[string]any{
				"annotation":    annotation,
				"annotationRaw": line,
				"path":          parentPath,
				"depth":         depth,
				"json":          jsonVal,
				"jsonText":      string(jsonText),
				"parentKind":    parentKind,
			}

			result := any(xaiop.AnnotationSpanKeep)
			for _, fn := range handlers {
				if fn == nil {
					continue
				}
				ret, ok := fn(line, meta)
				if !ok {
					continue
				}
				if ret == xaiop.AnnotationSpanKeep {
					continue
				}
				result = ret
				break
			}

			if result == xaiop.AnnotationSpanKeep {
				out = append(out, line)
				for _, cl := range collected.lines {
					applySimLine(&stack, cl)
					out = append(out, cl)
				}
				escapePaths = append(escapePaths, addEscapeKeys(parentPath, jsonVal)...)
			} else if result == nil {
				// drop
			} else {
				remount := normalizeHandlerJSON(result)
				siblingLines := EncodeAsSiblingLines(remount, parentKind)
				for _, sibling := range siblingLines {
					applySimLine(&stack, sibling)
					out = append(out, sibling)
				}
				escapePaths = append(escapePaths, addEscapeKeys(parentPath, remount)...)
			}
			i = collected.end
			continue
		}
		applySimLine(&stack, line)
		out = append(out, line)
		i++
	}
	return AnnotationSpanResult{Lines: out, EscapePaths: uniquePaths(escapePaths)}
}

// EncodeAsSiblingLines encodes object/array as sibling wire lines (no outer > when object under object).
func EncodeAsSiblingLines(value any, parentKind string) []string {
	if value == nil {
		return nil
	}
	if parentKind == "" {
		parentKind = "object"
	}
	live, err := xaiop.Encode(value, xaiop.EncodeOptions{DotPolicy: "none", TrailingNewline: true})
	if err != nil {
		return nil
	}
	lines := splitWireLines(live)
	switch value.(type) {
	case []any:
		if parentKind == "array" && len(lines) > 0 && lines[0] == "-" {
			return lines[1:]
		}
		return lines
	case map[string]any:
		if parentKind == "array" {
			return lines
		}
		if len(lines) > 0 && lines[0] == ">" {
			return lines[1:]
		}
		return lines
	default:
		return lines
	}
}

func collectForwardSiblings(lines []string, from, baseDepth int) captureResult {
	capture := []string{}
	stack := make([]simFrame, 0, baseDepth)
	for d := 0; d < baseDepth; d++ {
		stack = append(stack, simFrame{kind: "object"})
	}
	i := from
	for i < len(lines) {
		line := lines[i]
		if line == "." {
			break
		}
		depthBefore := len(stack)
		if line == "<" || (strings.HasPrefix(line, "<") && len(line) > 1) {
			if depthBefore <= baseDepth {
				break
			}
		}
		if strings.HasPrefix(line, "=") || strings.HasPrefix(line, "@") || strings.HasPrefix(line, "!") || strings.HasPrefix(line, "?") {
			break
		}
		capture = append(capture, line)
		applySimLine(&stack, line)
		i++
	}
	return captureResult{lines: capture, end: i}
}

func materializeCapture(captureLines []string, parentKind string) any {
	if len(captureLines) == 0 {
		if parentKind == "array" {
			return []any{}
		}
		return map[string]any{}
	}
	live := xaiop.NewLiveParser()
	if parentKind == "array" {
		live.FeedLines([]string{"-"})
	} else {
		live.FeedLines([]string{">"})
	}
	live.FeedLines(captureLines)
	v, err := live.Value()
	if err != nil || v == nil {
		if parentKind == "array" {
			return []any{}
		}
		return map[string]any{}
	}
	snap := xaiop.MaterializeSnapshot(v)
	switch snap.(type) {
	case map[string]any, []any:
		return snap
	default:
		return map[string]any{"value": snap}
	}
}

func normalizeHandlerJSON(result any) any {
	switch v := result.(type) {
	case string:
		t := strings.TrimSpace(v)
		if t == "" {
			return map[string]any{}
		}
		var parsed any
		if err := json.Unmarshal([]byte(t), &parsed); err != nil {
			return map[string]any{}
		}
		return parsed
	case nil:
		return map[string]any{}
	case map[string]any, []any:
		return v
	default:
		return map[string]any{}
	}
}

func splitWireLines(text string) []string {
	t := strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n")
	parts := strings.Split(t, "\n")
	if len(parts) > 0 && parts[len(parts)-1] == "" {
		parts = parts[:len(parts)-1]
	}
	return parts
}

func applySimLine(stack *[]simFrame, line string) {
	if strings.HasPrefix(line, "#") {
		return
	}
	if line == "." {
		*stack = nil
		return
	}
	if line == "<" {
		if len(*stack) > 0 {
			*stack = (*stack)[:len(*stack)-1]
		}
		return
	}
	if strings.HasPrefix(line, "<") && len(line) > 1 {
		if len(*stack) > 0 {
			*stack = (*stack)[:len(*stack)-1]
		}
		*stack = append(*stack, simFrame{kind: "object", key: line[1:]})
		return
	}
	if strings.HasPrefix(line, "=") || strings.HasPrefix(line, "@") || strings.HasPrefix(line, "!") {
		path := line[1:]
		*stack = nil
		for _, s := range strings.Split(path, ">") {
			if s != "" {
				*stack = append(*stack, simFrame{kind: "object", key: s})
			}
		}
		return
	}
	if strings.HasPrefix(line, "?") {
		*stack = append(*stack, simFrame{kind: "object"})
		return
	}
	if strings.HasPrefix(line, "&") {
		return
	}
	if line == ">" {
		*stack = append(*stack, simFrame{kind: "object"})
		return
	}
	if line == "-" {
		*stack = append(*stack, simFrame{kind: "array"})
		return
	}
	if strings.HasPrefix(line, ">") && strings.HasSuffix(line, "-") && len(line) > 2 {
		*stack = append(*stack, simFrame{kind: "array", key: line[1 : len(line)-1]})
		return
	}
	if strings.HasPrefix(line, ">") && len(line) > 1 {
		name := line[1:]
		if strings.Contains(name, ">") {
			for _, p := range strings.Split(name, ">") {
				if p != "" {
					*stack = append(*stack, simFrame{kind: "object", key: p})
				}
			}
			return
		}
		*stack = append(*stack, simFrame{kind: "object", key: name})
	}
}

func pathFromStack(stack []simFrame) string {
	var segs []string
	for _, fr := range stack {
		if fr.key != "" {
			segs = append(segs, fr.key)
		}
	}
	return strings.Join(segs, ".")
}

func addEscapeKeys(parentPath string, jsonVal any) []string {
	if jsonVal == nil {
		return nil
	}
	switch v := jsonVal.(type) {
	case []any:
		out := make([]string, 0, len(v))
		base := parentPath
		for i := range v {
			if base == "" {
				out = append(out, "["+itoa(i)+"]")
			} else {
				out = append(out, base+"["+itoa(i)+"]")
			}
		}
		if parentPath == "" {
			out = append(out, "")
		}
		return out
	case map[string]any:
		out := make([]string, 0, len(v))
		for key := range v {
			if parentPath == "" {
				out = append(out, key)
			} else {
				out = append(out, parentPath+"."+key)
			}
		}
		return out
	default:
		if parentPath != "" {
			return []string{parentPath}
		}
		return nil
	}
}

func uniquePaths(paths []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var b [20]byte
	pos := len(b)
	for i > 0 {
		pos--
		b[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		b[pos] = '-'
	}
	return string(b[pos:])
}
