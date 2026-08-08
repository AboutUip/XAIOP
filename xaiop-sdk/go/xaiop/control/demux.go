package control

import (
	"encoding/json"
	"strings"
)

// DemuxResult is the output of ControlDemux.Push / Flush.
type DemuxResult struct {
	WireText string
	Frames   []*Frame
	Errors   []*ControlError
}

// ControlDemux peels #! frames; remainder is document wire text.
type ControlDemux struct {
	carry                  string
	pendingHeader          *Frame
	skipBodyAfterBadHeader string
	skipNextEmptyWireLine  bool
}

// NewControlDemux creates an empty demuxer.
func NewControlDemux() *ControlDemux {
	return &ControlDemux{}
}

// Push ingests text and returns peeled wire + frames.
func (d *ControlDemux) Push(text string, finalizeBodies bool) DemuxResult {
	var frames []*Frame
	var errors []*ControlError
	var wireParts []string

	if text != "" {
		d.carry += text
	}

	start := 0
	for start < len(d.carry) {
		nl := strings.IndexByte(d.carry[start:], '\n')
		if nl < 0 {
			break
		}
		nl += start
		line := d.carry[start:nl]
		if strings.HasSuffix(line, "\r") {
			line = line[:len(line)-1]
		}
		rawLineWithNl := d.carry[start : nl+1]
		start = nl + 1
		d.handleCompleteLine(line, rawLineWithNl, &wireParts, &frames, &errors)
	}
	d.carry = d.carry[start:]

	if finalizeBodies {
		d.finalizePending(&wireParts, &frames, &errors)
	} else if d.pendingHeader != nil && d.carry != "" {
		if looksCompleteJSON(d.carry) {
			d.completeFrame(d.carry, &frames)
			d.pendingHeader = nil
			d.carry = ""
			d.skipNextEmptyWireLine = true
		}
	} else if d.skipBodyAfterBadHeader != "" && d.carry != "" {
		d.skipBodyAfterBadHeader = ""
		d.carry = ""
		d.skipNextEmptyWireLine = true
	}

	return DemuxResult{
		WireText: strings.Join(wireParts, ""),
		Frames:   frames,
		Errors:   errors,
	}
}

// Flush ends the stream and completes pending bodies.
func (d *ControlDemux) Flush() DemuxResult {
	return d.Push("", true)
}

// HasPending reports incomplete control state.
func (d *ControlDemux) HasPending() bool {
	return d.carry != "" || d.pendingHeader != nil || d.skipBodyAfterBadHeader != ""
}

func (d *ControlDemux) handleCompleteLine(
	line, rawLineWithNl string,
	wireParts *[]string,
	frames *[]*Frame,
	errors *[]*ControlError,
) {
	if d.skipBodyAfterBadHeader != "" {
		d.skipBodyAfterBadHeader = ""
		return
	}
	if d.pendingHeader != nil {
		d.completeFrame(line, frames)
		d.pendingHeader = nil
		return
	}
	if IsSDKControlLine(line) {
		header := ParseControlHeader(line)
		if header == nil {
			*errors = append(*errors, &ControlError{
				Message: "malformed control header: " + line,
				Code:    "CONTROL_HEADER_MALFORMED",
				Header:  line,
			})
			d.skipBodyAfterBadHeader = line
			return
		}
		d.pendingHeader = header
		return
	}
	if line == "" && d.skipNextEmptyWireLine {
		d.skipNextEmptyWireLine = false
		return
	}
	d.skipNextEmptyWireLine = false
	*wireParts = append(*wireParts, rawLineWithNl)
}

func (d *ControlDemux) finalizePending(wireParts *[]string, frames *[]*Frame, errors *[]*ControlError) {
	if d.carry != "" {
		rem := d.carry
		d.carry = ""
		if d.pendingHeader != nil {
			d.completeFrame(rem, frames)
			d.pendingHeader = nil
			return
		}
		if d.skipBodyAfterBadHeader != "" {
			d.skipBodyAfterBadHeader = ""
			return
		}
		if IsSDKControlLine(rem) {
			header := ParseControlHeader(rem)
			if header == nil {
				*errors = append(*errors, &ControlError{
					Message: "malformed control header: " + rem,
					Code:    "CONTROL_HEADER_MALFORMED",
					Header:  rem,
				})
			} else {
				d.pendingHeader = header
				d.completeFrame("", frames)
				d.pendingHeader = nil
			}
			return
		}
		*wireParts = append(*wireParts, rem)
		return
	}
	if d.skipBodyAfterBadHeader != "" {
		d.skipBodyAfterBadHeader = ""
		return
	}
	if d.pendingHeader != nil {
		d.completeFrame("", frames)
		d.pendingHeader = nil
	}
}

func (d *ControlDemux) completeFrame(body string, frames *[]*Frame) {
	h := d.pendingHeader
	if h == nil {
		return
	}
	*frames = append(*frames, &Frame{
		NS:      h.NS,
		Name:    h.Name,
		Version: h.Version,
		ID:      h.ID,
		Header:  h.Header,
		Body:    body,
		Raw:     h.Header + "\n" + body,
	})
}

func looksCompleteJSON(text string) bool {
	t := strings.TrimSpace(text)
	if t == "" {
		return true
	}
	var v any
	return json.Unmarshal([]byte(t), &v) == nil
}
