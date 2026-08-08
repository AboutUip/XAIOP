package xaiop

import (
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync"
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

var bareNameArrayRE = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*-$`)

var operatorHeads = map[rune]bool{
	'>': true, '<': true, '=': true, '!': true, '&': true,
	'#': true, '.': true, '-': true,
}

// ASCII operator-line heads (content keys never start with these in STRICT).
func isOperatorHeadByte(c byte) bool {
	switch c {
	case '>', '<', '=', '!', '&', '#', '.', '-', '@':
		return true
	default:
		return false
	}
}

type frame struct {
	kind   nodeKind
	value  any
	viaKey string
	obj    map[string]any // typed view when object/fragment
	arr    *[]any         // typed view when array
}

type parser struct {
	lines           []string
	lineNo          int
	fed             int
	compatRootReady bool
	root            any
	fragmentEntries map[string]any
	docKind         docKind
	stack           []frame
	broadcastStacks [][]frame
	phase           phase
	compat          map[string]bool
	symbolKeys      bool
}

func objFrame(obj map[string]any, via string) frame {
	return frame{kind: kindObject, value: obj, viaKey: via, obj: obj}
}

func fragFrame(obj map[string]any) frame {
	return frame{kind: kindFragment, value: obj, obj: obj}
}

func arrFrame(arr *[]any, via string) frame {
	return frame{kind: kindArray, value: arr, viaKey: via, arr: arr}
}

var parserPool = sync.Pool{New: func() any {
	return &parser{stack: make([]frame, 0, 32)}
}}

// Parse parses a complete XAIOP wire document (STRICT mode only).
func Parse(source string) (any, error) {
	p := parserPool.Get().(*parser)
	stack := p.stack[:0]
	*p = parser{
		docKind: docNone,
		phase:   phaseInit,
		stack:   stack,
	}
	out, err := p.parseOneShot(source)
	p.root = nil
	p.fragmentEntries = nil
	p.broadcastStacks = nil
	p.lines = nil
	p.compat = nil
	p.stack = p.stack[:0]
	parserPool.Put(p)
	return out, err
}

func newParserWithOptions(source string, opts ParseOptions) *parser {
	return &parser{
		docKind:    docNone,
		phase:      phaseInit,
		compat:     opts.Compat,
		symbolKeys: opts.SymbolKeys,
	}
}

func newLiveParser() *parser {
	return &parser{docKind: docNone, phase: phaseInit}
}

func newLiveParserWithOptions(opts ParseOptions) *parser {
	return &parser{
		docKind:    docNone,
		phase:      phaseInit,
		compat:     opts.Compat,
		symbolKeys: opts.SymbolKeys,
	}
}

func (p *parser) feedLineFast(line string) error {
	p.fed++
	p.lineNo = p.fed
	logical := line
	if p.fed == 1 {
		logical = stripBOM(line)
	}
	if p.fixEnabled("forcedRoot") && !p.compatRootReady {
		p.compatRootReady = true
		p.injectCompatRootIfNeeded(logical)
	}
	if len(logical) == 0 {
		return &SyntaxError{Message: "empty line is a Content syntax error", Line: p.lineNo}
	}
	return p.handleLineCompat(logical)
}

func (p *parser) result() any {
	if p.broadcastStacks != nil {
		saved := p.stack
		for i := range p.broadcastStacks {
			p.stack = p.broadcastStacks[i]
			p.syncOpenArrays()
			p.broadcastStacks[i] = p.stack
		}
		p.stack = saved
	}
	p.syncOpenArrays()
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

func (p *parser) syncOpenArrays() {
	for i := len(p.stack) - 1; i >= 0; i-- {
		if p.stack[i].kind == kindArray {
			p.syncArrayToParent(i)
		}
	}
}

func (p *parser) syncArrayToParent(frameIdx int) {
	fr := p.stack[frameIdx]
	if fr.kind != kindArray {
		return
	}
	ptr := fr.arr
	if ptr == nil {
		var ok bool
		ptr, ok = fr.value.(*[]any)
		if !ok {
			return
		}
	}
	if frameIdx == 0 {
		if p.docKind == docArray {
			p.root = ptr
		}
		return
	}
	parent := p.stack[frameIdx-1]
	switch parent.kind {
	case kindObject, kindFragment:
		if fr.viaKey == "" {
			return
		}
		if parent.obj != nil {
			parent.obj[fr.viaKey] = *ptr
		} else {
			parent.value.(map[string]any)[fr.viaKey] = *ptr
		}
	case kindArray:
		pp := parent.arr
		if pp == nil {
			var ok bool
			pp, ok = parent.value.(*[]any)
			if !ok || len(*pp) == 0 {
				return
			}
		}
		if len(*pp) == 0 {
			return
		}
		(*pp)[len(*pp)-1] = *ptr
	}
}

func (p *parser) parse() (any, error) {
	if p.fixEnabled("forcedRoot") {
		p.ensureCompatRootOpener()
		p.compatRootReady = true
	}
	for i, raw := range p.lines {
		p.lineNo = i + 1
		line := raw
		if i == 0 {
			line = stripBOM(raw)
		}
		if len(line) == 0 {
			return nil, &SyntaxError{Message: "empty line is a Content syntax error", Line: p.lineNo}
		}
		if err := p.handleLineCompat(line); err != nil {
			return nil, err
		}
	}
	return p.result(), nil
}

// parseOneShot feeds the wire without materializing a []string of lines.
func (p *parser) parseOneShot(source string) (any, error) {
	if p.fixEnabled("forcedRoot") {
		p.ensureCompatRootOpenerFrom(source)
		p.compatRootReady = true
	}
	if cap(p.stack) == 0 {
		p.stack = make([]frame, 0, 32)
	}
	strict := p.compat == nil
	n := len(source)
	start := 0
	lineNo := 0
	for start <= n {
		if start == n {
			break
		}
		i := start
		for i < n && source[i] != '\n' && source[i] != '\r' {
			i++
		}
		line := source[start:i]
		next := i
		if i < n {
			if source[i] == '\r' && i+1 < n && source[i+1] == '\n' {
				next = i + 2
			} else {
				next = i + 1
			}
		} else {
			next = n
		}
		if len(line) == 0 {
			if restOnlyEOLs(source, next) {
				break
			}
			lineNo++
			return nil, &SyntaxError{Message: "empty line is a Content syntax error", Line: lineNo}
		}
		lineNo++
		p.lineNo = lineNo
		if lineNo == 1 {
			line = stripBOM(line)
			if len(line) == 0 {
				return nil, &SyntaxError{Message: "empty line is a Content syntax error", Line: lineNo}
			}
		}
		var err error
		if strict {
			err = p.handleLine(line)
		} else {
			err = p.handleLineCompat(line)
		}
		if err != nil {
			return nil, err
		}
		if next >= n {
			break
		}
		start = next
	}
	return p.result(), nil
}

func restOnlyEOLs(source string, from int) bool {
	for i := from; i < len(source); i++ {
		c := source[i]
		if c != '\n' && c != '\r' {
			return false
		}
	}
	return true
}

func (p *parser) syntax(msg string) *SyntaxError {
	return &SyntaxError{Message: msg, Line: p.lineNo}
}

func (p *parser) logicalName(wireName string) string {
	return DecodeWireLabel(wireName, p.symbolKeys)
}

func (p *parser) handleLine(line string) error {
	if len(line) == 0 {
		return p.syntax("Bare Label or unknown line form: " + repr(line))
	}

	// Content fast-path: typical nested Encode wires are mostly key:value lines.
	if !isOperatorHeadByte(line[0]) {
		return p.handleContentLine(line)
	}

	if line[0] == '#' {
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
		if p.broadcastStacks == nil {
			return p.popOnly()
		}
		return p.runOnCursors(p.popOnly)
	case line[0] == '<' && len(line) > 1:
		name := p.logicalName(line[1:])
		if err := assertName(name, p.lineNo, p.symbolKeys); err != nil {
			return err
		}
		if err := p.precheckBroadcastPop(); err != nil {
			return err
		}
		if p.broadcastStacks == nil {
			if err := p.popOnly(); err != nil {
				return err
			}
			return p.createEnterNamedObject(name)
		}
		return p.runOnCursors(func() error {
			if err := p.popOnly(); err != nil {
				return err
			}
			return p.createEnterNamedObject(name)
		})
	case line[0] == '=':
		if err := p.requireNotBroadcast("="); err != nil {
			return err
		}
		return p.locatePath(line[1:])
	case line[0] == '@':
		return p.exactEnter(line[1:])
	case line[0] == '!':
		if err := p.requireNotBroadcast("!"); err != nil {
			return err
		}
		return p.broadcastEnter(line[1:])
	case line[0] == '&':
		return p.deleteAtPath(line[1:])
	case line == ">":
		if p.broadcastStacks == nil {
			return p.createEnterAnonymousObject()
		}
		return p.runOnCursors(p.createEnterAnonymousObject)
	case line == "-":
		if p.broadcastStacks == nil {
			return p.createEnterAnonymousArray()
		}
		return p.runOnCursors(p.createEnterAnonymousArray)
	case line[0] == '>' && len(line) > 2 && line[len(line)-1] == '-':
		name := line[1 : len(line)-1]
		if p.symbolKeys {
			name = DecodeWireLabel(name, true)
		}
		if err := assertName(name, p.lineNo, p.symbolKeys); err != nil {
			return err
		}
		if p.broadcastStacks == nil {
			return p.createEnterNamedArray(name)
		}
		return p.runOnCursors(func() error { return p.createEnterNamedArray(name) })
	case line[0] == '>' && len(line) > 1:
		name := line[1:]
		if strings.IndexByte(name, '>') >= 0 {
			if strings.Contains(line, ">>") {
				return p.syntax("same-symbol stacking >> is forbidden")
			}
			parts := strings.Split(name, ">")
			logicalParts := make([]string, len(parts))
			for i, part := range parts {
				logicalParts[i] = p.logicalName(part)
				if err := assertName(logicalParts[i], p.lineNo, p.symbolKeys); err != nil {
					return err
				}
			}
			if p.broadcastStacks == nil {
				for _, part := range logicalParts {
					if err := p.createEnterNamedObject(part); err != nil {
						return err
					}
				}
				return nil
			}
			return p.runOnCursors(func() error {
				for _, part := range logicalParts {
					if err := p.createEnterNamedObject(part); err != nil {
						return err
					}
				}
				return nil
			})
		}
		if p.symbolKeys {
			name = DecodeWireLabel(name, true)
		}
		if err := assertName(name, p.lineNo, p.symbolKeys); err != nil {
			return err
		}
		if p.broadcastStacks == nil {
			return p.createEnterNamedObject(name)
		}
		return p.runOnCursors(func() error { return p.createEnterNamedObject(name) })
	}

	return p.handleContentLine(line)
}

func (p *parser) handleContentLine(line string) error {
	colon := strings.IndexByte(line, ':')
	if colon == -1 {
		return p.syntax("Bare Label or unknown line form: " + repr(line))
	}
	key := line[:colon]
	if p.symbolKeys {
		key = DecodeWireLabel(key, true)
	}
	value := parseValue(line[colon+1:])
	if p.broadcastStacks != nil {
		return p.runOnCursors(func() error { return p.writeContent(key, value) })
	}
	// Hot path: STRICT one-shot Encode wires never broadcast.
	if p.phase == phaseInit || p.docKind == docNone {
		p.ensureFragmentRoot()
	}
	if len(p.stack) == 0 {
		return p.syntax("Cursor is at Root with no container")
	}
	cur := &p.stack[len(p.stack)-1]
	if cur.kind == kindArray {
		arrPtr := cur.arr
		if arrPtr == nil {
			var ok bool
			arrPtr, ok = cur.value.(*[]any)
			if !ok {
				var err error
				arrPtr, err = p.arrayPtrForFrame(len(p.stack) - 1)
				if err != nil {
					return err
				}
				cur.arr = arrPtr
			}
		}
		if key == "" {
			*arrPtr = append(*arrPtr, value)
		} else {
			*arrPtr = append(*arrPtr, map[string]any{key: value})
		}
		return nil
	}
	if key == "" {
		return p.syntax(":value scalar Content is only valid at array level")
	}
	obj := cur.obj
	if obj == nil {
		obj = cur.value.(map[string]any)
		cur.obj = obj
	}
	obj[key] = value
	return nil
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
		root := make(map[string]any, 8)
		p.root = root
		p.docKind = docObject
		p.fragmentEntries = nil
		p.stack = []frame{objFrame(root, "")}
		p.phase = phaseActive
	}
}

func (p *parser) ensureFragmentRoot() {
	if p.docKind == docObject || p.docKind == docArray {
		return
	}
	if p.docKind != docFragment {
		p.docKind = docFragment
		p.fragmentEntries = make(map[string]any, 4)
		p.root = nil
		p.stack = []frame{fragFrame(p.fragmentEntries)}
		p.phase = phaseActive
	}
}

func (p *parser) resetToRoot() {
	p.syncOpenArrays()
	p.broadcastStacks = nil
	if p.docKind == docNone {
		p.stack = nil
		p.phase = phaseInit
		return
	}
	if p.docKind == docFragment {
		p.stack = []frame{fragFrame(p.fragmentEntries)}
		p.phase = phaseActive
		return
	}
	if ptr, ok := p.root.(*[]any); ok {
		p.stack = []frame{arrFrame(ptr, "")}
	} else if m, ok := p.root.(map[string]any); ok {
		p.stack = []frame{objFrame(m, "")}
	} else if arr, ok := p.root.([]any); ok {
		ptr := &arr
		p.root = ptr
		p.stack = []frame{arrFrame(ptr, "")}
	} else {
		p.stack = []frame{{kind: kindObject, value: p.root}}
	}
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
	leavingIdx := len(p.stack) - 1
	if p.stack[leavingIdx].kind == kindArray {
		p.syncArrayToParent(leavingIdx)
	}
	p.stack = p.stack[:leavingIdx]
	return nil
}

func (p *parser) createEnterAnonymousObject() error {
	if p.phase == phaseInit || p.docKind == docNone {
		root := make(map[string]any, 8)
		p.root = root
		p.docKind = docObject
		p.fragmentEntries = nil
		p.stack = []frame{objFrame(root, "")}
		p.phase = phaseActive
		return nil
	}
	if p.docKind == docFragment {
		return p.syntax(
			"bare > after fragment bindings: declare anonymous root first " +
				"with a leading >, or stay in fragment with >name",
		)
	}
	if len(p.stack) == 0 {
		return p.syntax("Cursor is at Root with no container")
	}
	cur := &p.stack[len(p.stack)-1]
	if cur.kind == kindArray {
		obj := make(map[string]any, 2)
		arrPtr := cur.arr
		if arrPtr == nil {
			var ok bool
			arrPtr, ok = cur.value.(*[]any)
			if !ok {
				var err error
				arrPtr, err = p.arrayPtrForFrame(len(p.stack) - 1)
				if err != nil {
					return err
				}
				cur.arr = arrPtr
			}
		}
		*arrPtr = append(*arrPtr, obj)
		p.stack = append(p.stack, objFrame(obj, ""))
		return nil
	}
	if cur.kind == kindObject {
		return nil
	}
	return p.syntax("bare > creates an array element or root object; unexpected Cursor kind")
}

func (p *parser) createEnterAnonymousArray() error {
	if p.phase == phaseInit || p.docKind == docNone {
		items := make([]any, 0, 8)
		arr := &items
		p.root = arr
		p.docKind = docArray
		p.fragmentEntries = nil
		p.stack = []frame{arrFrame(arr, "")}
		p.phase = phaseActive
		return nil
	}
	if p.docKind == docFragment {
		return p.syntax(
			"bare - cannot open root array after fragment mode began; start the Stream with -",
		)
	}
	if len(p.stack) == 0 {
		return p.syntax("Cursor is at Root with no container")
	}
	cur := &p.stack[len(p.stack)-1]
	if cur.kind != kindArray {
		return p.syntax(
			"bare - opens a nested array element or root array; for a named array use >name-",
		)
	}
	parentPtr := cur.arr
	if parentPtr == nil {
		var err error
		parentPtr, err = p.arrayPtrForFrame(len(p.stack) - 1)
		if err != nil {
			return err
		}
		cur.arr = parentPtr
	}
	items := make([]any, 0, 4)
	ptr := &items
	*parentPtr = append(*parentPtr, items)
	p.stack = append(p.stack, arrFrame(ptr, ""))
	return nil
}

func (p *parser) createEnterNamedObject(name string) error {
	if p.phase == phaseInit || p.docKind == docNone {
		p.ensureFragmentRoot()
	} else if p.docKind == docFragment && len(p.stack) == 0 {
		p.ensureFragmentRoot()
	}
	if len(p.stack) == 0 {
		return p.syntax("Cursor is at Root with no container")
	}
	cur := &p.stack[len(p.stack)-1]
	if cur.kind == kindArray {
		return p.syntax(
			">name while Cursor is inside an array (use < to leave array first): >" + name,
		)
	}
	obj := cur.obj
	if obj == nil {
		obj = cur.value.(map[string]any)
		cur.obj = obj
	}
	existing, ok := obj[name]
	if ok && existing != nil {
		if m, isMap := existing.(map[string]any); isMap {
			p.stack = append(p.stack, objFrame(m, name))
			return nil
		}
	}
	nxt := make(map[string]any, 8)
	obj[name] = nxt
	p.stack = append(p.stack, objFrame(nxt, name))
	return nil
}

func (p *parser) createEnterNamedArray(name string) error {
	if p.phase == phaseInit || p.docKind == docNone {
		p.ensureFragmentRoot()
	}
	if len(p.stack) == 0 {
		return p.syntax("Cursor is at Root with no container")
	}
	cur := &p.stack[len(p.stack)-1]
	if cur.kind == kindArray {
		return p.syntax(
			">name- while Cursor is inside an array (use < to leave first): >" + name + "-",
		)
	}
	obj := cur.obj
	if obj == nil {
		obj = cur.value.(map[string]any)
		cur.obj = obj
	}
	if existing, ok := obj[name]; ok {
		if ptr, isPtr := existing.(*[]any); isPtr {
			p.stack = append(p.stack, arrFrame(ptr, name))
			return nil
		}
		if arr, isArr := existing.([]any); isArr {
			ptr := &arr
			p.stack = append(p.stack, arrFrame(ptr, name))
			return nil
		}
	}
	items := make([]any, 0, 8)
	ptr := &items
	obj[name] = items
	p.stack = append(p.stack, arrFrame(ptr, name))
	return nil
}

func (p *parser) writeContent(key string, value any) error {
	if p.phase == phaseInit || p.docKind == docNone {
		p.ensureFragmentRoot()
	}
	if len(p.stack) == 0 {
		return p.syntax("Cursor is at Root with no container")
	}
	cur := &p.stack[len(p.stack)-1]
	if cur.kind == kindArray {
		arrPtr := cur.arr
		if arrPtr == nil {
			var ok bool
			arrPtr, ok = cur.value.(*[]any)
			if !ok {
				var err error
				arrPtr, err = p.arrayPtrForFrame(len(p.stack) - 1)
				if err != nil {
					return err
				}
				cur.arr = arrPtr
			}
		}
		if key == "" {
			*arrPtr = append(*arrPtr, value)
		} else {
			*arrPtr = append(*arrPtr, map[string]any{key: value})
		}
		return nil
	}
	if key == "" {
		return p.syntax(":value scalar Content is only valid at array level")
	}
	obj := cur.obj
	if obj == nil {
		obj = cur.value.(map[string]any)
		cur.obj = obj
	}
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
	segsOf := func(raw string) []string {
		return pathSegmentsOf(raw, p.symbolKeys)
	}
	found := fuzzyFind(tree, segsOf(path), nil, false)
	if found == nil && p.compat != nil {
		trimmed := strings.TrimSpace(path)
		cleared := stripAllSpace(path)

		if p.fixEnabled("locatePathTrim") && trimmed != "" && trimmed != path {
			found = fuzzyFind(tree, segsOf(trimmed), nil, false)
		}

		if found == nil &&
			p.fixEnabled("locatePathStripSpaces") &&
			cleared != "" &&
			cleared != path &&
			cleared != trimmed {
			found = fuzzyFind(tree, segsOf(cleared), nil, false)
		}

		if found == nil && p.fixEnabled("locatePathArraySuffix") {
			forSuffix := path
			if p.fixEnabled("locatePathStripSpaces") && cleared != "" {
				forSuffix = cleared
			} else if p.fixEnabled("locatePathTrim") && trimmed != "" {
				forSuffix = trimmed
			}
			hasSuffix := false
			for _, s := range strings.Split(forSuffix, ">") {
				if len(s) > 1 && strings.HasSuffix(s, "-") {
					hasSuffix = true
					break
				}
			}
			if hasSuffix {
				found = fuzzyFind(tree, segsOf(forSuffix), nil, true)
			}
		}
	}
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
	segments, err := splitPathSegments(path, p.lineNo, "@", p.symbolKeys)
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

		if ptr, isPtr := existing.(*[]any); isPtr {
			if !isLast {
				nxt := map[string]any{}
				obj[seg] = nxt
				p.stack = append(p.stack, frame{kind: kindObject, value: nxt, viaKey: seg})
			} else {
				p.stack = append(p.stack, frame{kind: kindArray, value: ptr, viaKey: seg})
			}
			continue
		}
		if arr, isArr := existing.([]any); isArr {
			if !isLast {
				nxt := make(map[string]any, 4)
				obj[seg] = nxt
				p.stack = append(p.stack, frame{kind: kindObject, value: nxt, viaKey: seg})
			} else {
				ptr := &arr
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
	segments, err := splitPathSegments(path, p.lineNo, "!", p.symbolKeys)
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
	segments, err := splitPathSegments(path, p.lineNo, "&", p.symbolKeys)
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
	_, isArr := asArrayNode(target)
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
	nLines := 1
	for i := 0; i < len(source); i++ {
		c := source[i]
		if c == '\n' {
			nLines++
		} else if c == '\r' {
			nLines++
			if i+1 < len(source) && source[i+1] == '\n' {
				i++
			}
		}
	}
	lines := make([]string, 0, nLines)
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

func assertName(name string, lineNo int, symbolKeys bool) error {
	if name == "" {
		return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
	}
	if symbolKeys {
		for _, c := range name {
			if unicode.IsSpace(c) && c != 0x1F {
				return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
			}
		}
		if strings.Contains(name, ":") {
			return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
		}
		return nil
	}
	// STRICT: single ASCII-oriented pass (Encode / normal wires).
	if isOperatorHeadByte(name[0]) {
		return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
	}
	for i := 0; i < len(name); i++ {
		c := name[i]
		if c >= 0x80 {
			for _, r := range name[i:] {
				if unicode.IsSpace(r) && r != 0x1F {
					return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
				}
			}
			break
		}
		switch c {
		case ' ', '\t', '\n', '\r', ':', '@', '&':
			return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
		}
	}
	if name[len(name)-1] == '-' {
		return &SyntaxError{Message: "invalid label name: " + repr(name), Line: lineNo}
	}
	return nil
}

func splitPathSegments(path string, lineNo int, op string, symbolKeys bool) ([]string, error) {
	if path == "" {
		return nil, &SyntaxError{Message: "empty " + op + " path", Line: lineNo}
	}
	if strings.Contains(path, ">>") || strings.HasPrefix(path, ">") || strings.HasSuffix(path, ">") {
		return nil, &SyntaxError{Message: "invalid " + op + " path: " + repr(path), Line: lineNo}
	}
	parts := strings.Split(path, ">")
	out := make([]string, 0, len(parts))
	for _, s := range parts {
		if s == "" {
			return nil, &SyntaxError{Message: "invalid " + op + " path: " + repr(path), Line: lineNo}
		}
		logical := DecodeWireLabel(s, symbolKeys)
		if err := assertName(logical, lineNo, symbolKeys); err != nil {
			return nil, err
		}
		out = append(out, logical)
	}
	return out, nil
}

func pathSegmentsOf(path string, symbolKeys bool) []string {
	parts := strings.Split(path, ">")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			out = append(out, DecodeWireLabel(p, symbolKeys))
		}
	}
	return out
}

func stripAllSpace(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return r
	}, s)
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
	if len(rawValue) == 0 {
		return rawValue
	}
	c := rawValue[0]
	// Fast reject: non-numeric strings skip int/float scanners.
	if c == '-' || c == '+' || c == '.' || (c >= '0' && c <= '9') {
		if n, ok := parseIntToken(rawValue); ok {
			return n
		}
		if isFloatToken(rawValue) {
			f, _ := strconv.ParseFloat(rawValue, 64)
			return f
		}
	}
	return rawValue
}

func parseIntToken(s string) (int64, bool) {
	if s == "" {
		return 0, false
	}
	i := 0
	neg := false
	if s[0] == '-' {
		neg = true
		i = 1
	} else if s[0] == '+' {
		i = 1
	}
	if i >= len(s) {
		return 0, false
	}
	var n int64
	for ; i < len(s); i++ {
		c := s[i]
		if c < '0' || c > '9' {
			return 0, false
		}
		n = n*10 + int64(c-'0')
	}
	if neg {
		n = -n
	}
	return n, true
}

func isIntToken(s string) bool {
	_, ok := parseIntToken(s)
	return ok
}

// isFloatToken mirrors the former floatTokenRE without regexp:
// ^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$ | ^[+-]?\d+[eE][+-]?\d+$
func isFloatToken(s string) bool {
	if s == "" {
		return false
	}
	i := 0
	if s[0] == '+' || s[0] == '-' {
		i = 1
		if i >= len(s) {
			return false
		}
	}
	sawDot := false
	sawDigit := false
	if s[i] == '.' {
		i++
		if i >= len(s) || s[i] < '0' || s[i] > '9' {
			return false
		}
		sawDot = true
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			i++
			sawDigit = true
		}
	} else {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			i++
			sawDigit = true
		}
		if i < len(s) && s[i] == '.' {
			sawDot = true
			i++
			for i < len(s) && s[i] >= '0' && s[i] <= '9' {
				i++
			}
		}
	}
	sawExp := false
	if i < len(s) && (s[i] == 'e' || s[i] == 'E') {
		sawExp = true
		i++
		if i < len(s) && (s[i] == '+' || s[i] == '-') {
			i++
		}
		if i >= len(s) || s[i] < '0' || s[i] > '9' {
			return false
		}
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			i++
		}
	}
	if i != len(s) || !sawDigit {
		return false
	}
	return sawDot || sawExp
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
		arr, isArr := asArrayNode(child)
		if !isMap && !isArr {
			return nil
		}
		kind := kindObject
		value := child
		if isArr {
			kind = kindArray
			if ptr, ok := child.(*[]any); ok {
				value = ptr
			} else {
				a := arr
				value = &a
			}
		}
		stack = append(stack, frame{kind: kind, value: value, viaKey: seg})
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
		var frVal any = arrayPtr(arr)
		if ptr, ok := node.(*[]any); ok {
			frVal = ptr
		}
		fr := frame{kind: kindArray, value: frVal}
		for _, el := range arr {
			if el == nil {
				continue
			}
			_, elMap := el.(map[string]any)
			_, elArr := asArrayNode(el)
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
			_, cArr := asArrayNode(child)
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
		_, cArr := asArrayNode(child)
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

func fuzzyFind(node any, segments []string, trail []frame, allowArrayCreateSuffix bool) []frame {
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
		arrPtr, _ := asArrayPtr(node)
		fr := frame{kind: kindArray, value: arrPtr}
		for _, el := range arr {
			hit := fuzzyFind(el, segments, append(trail, fr), allowArrayCreateSuffix)
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

	tryChild := func(key string, child any) []frame {
		base := append(trail, fr)
		if len(rest) == 0 {
			if child != nil {
				_, cMap := child.(map[string]any)
				arrPtr, cArr := asArrayPtr(child)
				if cMap || cArr {
					kind := kindObject
					value := child
					if cArr {
						kind = kindArray
						value = arrPtr
					}
					return append(base, frame{kind: kind, value: value, viaKey: key})
				}
			}
			return base
		}
		if child != nil {
			_, cMap := child.(map[string]any)
			_, cArr := asArrayNode(child)
			if cMap || cArr {
				return fuzzyFind(child, rest, base, allowArrayCreateSuffix)
			}
		}
		return nil
	}

	if child, ok := obj[head]; ok {
		if hit := tryChild(head, child); hit != nil {
			return hit
		}
	} else if allowArrayCreateSuffix && len(head) > 1 && strings.HasSuffix(head, "-") {
		base := head[:len(head)-1]
		if child, ok := obj[base]; ok {
			if _, isArr := asArrayNode(child); isArr {
				if hit := tryChild(base, child); hit != nil {
					return hit
				}
			}
		}
	}

	for _, child := range obj {
		if child == nil {
			continue
		}
		_, cMap := child.(map[string]any)
		_, cArr := asArrayNode(child)
		if !cMap && !cArr {
			continue
		}
		if hit := fuzzyFind(child, segments, append(trail, fr), allowArrayCreateSuffix); hit != nil {
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
		if parent.kind == kindObject || parent.kind == kindFragment {
			obj := asStringMap(parent.value)
			if fr.viaKey == "" {
				return nil, p.syntax("internal array frame missing viaKey under object parent")
			}
			obj[fr.viaKey] = ptr
			return ptr, nil
		}
		if parent.kind == kindArray {
			parentPtr, err := p.arrayPtrForFrame(frameIdx - 1)
			if err != nil {
				return nil, err
			}
			(*parentPtr)[len(*parentPtr)-1] = ptr
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
	return nil
}

func (p *parser) propagateArrayFromFrame(frameIdx int) error {
	// Arrays are stored as *[]any in the tree during parse; append mutates in place.
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

func asArrayPtr(node any) (*[]any, bool) {
	if ptr, ok := node.(*[]any); ok {
		return ptr, true
	}
	if arr, ok := node.([]any); ok {
		return &arr, true
	}
	return nil, false
}

func arrayPtr(arr []any) *[]any {
	return &arr
}
