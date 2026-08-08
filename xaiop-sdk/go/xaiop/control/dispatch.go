package control

// Handlers for ControlIngest / DispatchControlFrame.
type Handlers struct {
	OnControlError func(err *ControlError)
	OnTypes        func(body any, frame *Frame)
	OnSession      func(body any, frame *Frame)
	OnResume       func(body any, frame *Frame)
	OnAck          func(body any, frame *Frame)
	OnSnapshot     func(body any, frame *Frame)
	OnSeq          func(body any, frame *Frame)
}

func (h *Handlers) report(err *ControlError) {
	if h != nil && h.OnControlError != nil {
		h.OnControlError(err)
	}
}

// DispatchControlFrame routes one frame to handlers.
func DispatchControlFrame(frame *Frame, h *Handlers) {
	if h == nil {
		h = &Handlers{}
	}
	if frame.NS != ControlNS {
		h.report(&ControlError{
			Message: "unknown control namespace: " + frame.NS,
			Code:    "CONTROL_UNKNOWN_NS",
			Header:  frame.Header,
			Frame:   frame,
		})
		return
	}
	switch frame.Name {
	case NameTypes:
		if frame.Version != 1 {
			h.report(unknownCap(frame))
			return
		}
		body, err := ParseControlBodyJSON(frame)
		if err != nil {
			if ce, ok := err.(*ControlError); ok {
				h.report(ce)
			} else {
				h.report(&ControlError{Message: err.Error(), Code: "CONTROL_DISPATCH", Header: frame.Header, Frame: frame, Cause: err})
			}
			return
		}
		m, _ := body.(map[string]any)
		entries, _ := m["entries"].([]any)
		verOK := false
		if m != nil {
			switch v := m["version"].(type) {
			case float64:
				verOK = int(v) == 1
			case int:
				verOK = v == 1
			}
		}
		if !verOK || entries == nil {
			h.report(&ControlError{
				Message: "invalid type schema frame payload",
				Code:    "CONTROL_TYPES_PAYLOAD",
				Header:  frame.Header,
				Frame:   frame,
			})
			return
		}
		if h.OnTypes != nil {
			h.OnTypes(body, frame)
		}
	case NameSession:
		if frame.Version != 1 {
			h.report(unknownCap(frame))
			return
		}
		body, err := ParseControlBodyJSON(frame)
		if err != nil {
			h.report(asControlErr(err, frame))
			return
		}
		if body == nil {
			body = map[string]any{}
		}
		if h.OnSession != nil {
			h.OnSession(body, frame)
		}
	case NameResume:
		if frame.Version != 1 {
			h.report(unknownCap(frame))
			return
		}
		body, err := ParseControlBodyJSON(frame)
		if err != nil {
			h.report(asControlErr(err, frame))
			return
		}
		if body == nil {
			body = map[string]any{}
		}
		if h.OnResume != nil {
			h.OnResume(body, frame)
		}
	case NameAck:
		if frame.Version != 1 {
			h.report(unknownCap(frame))
			return
		}
		body, err := ParseControlBodyJSON(frame)
		if err != nil {
			h.report(asControlErr(err, frame))
			return
		}
		if body == nil {
			body = map[string]any{}
		}
		if h.OnAck != nil {
			h.OnAck(body, frame)
		}
	case NameSnapshot:
		if frame.Version != 1 {
			h.report(unknownCap(frame))
			return
		}
		body, err := ParseControlBodyJSON(frame)
		if err != nil {
			h.report(asControlErr(err, frame))
			return
		}
		if h.OnSnapshot != nil {
			h.OnSnapshot(body, frame)
		}
	case NameSeq:
		if frame.Version != 1 {
			h.report(unknownCap(frame))
			return
		}
		body, err := ParseControlBodyJSON(frame)
		if err != nil {
			h.report(asControlErr(err, frame))
			return
		}
		m, _ := body.(map[string]any)
		if m == nil {
			m = map[string]any{}
		}
		n := 0
		switch v := m["seq"].(type) {
		case float64:
			n = int(v)
		case int:
			n = v
		}
		if n < 1 {
			h.report(&ControlError{
				Message: "invalid seq frame payload (need seq >= 1)",
				Code:    "CONTROL_SEQ_PAYLOAD",
				Header:  frame.Header,
				Frame:   frame,
			})
			return
		}
		if h.OnSeq != nil {
			h.OnSeq(m, frame)
		}
	default:
		h.report(unknownCap(frame))
	}
}

func unknownCap(frame *Frame) *ControlError {
	return &ControlError{
		Message: "unknown control capability: " + frame.ID,
		Code:    "CONTROL_UNKNOWN_CAPABILITY",
		Header:  frame.Header,
		Frame:   frame,
	}
}

func asControlErr(err error, frame *Frame) *ControlError {
	if ce, ok := err.(*ControlError); ok {
		return ce
	}
	return &ControlError{Message: err.Error(), Code: "CONTROL_DISPATCH", Header: frame.Header, Frame: frame, Cause: err}
}

// ControlIngest demuxes and dispatches control frames, returning document wire.
type ControlIngest struct {
	demux    *ControlDemux
	handlers *Handlers
}

// NewControlIngest creates an ingest demuxer.
func NewControlIngest(h *Handlers) *ControlIngest {
	return &ControlIngest{demux: NewControlDemux(), handlers: h}
}

// SetHandlers replaces dispatch handlers.
func (c *ControlIngest) SetHandlers(h *Handlers) { c.handlers = h }

// Push peels control frames and returns remaining wire text.
func (c *ControlIngest) Push(text string) string {
	res := c.demux.Push(text, false)
	c.emit(res)
	return res.WireText
}

// Flush completes pending control bodies and returns remaining wire.
func (c *ControlIngest) Flush() string {
	res := c.demux.Flush()
	c.emit(res)
	return res.WireText
}

func (c *ControlIngest) emit(res DemuxResult) {
	h := c.handlers
	if h == nil {
		h = &Handlers{}
	}
	for _, err := range res.Errors {
		h.report(err)
	}
	for _, frame := range res.Frames {
		DispatchControlFrame(frame, h)
	}
}
