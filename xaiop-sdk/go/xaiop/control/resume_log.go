package control

import "fmt"

// ResumeLogError is a ResumeWireLog sequencing failure.
type ResumeLogError struct {
	Message string
	Code    string
	Seq     int
}

func (e *ResumeLogError) Error() string {
	if e == nil {
		return "resume log error"
	}
	return e.Message
}

// ResumeEntry is one outbound phase record.
type ResumeEntry struct {
	Seq       int
	Wire      string
	Committed any
}

// ResumeWireLog stores producer-side phase wire for resume.
type ResumeWireLog struct {
	entries []ResumeEntry
}

// NewResumeWireLog creates an empty log.
func NewResumeWireLog() *ResumeWireLog {
	return &ResumeWireLog{}
}

// Size returns entry count.
func (l *ResumeWireLog) Size() int { return len(l.entries) }

// HighestSeq returns the last recorded seq (0 if empty).
func (l *ResumeWireLog) HighestSeq() int {
	if len(l.entries) == 0 {
		return 0
	}
	return l.entries[len(l.entries)-1].Seq
}

// Record appends a strictly-increasing seq entry.
func (l *ResumeWireLog) Record(entry ResumeEntry) error {
	if entry.Seq < 1 {
		return fmt.Errorf("ResumeWireLog.record requires seq >= 1")
	}
	if entry.Wire == "" && entry.Seq > 0 {
		// wire may be empty string legitimately; only reject non-string via type — Go is typed
	}
	last := l.HighestSeq()
	if entry.Seq <= last {
		return &ResumeLogError{
			Message: fmt.Sprintf("ResumeWireLog seq must be strictly increasing (got %d, last %d)", entry.Seq, last),
			Code:    "RESUME_LOG_SEQ",
			Seq:     entry.Seq,
		}
	}
	l.entries = append(l.entries, entry)
	return nil
}

// WiresAfter returns stamped wires with seq > fromSeq.
func (l *ResumeWireLog) WiresAfter(fromSeq int) (string, error) {
	return l.joinAfter(fromSeq, true)
}

// WiresAfterRaw returns raw wires with seq > fromSeq (no stamp).
func (l *ResumeWireLog) WiresAfterRaw(fromSeq int) (string, error) {
	return l.joinAfter(fromSeq, false)
}

func (l *ResumeWireLog) joinAfter(fromSeq int, stamp bool) (string, error) {
	if fromSeq < 0 {
		return "", fmt.Errorf("wires_after requires non-negative integer fromSeq")
	}
	out := ""
	for _, e := range l.entries {
		if e.Seq <= fromSeq {
			continue
		}
		if stamp {
			s, err := StampWireWithLogSeq(e.Seq, e.Wire)
			if err != nil {
				return "", err
			}
			out += s
		} else {
			out += e.Wire
		}
	}
	return out, nil
}

// Clear empties the log.
func (l *ResumeWireLog) Clear() *ResumeWireLog {
	l.entries = nil
	return l
}
