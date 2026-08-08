package xaiop

// LiveParser is an incremental parser that keeps one live tree.
type LiveParser struct {
	p   *parser
	err error
}

// NewLiveParser creates a new live parser (STRICT).
func NewLiveParser() *LiveParser {
	return &LiveParser{p: newLiveParser()}
}

// NewLiveParserWithOptions creates a live parser with compat / symbolKeys options.
func NewLiveParserWithOptions(opts ParseOptions) *LiveParser {
	return &LiveParser{p: newLiveParserWithOptions(opts)}
}

// FeedLine feeds one complete line into the parser.
func (lp *LiveParser) FeedLine(line string) *LiveParser {
	if lp.err != nil {
		return lp
	}
	if err := lp.p.feedLineFast(line); err != nil {
		lp.err = err
	}
	return lp
}

// FeedLines feeds multiple complete lines into the parser.
func (lp *LiveParser) FeedLines(lines []string) *LiveParser {
	for _, line := range lines {
		lp.FeedLine(line)
		if lp.err != nil {
			return lp
		}
	}
	return lp
}

// FeedText feeds complete lines from text into the parser.
func (lp *LiveParser) FeedText(text string) *LiveParser {
	if lp.err != nil || text == "" {
		return lp
	}
	for _, line := range splitLines(text) {
		if err := lp.p.feedLineFast(line); err != nil {
			lp.err = err
			return lp
		}
	}
	return lp
}

// Value returns the current tree (Fragment or root document).
func (lp *LiveParser) Value() (any, error) {
	if lp.err != nil {
		return nil, lp.err
	}
	return lp.p.result(), nil
}

// DocKind returns the live document kind: "none", "object", "array", or "fragment".
func (lp *LiveParser) DocKind() string {
	if lp == nil || lp.p == nil {
		return string(docNone)
	}
	return string(lp.p.docKind)
}

// CursorRestoreLines returns wire lines to restore the cursor stack.
func (lp *LiveParser) CursorRestoreLines() ([]string, error) {
	return lp.p.cursorRestoreLines()
}
