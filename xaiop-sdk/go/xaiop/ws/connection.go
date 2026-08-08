package ws

import (
	"fmt"
	"sync"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/compat"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/control"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/stream"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/types"
)

// ConnectionOptions configures a Connection.
type ConnectionOptions struct {
	StreamProcessing  *bool
	CompatibilityMode bool
	MergeChunkWindow  *bool
	Cover             bool
	SymbolKeys        bool
	TypeCheck         bool
	TypeSchema        any
	Session           any
	AutoAck           bool
	RetainOutbound    bool

	LineIntercept  []xaiop.LineInterceptor
	AnnotationSpan []xaiop.AnnotationSpanHandler

	OnPhase        func(diff any, meta map[string]any)
	OnDone         func(snapshot any)
	OnError        func(err error)
	OnControlError func(err *control.ControlError)
	OnSession      func(body any, frame *control.Frame)
	OnResume       func(body any, frame *control.Frame)
	OnAck          func(body any, frame *control.Frame)
	OnSnapshot     func(body any, frame *control.Frame)
}

// Connection is one WebSocket carrying XAIOP phases (push and/or consume).
type Connection struct {
	ws                Socket
	streamProcessing  bool
	compatibilityMode bool
	mergeChunkWindow  bool
	cover             bool
	symbolKeys        bool
	typeCheck         bool

	mu                 sync.Mutex
	buffer             string
	snapshot           any
	committedSnapshot  any
	committedAvailable bool
	lastError          error
	closed             bool
	finished           bool
	handlersLocked     bool

	onPhase func(diff any, meta map[string]any)
	onDone  func(snapshot any)
	onError func(err error)

	typeSession *types.TypeFreezeSession
	control     *control.ControlIngest
	outboundSeq int
	outboundLog *control.ResumeWireLog

	engine *stream.DotCheckpointEngine

	doneCh   chan struct{}
	doneOnce sync.Once
	closedCh chan struct{}
	closeOnce sync.Once
}

// NewConnection wraps a Socket.
func NewConnection(sock Socket, opts *ConnectionOptions) (*Connection, error) {
	if sock == nil {
		return nil, fmt.Errorf("XaiopWsConnection requires a WebSocket-like socket")
	}
	if opts == nil {
		opts = &ConnectionOptions{}
	}
	c := &Connection{
		ws:                sock,
		streamProcessing:  boolOr(opts.StreamProcessing, true),
		compatibilityMode: opts.CompatibilityMode,
		mergeChunkWindow:  boolOr(opts.MergeChunkWindow, true),
		cover:             opts.Cover,
		symbolKeys:        opts.SymbolKeys,
		typeCheck:         opts.TypeCheck && !opts.CompatibilityMode,
		onPhase:           opts.OnPhase,
		onDone:            opts.OnDone,
		onError:           opts.OnError,
		doneCh:            make(chan struct{}),
		closedCh:          make(chan struct{}),
	}
	if opts.RetainOutbound || opts.Session != nil {
		c.outboundLog = control.NewResumeWireLog()
	}
	if c.typeCheck {
		ts, err := types.NewTypeFreezeSession(opts.TypeSchema, nil)
		if err != nil {
			return nil, err
		}
		c.typeSession = ts
	}
	c.control = control.NewControlIngest(&control.Handlers{
		OnControlError: opts.OnControlError,
		OnSession:      opts.OnSession,
		OnResume:       opts.OnResume,
		OnAck:          opts.OnAck,
		OnSnapshot:     opts.OnSnapshot,
		OnTypes: func(body any, _ *control.Frame) {
			if c.typeSession != nil {
				_ = c.typeSession.ApplySchema(body)
			}
		},
		OnSeq: func(body any, _ *control.Frame) {
			m, _ := body.(map[string]any)
			n := 0
			switch v := m["seq"].(type) {
			case float64:
				n = int(v)
			case int:
				n = v
			}
			if c.engine != nil && n >= 1 {
				_ = c.engine.NoteLogSeq(n)
			}
		},
	})

	var compatArg any
	if c.compatibilityMode {
		compatArg = compat.NewPolicy(nil).Snapshot()
	}
	c.engine = stream.NewDotCheckpointEngine(stream.Hooks{
		StreamProcessing: boolPtr(c.streamProcessing),
		MergeChunkWindow: boolPtr(c.mergeChunkWindow),
		Cover:            c.cover,
		SymbolKeys:       c.symbolKeys,
		Compat:           compatArg,
		LineIntercept:    opts.LineIntercept,
		AnnotationSpan:   opts.AnnotationSpan,
		OnChunk:          c.onEngineChunk,
		OnError: func(err error) {
			c.emitError(err)
		},
	})

	sock.OnMessage(c.onSocketMessage)
	sock.OnClose(c.onSocketClose)
	sock.OnError(func(err error) { c.emitError(err) })
	return c, nil
}

func (c *Connection) onEngineChunk(diff any, meta map[string]any) {
	if c.onPhase != nil {
		c.onPhase(diff, meta)
	}
}

func (c *Connection) onSocketMessage(text string) {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	wire := text
	if c.control != nil {
		wire = c.control.Push(text)
	}
	c.buffer += wire
	eng := c.engine
	c.mu.Unlock()
	if wire != "" && eng != nil {
		_ = eng.Push(wire)
	}
}

func (c *Connection) onSocketClose() {
	c.mu.Lock()
	if c.finished {
		c.mu.Unlock()
		c.signalClosed()
		return
	}
	c.finished = true
	if c.control != nil {
		tail := c.control.Flush()
		if tail != "" && c.engine != nil {
			_ = c.engine.Push(tail)
			c.buffer += tail
		}
	}
	eng := c.engine
	c.mu.Unlock()
	if eng != nil {
		eng.Finish()
		snap := eng.Snapshot()
		c.mu.Lock()
		c.snapshot = snap
		c.committedAvailable = true
		c.committedSnapshot = eng.CommittedSnapshot()
		c.mu.Unlock()
		if c.onDone != nil {
			c.onDone(xaiop.CloneJSON(snap))
		}
	}
	c.signalDone()
	c.signalClosed()
}

// LockHandlers freezes handler mutation (after connect/accept).
func (c *Connection) LockHandlers() { c.handlersLocked = true }

// SendWire sends raw wire text (alias of PushWire).
func (c *Connection) SendWire(wire string) error { return c.PushWire(wire) }

// PushPhase encodes {key:value} as a phase and sends it (alias of PushJSON).
func (c *Connection) PushPhase(key string, value any, final bool) error {
	return c.PushJSON(key, value, final)
}

// PushWire sends raw wire text.
func (c *Connection) PushWire(wire string) error {
	if c.ws.ReadyState() != Open {
		return errSocketClosed
	}
	if c.outboundLog != nil {
		c.outboundSeq++
		_ = c.outboundLog.Record(control.ResumeEntry{Seq: c.outboundSeq, Wire: wire})
		stamped, err := control.StampWireWithLogSeq(c.outboundSeq, wire)
		if err != nil {
			return err
		}
		wire = stamped
	}
	return c.ws.Send(wire)
}

// PushJSON encodes {key:value} as a phase and sends it.
func (c *Connection) PushJSON(key string, value any, final bool) error {
	wire, err := xaiop.PhaseEncodeKeyValue(key, value, xaiop.PhaseEncodeOptions{Final: final})
	if err != nil {
		return err
	}
	return c.PushWire(wire)
}

// PushObject encodes an object as a phase and sends it.
func (c *Connection) PushObject(obj map[string]any, final bool) error {
	wire, err := xaiop.PhaseEncodeObjectPhase(obj, xaiop.PhaseEncodeOptions{Final: final})
	if err != nil {
		return err
	}
	return c.PushWire(wire)
}

// End closes the socket (triggers Finish on peer ingest).
func (c *Connection) End() error {
	return c.ws.Close(1000, "end")
}

// Close closes the connection.
func (c *Connection) Close() error {
	c.mu.Lock()
	c.closed = true
	c.mu.Unlock()
	return c.ws.Close(1000, "close")
}

// Snapshot returns the final snapshot.
func (c *Connection) Snapshot() any {
	c.mu.Lock()
	defer c.mu.Unlock()
	return xaiop.CloneJSON(c.snapshot)
}

// CommittedSnapshot returns committed snapshot.
func (c *Connection) CommittedSnapshot() any {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.committedSnapshot == nil && c.committedAvailable && c.engine != nil {
		c.committedSnapshot = c.engine.CommittedSnapshot()
	}
	return xaiop.CloneJSON(c.committedSnapshot)
}

// Buffer returns ingested buffer.
func (c *Connection) Buffer() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.buffer
}

// LastError returns last error.
func (c *Connection) LastError() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lastError
}

// OutboundLog returns the resume wire log (may be nil).
func (c *Connection) OutboundLog() *control.ResumeWireLog { return c.outboundLog }

// Done waits until ingest finishes (peer close / End).
func (c *Connection) Done() <-chan struct{} { return c.doneCh }

// Closed waits until the socket is closed.
func (c *Connection) Closed() <-chan struct{} { return c.closedCh }

// Engine returns the underlying checkpoint engine.
func (c *Connection) Engine() *stream.DotCheckpointEngine { return c.engine }

func (c *Connection) emitError(err error) {
	c.mu.Lock()
	c.lastError = err
	c.mu.Unlock()
	if c.onError != nil {
		c.onError(err)
	}
}

func (c *Connection) signalDone() {
	c.doneOnce.Do(func() { close(c.doneCh) })
}

func (c *Connection) signalClosed() {
	c.closeOnce.Do(func() { close(c.closedCh) })
}

func boolOr(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

func boolPtr(v bool) *bool { return &v }
