package xaiop

import "fmt"

// SyntaxError is a syntax error while parsing XAIOP wire text.
type SyntaxError struct {
	Message string
	Line    int // 0 means unset
}

func (e *SyntaxError) Error() string {
	if e.Line > 0 {
		return fmt.Sprintf("line %d: %s", e.Line, e.Message)
	}
	return e.Message
}

// EncodeError is an error while encoding a value to XAIOP wire.
type EncodeError struct {
	Message string
	Path    string
}

func (e *EncodeError) Error() string {
	return e.Message
}
