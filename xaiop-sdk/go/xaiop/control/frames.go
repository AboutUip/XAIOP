// Package control implements Control Root (#!) session / ack / resume / snapshot / seq
// aligned with the Node.js xaiop 0.16.0 reference.
package control

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Control namespace and capability names.
const (
	ControlNS = "xaiop"

	NameTypes    = "types"
	NameSession  = "session"
	NameResume   = "resume"
	NameAck      = "ack"
	NameSnapshot = "snapshot"
	NameSeq      = "seq"

	CapTypesV1    = "xaiop/types/v1"
	CapSessionV1  = "xaiop/session/v1"
	CapResumeV1   = "xaiop/resume/v1"
	CapAckV1      = "xaiop/ack/v1"
	CapSnapshotV1 = "xaiop/snapshot/v1"
	CapSeqV1      = "xaiop/seq/v1"
)

var headerRE = regexp.MustCompile(`^#!([A-Za-z][A-Za-z0-9_-]*)/([A-Za-z][A-Za-z0-9_-]*)/v(\d+)$`)

// ControlError is a control-plane failure.
type ControlError struct {
	Message string
	Code    string
	Header  string
	Frame   *Frame
	Cause   error
}

func (e *ControlError) Error() string {
	if e == nil {
		return "control error"
	}
	return e.Message
}

func (e *ControlError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

// Frame is one demuxed control frame.
type Frame struct {
	NS      string
	Name    string
	Version int
	ID      string
	Header  string
	Body    string
	Raw     string
}

// IsSDKControlLine reports whether line starts with #!.
func IsSDKControlLine(line string) bool {
	return len(line) >= 2 && line[0] == '#' && line[1] == '!'
}

// ParseControlHeader parses a #!ns/name/vN header line.
func ParseControlHeader(line string) *Frame {
	if !IsSDKControlLine(line) {
		return nil
	}
	m := headerRE.FindStringSubmatch(line)
	if m == nil {
		return nil
	}
	ver, _ := strconv.Atoi(m[3])
	id := m[1] + "/" + m[2] + "/v" + m[3]
	return &Frame{
		NS:      m[1],
		Name:    m[2],
		Version: ver,
		ID:      id,
		Header:  line,
	}
}

// EncodeControlFrame encodes a header + single-line body.
func EncodeControlFrame(ns, name string, version int, body any) (string, error) {
	if ns == "" || name == "" {
		return "", fmt.Errorf("encode_control_frame requires ns and name")
	}
	if version < 1 {
		return "", fmt.Errorf("encode_control_frame version must be a positive integer")
	}
	header := fmt.Sprintf("#!%s/%s/v%d", ns, name, version)
	var bodyText string
	switch b := body.(type) {
	case nil:
		bodyText = ""
	case string:
		bodyText = b
	default:
		raw, err := json.Marshal(b)
		if err != nil {
			return "", err
		}
		bodyText = string(raw)
	}
	if strings.ContainsAny(bodyText, "\n\r") {
		return "", &ControlError{
			Message: "control frame body must be a single logical line (no CR/LF)",
			Code:    "CONTROL_BODY_MULTILINE",
			Header:  header,
		}
	}
	return header + "\n" + bodyText + "\n", nil
}

// EncodeSessionFrame encodes #!xaiop/session/v1.
func EncodeSessionFrame(body any) (string, error) {
	return EncodeControlFrame(ControlNS, NameSession, 1, body)
}

// EncodeResumeFrame encodes #!xaiop/resume/v1.
func EncodeResumeFrame(body any) (string, error) {
	return EncodeControlFrame(ControlNS, NameResume, 1, body)
}

// EncodeAckFrame encodes #!xaiop/ack/v1.
func EncodeAckFrame(body any) (string, error) {
	return EncodeControlFrame(ControlNS, NameAck, 1, body)
}

// EncodeSnapshotFrame encodes #!xaiop/snapshot/v1.
func EncodeSnapshotFrame(body any) (string, error) {
	return EncodeControlFrame(ControlNS, NameSnapshot, 1, body)
}

// EncodeSeqFrame encodes #!xaiop/seq/v1 with {"seq":n}.
func EncodeSeqFrame(seq int) (string, error) {
	if seq < 1 {
		return "", fmt.Errorf("encode_seq_frame requires seq >= 1")
	}
	return EncodeControlFrame(ControlNS, NameSeq, 1, map[string]any{"seq": seq})
}

// StampWireWithLogSeq prefixes wire with a seq frame.
func StampWireWithLogSeq(seq int, wire string) (string, error) {
	frame, err := EncodeSeqFrame(seq)
	if err != nil {
		return "", err
	}
	return frame + wire, nil
}

// ParseControlBodyJSON parses frame body JSON (empty → nil).
func ParseControlBodyJSON(frame *Frame) (any, error) {
	t := strings.TrimSpace(frame.Body)
	if t == "" {
		return nil, nil
	}
	var v any
	if err := json.Unmarshal([]byte(t), &v); err != nil {
		return nil, &ControlError{
			Message: "invalid control JSON for " + frame.ID,
			Code:    "CONTROL_BODY_JSON",
			Header:  frame.Header,
			Frame:   frame,
			Cause:   err,
		}
	}
	return v, nil
}
