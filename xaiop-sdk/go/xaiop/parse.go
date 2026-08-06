package xaiop

import (
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

type nodeKind string

const (
	kindObject   nodeKind = "object"
	kindArray    nodeKind = "array"
	kindFragment nodeKind = "fragment"
)

type docKind string

const (
	docNone     docKind = "none"
	docObject   docKind = "object"
	docArray    docKind = "array"
	docFragment docKind = "fragment"
)

type phase string

const (
	phaseInit   phase = "init"
	phaseActive phase = "active"
)

var floatTokenRE = regexp.MustCompile(
	`^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$|^[+-]?\d+[eE][+-]?\d+$`,
)

var operatorHeads = map[rune]bool{
	'>': true, '<': true, '=': true, '!': true, '&': true,
	'#': true, '.': true, '-': true,
}

type frame struct {
	kind   nodeKind
	value  any
	viaKey string
}

type parser struct {
	lines            []string
	lineNo           int
	fed              int
	root             any
	fragmentEntries  map[string]any
	docKind          docKind
	stack            []frame
	broadcastStacks  [][]frame
	phase            phase
}

// Parse parses a complete XAIOP wire document (STRICT mode only).
func Parse(source string) (any, error) {
	p := &parser{
		lines:   splitLines(source),
		docKind: docNone,
		phase:   phaseInit,
	}
	return p.parse()
}

func newLiveParser() *parser {
	return &parser{docKind: docNone, phase: phaseInit}
}

func (p *parser) feedLineFast(line string) error {
	p.fed++
	p.lineNo = p.fed
	logical := line
	if p.fed == 1 {
		logical = stripBOM(line)
	}
	if len(logical) == 0 {
		return &SyntaxError{Message: "empty line is a Content syntax error", Line: p.lineNo}
	}
	return p.handleLine(logical)
}

func (p *parser) result() any {
	if p.docKind == docFragment {
		return &Fragment{Entries: p.fragmentEntries}
	}
	if p.root == nil {
		return map[string]any{}
	}
	if arr, ok := p.root.(*[]any); ok {
		return *arr
	}
	return p.root
}

func (p *parser) parse() (any, error) {
	for i, raw := range p.lines {
		p.lineNo = i + 1
		line := raw
		if i == 0 {
			line = stripBOM(raw)
		}
		if len(line) == 0 {
			return nil, &SyntaxError{Message: "empty line is a Content syntax error", Line: p.lineNo}
		}
		if err := p.handleLine(line); err != nil {
			return nil, err
		}
	}
	return p.result(), nil
}

func (p *parser) syntax(msg string) *SyntaxError {
	return &SyntaxError{Message: msg, Line: p.lineNo}
}

func (p *parser) handleLine(line string) error {
	if strings.HasPrefix(line, "#") {
		return nil
	}

	switch {
	case line == ".":
		p.resetToRoot()
		return nil
	case line == "<":
		if err := p.precheckBroadcastPop(); err != nil {
			return err
		}
		return p.runOnCursors(p.popOnly)
	case strings.HasPrefix(line, "<") && len(line) > 1:
		name := line[1:]
		if err := assertName(name, p.lineNo); err != nil {
			return err
		}
		if err := p.precheckBroadcastPop(); err != nil {
			return err
		}
		return p.runOnCursors(func() error {
			if err := p.popOnly(); err != nil {
				return err
			}
			return p.createEnterNamedObject(name)
		})
	case strings.HasPrefix(line, "="):
		if err := p.requireNotBroadcast("="); err != nil {
			return err
		}
		return p.locatePath(line[1:])
	case strings.HasPrefix(line, "@"):
		return p.exactEnter(line[1:])
	case strings.HasPrefix(line, "!"):
		if err := p.requireNotBroadcast("!"); err != nil {
			return err
		}
		return p.broadcastEnter(line[1:])
	case strings.HasPrefix(line, "&"):
		return p.deleteAtPath(line[1:])
	case line == ">":
		return p.runOnCursors(p.createEnterAnonymousObject)
	case line == "-":
		return p.runOnCursors(p.createEnterAnonymousArray)
	case strings.HasPrefix(line, ">") && strings.HasSuffix(line, "-") && len(line) > 2:
		name := line[1 : len(line)-1]
		if err := assertName(name, p.lineNo); err != nil {
			return err
		}
		return p.runOnCursors(func() error { return p.createEnterNamedArray(name) })
	case strings.HasPrefix(line, ">") && len(line) > 1:
		if strings.Contains(line, ">>") {
			return p.syntax("same-symbol stacking >> is forbidden")
		}
		name := line[1:]
		if strings.Contains(name, ">") {
			parts := strings.Split(name, ">")
			for _, part := range parts {
				if err := assertName(part, p.lineNo); err != nil {
					return err
				}
			}
			return p.runOnCursors(func() error {
				for _, part := range parts {
					if err := p.createEnterNamedObject(part); err != nil {
						return err
					}
				}
				return nil
			})
		}
		if err := assertName(name, p.lineNo); err != nil {
			return err
		}
		return p.runOnCursors(func() error { return p.createEnterNamedObject(name) })
	}

	colon := strings.IndexByte(line, ':')
	if colon == -1 {
		return p.syntax("Bare Label or unknown line form: " + repr(line))
	}
	key := line[:colon]
	rawValue := line[colon+1:]
	value := parseValue(rawValue)
	return p.runOnCursors(func() error { return p.writeContent(key, value) })
}

func repr(s string) string {
	return strconv.Quote(s)
}

func (p *parser) requireNotBroadcast(op string) error {
	if p.broadcastStacks != nil {
		return p.syntax(op + " while broadcast mode is active (emit . to reset first)")
	}
	return nil
}

func (p *parser) precheckBroadcastPop() error {
	if p.broadcastStacks == nil {
		return nil
	}
	for _, st := range p.broadcastStacks {
		if len(st) <= 1 {
			return p.syntax("< at Root is illegal")
		}
	}
	return nil
}

func (p *parser) runOnCursors(fn func() error) error {
	if p.broadcastStacks == nil {
		return fn()
	}
	stacks := p.broadcastStacks
	for i := range stacks {
		p.stack = append([]frame(nil), stacks[i]...)
		if err := fn(); err != nil {
			return err
		}
		stacks[i] = append([]frame(nil), p.stack...)
	}
	p.stack = append([]frame(nil), stacks[0]...)
	return nil
}

func (p *parser) ensureDocumentObjectRoot() {
	if p.phase == phaseInit || p.docKind == docNone {
		p.root = map[string]any{}
		p.docKind = docObject
		p.fragmentEntries = nil
		p.stack = []frame{{kind: kindObject, value: p.root}}
		p.phase = phaseActive
	}
}

func (p *parser) ensureFragmentRoot() {
	if p.docKind == docObject || p.docKind == docArray {
		return
	}
	if p.docKind != docFragment {
		p.docKind = docFragment
		p.fragmentEntries = map[string]any{}
		p.root = nil
		p.stack = []frame{{kind: kindFragment, value: p.fragmentEntries}}
		p.phase = phaseActive
	}
}

func (p *parser) resetToRoot() {
	p.broadcastStacks = nil
	if p.docKind == docNone {
		p.stack = nil
		p.phase = phaseInit
		return
	}
	if p.docKind == docFragment {
		p.stack = []frame{{kind: kindFragment, value: p.fragmentEntries}}
		p.phase = phaseActive
		return
	}
	kind := kindObject
	if _, ok := p.root.(*[]any); ok {
		kind = kindArray
	} else if _, ok := p.root.([]any); ok {
		kind = kindArray
	}
	p.stack = []frame{{kind: kind, value: p.root}}
	p.phase = phaseActive
}

func (p *parser) current() (frame, error) {
	if len(p.stack) == 0 {
		return frame{}, p.syntax("Cursor is at Root with no container")
	}
	return p.stack[len(p.stack)-1], nil
}

func (p *parser) popOnly() error {
	if len(p.stack) <= 1 {
		return p.syntax("< at Root is illegal")
	}
	p.stack = p.stack[:len(p.stack)-1]
	return nil
}

func (p *parser) createEnterAnonymousObject() error {
	if p.phase == phaseInit || p.docKind == docNone {
		p.root = map[string]any{}
		p.docKind = docObject
		p.fragmentEntries = nil
		p.stack = []frame{{kind: kindObject, value: p.root}}
		p.phase = phaseActive
		return nil
	}
	if p.docKind == docFragment {
		return p.syntax(
			"bare > after fragment bindings: declare anonymous root first " +
				"with a leading >, or stay in fragment with >name",
		)
	}
	cur, err := p.current()
	if err != nil {
		return err
	}
	if cur.kind == kindArray {
		obj := map[string]any{}
		if err := p.appendToArrayFrame(len(p.stack)-1, obj); err != nil {
			return err
		}
		p.stack = append(p.stack, frame{kind: kindObject, value: obj})
		return nil
	}
	if cur.kind == kindObject {
		return nil
	}
	return p.syntax("bare > creates an array element or root object; unexpected Cursor kind")
}

func (p *parser) createEnterAnonymousArray() error {
	if p.phase == phaseInit || p.docKind == docNone {
		arr := &[]any{}
		p.root = arr
		p.docKind = docArray
		p.fragmentEntries = nil
		p.stack = []frame{{kind: kindArray, value: arr}}
		p.phase = phaseActive
		return nil
	}
	if p.docKind == docFragment {
		return p.syntax(
			"bare - cannot open root array after fragment mode began; start the Stream with -",
		)
	}
	cur, err := p.current()
	if err != nil {
		return err
	}
	if cur.kind != kindArray {
		return p.syntax(
			"bare - opens a nested array element or root array; for a named array use >name-",
		)
	}
	arr := &[]any{}
	if err := p.appendToArrayFrame(len(p.stack)-1, *arr); err != nil {
		return err
	}
	p.stack = append(p.stack, frame{kind: kindArray, value: arr})
	return nil
}

func (p *parser) createEnterNamedObject(name string) error {
	if p.phase == phaseInit || p.docKind == docNone {
		p.ensureFragmentRoot()
	} else if p.docKind == docFragment && len(p.stack) == 0 {
		p.ensureFragmentRoot()
	}
	cur, err := p.current()
	if err != nil {
		return err
	}
	if cur.kind == kindArray {
		return p.syntax(
			">name while Cursor is inside an array (use < to leave array first): >" + name,
		)
	}
	obj := asStringMap(cur.value)
	existing, ok := obj[name]
	if ok && existing != nil {
		if m, isMap := existing.(map[string]any); isMap {
			p.stack = append(p.stack, frame{kind: kindObject, value: m, viaKey: name})
			return nil
		}
	}
	nxt := map[string]any{}
	obj[name] = nxt
	p.stack = append(p.stack, frame{kind: kindObject, value: nxt, viaKey: name})
	return nil
}

func (p *parser) createEnterNamedArray(name string) error {
	if p.phase == phaseInit || p.docKind == docNone {
		p.ensureFragmentRoot()
	}
	cur, err := p.current()
	if err != nil {
		return err
	}
	if cur.kind == kindArray {
		return p.syntax(
			">name- while Cursor is inside an array (use < to leave first): >" + name + "-",
		)
	}
	obj := asStringMap(cur.value)
	existing, ok := obj[name]
	if ok {
		if arr, isArr := existing.([]any); isArr {
			ptr := &arr
			obj[name] = arr
			p.stack = append(p.stack, frame{kind: kindArray, value: ptr, viaKey: name})
			return nil
		}
	}
	nxt := []any{}
	ptr := &nxt
	obj[name] = nxt
	p.stack = append(p.stack, frame{kind: kindArray, value: ptr, viaKey: name})
	return nil
}

func (p *parser) writeContent(key string, value any) error {
	if p.phase == phaseInit || p.docKind == docNone {
		p.ensureFragmentRoot()
	}
	cur, err := p.current()
	if err != nil {
		return err
	}
	if cur.kind == kindArray {
		arrPtr, err := p.arrayPtrForFrame(len(p.stack) - 1)
		if err != nil {
			return err
		}
		if key == "" {
			*arrPtr = append(*arrPtr, value)
		} else {
			*arrPtr = append(*arrPtr, map[string]any{key: value})
		}
		return p.propagateArrayFromFrame(len(p.stack) - 1)
	}
	if key == "" {
		return p.syntax(":value scalar Content is only valid at array level")
	}
	obj := asStringMap(cur.value)
	obj[key] = value
	return nil
}

func (p *parser) locatePath(path string) error {
	if p.docKind == docNone {
		return p.syntax("=path before any tree exists")
	}
	if path == "" {
		return p.syntax("empty = path")
	}
	tree := p.root
	if p.docKind == docFragment {
		tree = p.fragmentEntries
	}
	segs := pathSegmentsOf(path)
	found := fuzzyFind(tree, segs, nil)
	if found == nil {
		return p.syntax("=path not found: " + path)
	}
	p.stack = found
	p.phase = phaseActive
	return nil
}

func (p *parser) exactEnter(path string) error {
	if err := p.requireNotBroadcast("@"); err != nil {
		return err
	}
	segments, err := splitPathSegments(path, p.lineNo, "@")
	if err != nil {
		return err
	}
	if p.docKind == docNone {
		p.ensureDocumentObjectRoot()
	}
	p.broadcastStacks = nil

	if p.docKind == docFragment {
		p.stack = []frame{{kind: kindFragment, value: p.fragmentEntries}}
	} else {
		kind := kindObject
		if _, ok := p.root.(*[]any); ok {
			kind = kindArray
		}
		p.stack = []frame{{kind: kind, value: p.root}}
	}
	p.phase = phaseActive

	for i, seg := range segments {
		cur, err := p.current()
		if err != nil {
			return err
		}
		if cur.kind == kindArray {
			return p.syntax(
				"@path cannot descend by name while Cursor is inside an array: @" + path,
			)
		}
		obj := asStringMap(cur.value)
		existing, ok := obj[seg]
		isLast := i == len(segments)-1

		if arr, isArr := existing.([]any); isArr {
			if !isLast {
				nxt := map[string]any{}
				obj[seg] = nxt
				p.stack = append(p.stack, frame{kind: kindObject, value: nxt, viaKey: seg})
			} else {
				ptr := &arr
				obj[seg] = arr
				p.stack = append(p.stack, frame{kind: kindArray, value: ptr, viaKey: seg})
			}
			continue
		}

		if ok && existing != nil {
			if m, isMap := existing.(map[string]any); isMap {
				p.stack = append(p.stack, frame{kind: kindObject, value: m, viaKey: seg})
				continue
			}
		}

		nxt := map[string]any{}
		obj[seg] = nxt
		p.stack = append(p.stack, frame{kind: kindObject, value: nxt, viaKey: seg})
	}
	return nil
}

func (p *parser) broadcastEnter(path string) error {
	if p.docKind == docNone {
		return p.syntax("!path before any tree exists")
	}
	segments, err := splitPathSegments(path, p.lineNo, "!")
	if err != nil {
		return err
	}
	matches := [][]frame{}
	tree := p.root
	if p.docKind == docFragment {
		tree = p.fragmentEntries
	}
	rootKind := kindObject
	if p.docKind == docFragment {
		rootKind = kindFragment
	} else if _, ok := tree.(*[]any); ok {
		rootKind = kindArray
	} else if _, ok := tree.([]any); ok {
		rootKind = kindArray
	}
	collectPathMatches(tree, rootKind, segments, &matches, nil)
	if len(matches) == 0 {
		return p.syntax("!path no match: " + path)
	}
	p.broadcastStacks = make([][]frame, len(matches))
	for i, m := range matches {
		p.broadcastStacks[i] = append([]frame(nil), m...)
	}
	p.stack = append([]frame(nil), p.broadcastStacks[0]...)
	p.phase = phaseActive
	return nil
}

func (p *parser) deleteAtPath(path string) error {
	segments, err := splitPathSegments(path, p.lineNo, "&")
	if err != nil {
		return err
	}
	if p.broadcastStacks != nil {
		if err := p.precheckBroadcastDelete(segments); err != nil {
			return err
		}
		return p.runOnCursors(func() error { return p.deleteRelative(segments) })
	}
	return p.deleteAbsolute(segments)
}

func (p *parser) precheckBroadcastDelete(segments []string) error {
	if p.broadcastStacks == nil {
		return nil
	}
	stacks := p.broadcastStacks
	for i := range stacks {
		p.stack = append([]frame(nil), stacks[i]...)
		if err := p.precheckRelativeDelete(segments); err != nil {
			return err
		}
	}
	p.stack = append([]frame(nil), stacks[0]...)
	return nil
}

func (p *parser) deleteAbsolute(segments []string) error {
	if p.docKind == docNone {
		return nil
	}
	if p.docKind == docFragment {
		return p.syntax("&path requires an object document root (fragment root is not allowed)")
	}
	if _, ok := p.root.(*[]any); ok {
		return p.syntax("&path requires an object document root")
	}
	if _, ok := p.root.([]any); ok {
		return p.syntax("&path requires an object document root")
	}
	return p.deleteFromObject(asStringMap(p.root), segments)
}

func (p *parser) deleteRelative(segments []string) error {
	cur, err := p.current()
	if err != nil {
		return err
	}
	if cur.kind != kindObject && cur.kind != kindFragment {
		return p.syntax("&path relative delete requires an object Cursor")
	}
	return p.deleteFromObject(asStringMap(cur.value), segments)
}

func (p *parser) precheckRelativeDelete(segments []string) error {
	cur, err := p.current()
	if err != nil {
		return err
	}
	if cur.kind != kindObject && cur.kind != kindFragment {
		return p.syntax("&path relative delete requires an object Cursor")
	}
	obj := cur.value
	for i, seg := range segments {
		m, ok := obj.(map[string]any)
		if !ok || m == nil {
			return nil
		}
		if _, has := m[seg]; !has {
			return nil
		}
		nxt := m[seg]
		if i == len(segments)-1 {
			return p.assertDeleteNotOnCursorChain(nxt)
		}
		if nxt == nil {
			return nil
		}
		if _, isMap := nxt.(map[string]any); !isMap {
			return nil
		}
		obj = nxt
	}
	return nil
}

func (p *parser) deleteFromObject(start map[string]any, segments []string) error {
	obj := start
	for _, seg := range segments[:len(segments)-1] {
		if obj == nil {
			return nil
		}
		nxt, ok := obj[seg]
		if !ok {
			return nil
		}
		m, isMap := nxt.(map[string]any)
		if !isMap || m == nil {
			return nil
		}
		obj = m
	}
	last := segments[len(segments)-1]
	if obj == nil {
		return nil
	}
	target, ok := obj[last]
	if !ok {
		return nil
	}
	if err := p.assertDeleteNotOnCursorChain(target); err != nil {
		return err
	}
	delete(obj, last)
	return nil
}

func (p *parser) assertDeleteNotOnCursorChain(target any) error {
	if target == nil {
		return nil
	}
	_, isMap := target.(map[string]any)
	_, isArr := target.([]any)
	if !isMap && !isArr {
		return nil
	}
	stacks := [][]frame{}
	if p.broadcastStacks != nil {
		stacks = p.broadcastStacks
	} else {
		stacks = [][]frame{p.stack}
	}
	for _, st := range stacks {
		for _, fr := range st {
			if sameRef(fr.value, target) {
				return p.syntax("&path deletes a node on the Cursor chain")
			}
		}
	}
	return nil
}

func sameRef(a, b any) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	va := reflect.ValueOf(a)
	vb := reflect.ValueOf(b)
	if va.Type() != vb.Type() {
		// *[]any frame vs []any stored value
		if ptr, ok := a.(*[]any); ok {
			if arr, ok := b.([]any); ok {
				return reflect.ValueOf(ptr).Elem().Pointer() == reflect.ValueOf(arr).Pointer()
			}
		}
		if ptr, ok := b.(*[]any); ok {
			if arr, ok := a.([]any); ok {
				return reflect.ValueOf(ptr).Elem().Pointer() == reflect.ValueOf(arr).Pointer()
			}
		}
		return false
	}
	return va.Pointer() == vb.Pointer()
}

func (p *parser) cursorRestoreLines() ([]string, error) {
	if p.broadcastStacks != nil {
		return nil, p.syntax("cursor restore is not available while broadcast mode is active")
	}
	lines := []string{}
	for _, fr := range p.stack[1:] {
		via := fr.viaKey
		if via == "" {
			return nil, p.syntax(
				"cannot restore Cursor after . (anonymous or array-element frame on stack)",
			)
		}
		if fr.kind == kindArray {
			lines = append(lines, ">"+via+"-")
		} else {
			lines = append(lines, ">"+via)
		}
	}
	return lines, nil
}

func splitLines(source string) []string {
	if len(source) == 0 {
		return nil
	}
	var lines []string
	start := 0
	n := len(source)
	for i := 0; i < n; i++ {
		c := source[i]
		if c == '\n' {
			lines = append(lines, source[start:i])
			start = i + 1
		} else if c == '\r' {
			lines = append(lines, source[start:i])
			if i+1 < n && source[i+1] == '\n' {
				start = i + 2
				i++
			} else {
				start = i + 1
			}
		}
	}
	if start < n {
		lines = append(lines, source[start:])
	}
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

func stripBOM(s string) string {
	return strings.TrimPrefix(s, "\uFEFF")
}

func assertName(name string, lineNo int) error {
	if name == "" {
		return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
	}
	for _, c := range name {
		if unicode.IsSpace(c) {
			return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
		}
	}
	if strings.Contains(name, ":") || strings.HasSuffix(name, "-") {
		return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
	}
	if len(name) > 0 && operatorHeads[rune(name[0])] {
		return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
	}
	if strings.ContainsAny(name, "@&") {
		return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
	}
	return nil
}

func splitPathSegments(path string, lineNo int, op string) ([]string, error) {
	if path == "" {
		return nil, &SyntaxError{Message: "empty " + op + " path", Line: lineNo}
	}
	if strings.Contains(path, ">>") || strings.HasPrefix(path, ">") || strings.HasSuffix(path, ">") {
		return nil, &SyntaxError{Message: "invalid " + op + " path: " + repr(path), Line: lineNo}
	}
	parts := strings.Split(path, ">")
	for _, s := range parts {
		if s == "" {
			return nil, &SyntaxError{Message: "invalid " + op + " path: " + repr(path), Line: lineNo}
		}
		if err := assertName(s, lineNo); err != nil {
			return nil, err
		}
	}
	return parts, nil
}

func pathSegmentsOf(path string) []string {
	parts := strings.Split(path, ">")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func parseValue(rawValue string) any {
	if len(rawValue) > 0 && rawValue[0] == ' ' {
		i := 1
		for i < len(rawValue) && rawValue[i] == ' ' {
			i++
		}
		return rawValue[i:]
	}
	switch rawValue {
	case "true":
		return true
	case "false":
		return false
	case "null":
		return nil
	}
	if isIntToken(rawValue) {
		n, _ := strconv.ParseInt(rawValue, 10, 64)
		return n
	}
	if isFloatToken(rawValue) {
		f, _ := strconv.ParseFloat(rawValue, 64)
		return f
	}
	return rawValue
}

func isIntToken(s string) bool {
	if s == "" {
		return false
	}
	i := 0
	if s[0] == '-' || s[0] == '+' {
		i = 1
	}
	if i >= len(s) {
		return false
	}
	for j := i; j < len(s); j++ {
		if s[j] < '0' || s[j] > '9' {
			return false
		}
	}
	return true
}

func isFloatToken(s string) bool {
	return floatTokenRE.MatchString(s)
}

func tryExactDescend(
	obj map[string]any,
	parentFrame frame,
	trail []frame,
	segments []string,
) []frame {
	if _, ok := obj[segments[0]]; !ok {
		return nil
	}
	stack := append(append([]frame(nil), trail...), parentFrame)
	node := any(obj)
	for _, seg := range segments {
		m, ok := node.(map[string]any)
		if !ok || m == nil {
			return nil
		}
		child, has := m[seg]
		if !has {
			return nil
		}
		if child == nil {
			return nil
		}
		_, isMap := child.(map[string]any)
		_, isArr := child.([]any)
		if !isMap && !isArr {
			return nil
		}
		kind := kindObject
		if _, isArr := child.([]any); isArr {
			kind = kindArray
		}
		stack = append(stack, frame{kind: kind, value: child})
		node = child
	}
	return stack
}

func collectPathMatches(
	node any,
	nodeKind nodeKind,
	segments []string,
	out *[][]frame,
	trail []frame,
) {
	if node == nil {
		return
	}
	arr, isArr := asArrayNode(node)
	_, isMap := node.(map[string]any)
	if !isMap && !isArr {
		return
	}

	if isArr || nodeKind == kindArray {
		fr := frame{kind: kindArray, value: arrayPtr(arr)}
		for _, el := range arr {
			if el == nil {
				continue
			}
			_, elMap := el.(map[string]any)
			_, elArr := el.([]any)
			if !elMap && !elArr {
				continue
			}
			kind := kindObject
			if elArr {
				kind = kindArray
			}
			collectPathMatches(el, kind, segments, out, append(trail, fr))
		}
		return
	}

	obj := node.(map[string]any)
	fr := frame{kind: kindFragment, value: obj}
	if nodeKind != kindFragment {
		fr.kind = kindObject
	}
	matched := tryExactDescend(obj, fr, trail, segments)
	startKey := segments[0]
	if matched != nil {
		*out = append(*out, matched)
		for key, child := range obj {
			if key == startKey {
				continue
			}
			if child == nil {
				continue
			}
			_, cMap := child.(map[string]any)
			_, cArr := child.([]any)
			if !cMap && !cArr {
				continue
			}
			kind := kindObject
			if cArr {
				kind = kindArray
			}
			collectPathMatches(child, kind, segments, out, append(trail, fr))
		}
		return
	}

	for _, child := range obj {
		if child == nil {
			continue
		}
		_, cMap := child.(map[string]any)
		_, cArr := child.([]any)
		if !cMap && !cArr {
			continue
		}
		kind := kindObject
		if cArr {
			kind = kindArray
		}
		collectPathMatches(child, kind, segments, out, append(trail, fr))
	}
}

func fuzzyFind(node any, segments []string, trail []frame) []frame {
	if len(segments) == 0 {
		if len(trail) > 0 {
			return trail
		}
		return nil
	}
	if node == nil {
		return nil
	}
	arr, isArr := asArrayNode(node)
	_, isMap := node.(map[string]any)
	if !isMap && !isArr {
		return nil
	}

	if isArr {
		fr := frame{kind: kindArray, value: arrayPtr(arr)}
		for _, el := range arr {
			hit := fuzzyFind(el, segments, append(trail, fr))
			if hit != nil {
				return hit
			}
		}
		return nil
	}

	obj := node.(map[string]any)
	fr := frame{kind: kindObject, value: obj}
	head := segments[0]
	rest := segments[1:]

	tryChild := func(child any) []frame {
		base := append(trail, fr)
		if len(rest) == 0 {
			if child != nil {
				_, cMap := child.(map[string]any)
				_, cArr := child.([]any)
				if cMap || cArr {
					kind := kindObject
					if cArr {
						kind = kindArray
					}
					return append(base, frame{kind: kind, value: child})
				}
			}
			return base
		}
		if child != nil {
			_, cMap := child.(map[string]any)
			_, cArr := child.([]any)
			if cMap || cArr {
				return fuzzyFind(child, rest, base)
			}
		}
		return nil
	}

	if child, ok := obj[head]; ok {
		if hit := tryChild(child); hit != nil {
			return hit
		}
	}

	for _, child := range obj {
		if child == nil {
			continue
		}
		_, cMap := child.(map[string]any)
		_, cArr := child.([]any)
		if !cMap && !cArr {
			continue
		}
		if hit := fuzzyFind(child, segments, append(trail, fr)); hit != nil {
			return hit
		}
	}
	return nil
}

func asStringMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	panic("expected map[string]any")
}

func (p *parser) arrayPtrForFrame(frameIdx int) (*[]any, error) {
	fr := p.stack[frameIdx]
	if ptr, ok := fr.value.(*[]any); ok {
		return ptr, nil
	}
	if arr, ok := fr.value.([]any); ok {
		ptr := &arr
		p.stack[frameIdx].value = ptr
		if frameIdx == 0 {
			if p.docKind == docArray {
				p.root = ptr
			}
			return ptr, nil
		}
		parent := p.stack[frameIdx-1]
		if parent.kind == kindObject {
			obj := asStringMap(parent.value)
			if fr.viaKey == "" {
				return nil, p.syntax("internal array frame missing viaKey under object parent")
			}
			obj[fr.viaKey] = arr
			return ptr, nil
		}
		if parent.kind == kindArray {
			parentPtr, err := p.arrayPtrForFrame(frameIdx - 1)
			if err != nil {
				return nil, err
			}
			(*parentPtr)[len(*parentPtr)-1] = arr
			return ptr, nil
		}
	}
	return nil, p.syntax("internal array frame has unexpected value type")
}

func (p *parser) appendToArrayFrame(frameIdx int, value any) error {
	arrPtr, err := p.arrayPtrForFrame(frameIdx)
	if err != nil {
		return err
	}
	*arrPtr = append(*arrPtr, value)
	return p.propagateArrayFromFrame(frameIdx)
}

func (p *parser) propagateArrayFromFrame(frameIdx int) error {
	arr := *p.stack[frameIdx].value.(*[]any)
	if frameIdx == 0 {
		if p.docKind == docArray {
			p.root = p.stack[frameIdx].value
		}
		return nil
	}
	parent := p.stack[frameIdx-1]
	if parent.kind == kindArray {
		parentPtr := parent.value.(*[]any)
		child := p.stack[frameIdx]
		if child.viaKey != "" {
			return p.syntax("internal array frame has viaKey under array parent")
		}
		(*parentPtr)[len(*parentPtr)-1] = arr
		return p.propagateArrayFromFrame(frameIdx - 1)
	}
	obj := asStringMap(parent.value)
	key := p.stack[frameIdx].viaKey
	if key == "" {
		return p.syntax("internal array frame missing viaKey under object parent")
	}
	obj[key] = arr
	return nil
}

func asArrayNode(node any) ([]any, bool) {
	if arr, ok := node.([]any); ok {
		return arr, true
	}
	if ptr, ok := node.(*[]any); ok {
		return *ptr, true
	}
	return nil, false
}

func arrayPtr(arr []any) *[]any {
	return &arr
}
