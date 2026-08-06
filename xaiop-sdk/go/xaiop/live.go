package xaiop

// LiveParser is an incremental parser that keeps one live tree.
type LiveParser struct {
	p   *parser
	err error
}

// NewLiveParser creates a new live parser.
func NewLiveParser() *LiveParser {
	return &LiveParser{p: newLiveParser()}
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

// CursorRestoreLines returns wire lines to restore the cursor stack.
func (lp *LiveParser) CursorRestoreLines() ([]string, error) {
	return lp.p.cursorRestoreLines()
}
