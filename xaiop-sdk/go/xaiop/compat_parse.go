package xaiop

import (
	"errors"
	"strings"
)

func (p *parser) fixEnabled(id string) bool {
	return p.compat != nil && p.compat[id]
}

func (p *parser) ensureCompatRootOpener() {
	if len(p.lines) == 0 {
		return
	}
	first := p.rewriteCompatLine(stripBOM(p.lines[0]))
	if first == ">" || first == "-" {
		return
	}
	root := map[string]any{}
	p.root = root
	p.docKind = docObject
	p.fragmentEntries = nil
	p.stack = []frame{objFrame(root, "")}
	p.phase = phaseActive
}

func (p *parser) ensureCompatRootOpenerFrom(source string) {
	first := firstWireLine(source)
	if first == "" {
		return
	}
	first = p.rewriteCompatLine(stripBOM(first))
	if first == ">" || first == "-" {
		return
	}
	root := map[string]any{}
	p.root = root
	p.docKind = docObject
	p.fragmentEntries = nil
	p.stack = []frame{objFrame(root, "")}
	p.phase = phaseActive
}

func firstWireLine(source string) string {
	for i := 0; i < len(source); i++ {
		if source[i] == '\n' || source[i] == '\r' {
			return source[:i]
		}
	}
	return source
}

func (p *parser) injectCompatRootIfNeeded(firstLine string) {
	first := p.rewriteCompatLine(firstLine)
	if first == ">" || first == "-" {
		return
	}
	p.root = map[string]any{}
	p.docKind = docObject
	p.fragmentEntries = nil
	root := p.root.(map[string]any)
	p.stack = []frame{objFrame(root, "")}
	p.phase = phaseActive
}

func (p *parser) rewriteCompatLine(line string) string {
	bareArray := p.fixEnabled("rewriteBareNameArray")
	enterLine := p.fixEnabled("rewriteEnterLine")
	if !bareArray && !enterLine {
		return line
	}

	s := line
	if enterLine {
		s = strings.TrimRight(line, " \t\r\n")
	}
	if s == "" {
		return line
	}

	if bareArray && bareNameArrayRE.MatchString(s) {
		return ">" + s
	}

	if enterLine && strings.HasPrefix(s, ">") && len(s) > 1 {
		rest := s[1:]
		trimmedRest := strings.TrimSpace(rest)
		if trimmedRest == "" {
			return ">"
		}
		if bareNameArrayRE.MatchString(trimmedRest) {
			return ">" + trimmedRest
		}
		if strings.Contains(trimmedRest, ":") {
			return trimmedRest
		}
		if trimmedRest != rest {
			return ">" + trimmedRest
		}
	}

	return s
}

func (p *parser) handleLineCompat(line string) error {
	if p.compat == nil {
		return p.handleLine(line)
	}

	effective := p.rewriteCompatLine(line)
	if effective == "" {
		return &SyntaxError{Message: "empty line is a Content syntax error", Line: p.lineNo}
	}

	if p.fixEnabled("ignoreBareLeaveAtRoot") && effective == "<" && p.isAtDocumentRoot() {
		return nil
	}

	err := p.handleLine(effective)
	if err == nil {
		return nil
	}
	var se *SyntaxError
	if !errors.As(err, &se) {
		return err
	}
	if !p.fixEnabled("popAndRetry") {
		return err
	}
	return p.recoverByPopping(effective, se)
}

func (p *parser) isAtDocumentRoot() bool {
	return len(p.stack) <= 1
}

func (p *parser) recoverByPopping(line string, originalErr *SyntaxError) error {
	originalKey := originalErr.Message
	for len(p.stack) > 1 {
		if err := p.popOnly(); err != nil {
			return originalErr
		}
		err2 := p.handleLine(line)
		if err2 == nil {
			return nil
		}
		var se2 *SyntaxError
		if !errors.As(err2, &se2) {
			return err2
		}
		if se2.Message != originalKey {
			return se2
		}
	}
	return originalErr
}
