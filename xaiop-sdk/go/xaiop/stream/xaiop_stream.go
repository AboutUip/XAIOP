package stream

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/control"
)

// Stream status values (Node STREAM_STATUS).
const (
	StatusIdle       = "idle"
	StatusConnecting = "connecting"
	StatusStreaming  = "streaming"
	StatusCompleting = "completing"
	StatusCompleted  = "completed"
	StatusError      = "error"
	StatusAborted    = "aborted"
)

// Options configures XaiopStream (Python/Java parity).
type Options struct {
	OnChunk  func(diff any, meta map[string]any)
	OnDone   func(snapshot any)
	OnError  func(err error)

	Cover             bool
	HistorySnapshot   bool
	HistoryRealtime   bool
	MergeChunkWindow  *bool // default true
	StreamProcessing  *bool // default true
	RetainWireHistory *bool // default true
	SymbolKeys        bool
	Compat            any

	LineIntercept  []xaiop.LineInterceptor
	AnnotationSpan []xaiop.AnnotationSpanHandler

	Modes []string // callback / promise / asyncIterator / events

	// Transport defaults for Start (HTTP/SSE). Empty → http.
	Transport TransportKind
	Method    string
	Headers   map[string]string
	Body      string
}

// XaiopStream is the streaming XAIOP consumer over HTTP / SSE / RAW.
type XaiopStream struct {
	url  string
	opts Options

	mu     sync.Mutex
	status string

	streamProcessing bool
	mergeChunkWindow bool
	modes            map[string]struct{}

	engine  *DotCheckpointEngine
	control *control.ControlIngest

	snapshot           any
	committedSnapshot  any
	committedAvailable bool
	buffer             string
	lastError          error

	onChunk func(diff any, meta map[string]any)
	onDone  func(snapshot any)
	onError func(err error)

	chunkCh     chan any
	chunkClosed bool
	aborted     atomic.Bool
	transport   *TransportHandle
	rawActive   bool
}

// NewXaiopStream creates a stream bound to url (may be a RAW placeholder like "raw://").
func NewXaiopStream(url string, opts Options) (*XaiopStream, error) {
	if url == "" {
		return nil, fmt.Errorf("XaiopStream requires a non-empty url")
	}
	modes, err := xaiop.NormalizeModes(opts.Modes)
	if err != nil {
		return nil, err
	}
	s := &XaiopStream{
		url:              url,
		opts:             opts,
		status:           StatusIdle,
		streamProcessing: boolOr(opts.StreamProcessing, true),
		mergeChunkWindow: boolOr(opts.MergeChunkWindow, true),
		modes:            modes,
		onChunk:          opts.OnChunk,
		onDone:           opts.OnDone,
		onError:          opts.OnError,
	}
	s.rebuildControl()
	return s, nil
}

func (s *XaiopStream) rebuildControl() {
	s.control = control.NewControlIngest(&control.Handlers{
		OnControlError: func(err *control.ControlError) {
			if s.onError != nil {
				s.onError(err)
			}
		},
		OnSeq: func(body any, _ *control.Frame) {
			m, _ := body.(map[string]any)
			if m == nil || s.engine == nil {
				return
			}
			n := 0
			switch v := m["seq"].(type) {
			case float64:
				n = int(v)
			case int:
				n = v
			}
			if n >= 1 {
				_ = s.engine.NoteLogSeq(n)
			}
		},
	})
}

// URL returns the bound URL.
func (s *XaiopStream) URL() string { return s.url }

// Status returns the current stream status string.
func (s *XaiopStream) Status() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.status
}

// LastError returns the last error, if any.
func (s *XaiopStream) LastError() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastError
}

// Snapshot returns a clone of the final / latest snapshot (nil until Finish/complete).
func (s *XaiopStream) Snapshot() any {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.snapshot == nil {
		return nil
	}
	return xaiop.CloneJSON(s.snapshot)
}

// Buffer returns the ingested wire text.
func (s *XaiopStream) Buffer() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.engine != nil {
		// Live view — avoid copying the whole buffer on every Push sync.
		return s.engine.Buffer()
	}
	return s.buffer
}

// History returns parse history when enabled.
func (s *XaiopStream) History() *ParseHistory {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.engine == nil {
		return nil
	}
	return s.engine.History()
}

// IsBusy reports connecting/streaming/completing.
func (s *XaiopStream) IsBusy() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.busyLocked()
}

func (s *XaiopStream) busyLocked() bool {
	return s.status == StatusConnecting || s.status == StatusStreaming || s.status == StatusCompleting
}

// OnChunk sets the phase-diff callback (fluent).
func (s *XaiopStream) OnChunk(fn func(diff any, meta map[string]any)) *XaiopStream {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onChunk = fn
	return s
}

// OnDone sets the completion callback (fluent).
func (s *XaiopStream) OnDone(fn func(snapshot any)) *XaiopStream {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onDone = fn
	return s
}

// OnError sets the error callback (fluent).
func (s *XaiopStream) OnError(fn func(err error)) *XaiopStream {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onError = fn
	return s
}

// Chunks returns a channel of phase Diffs. Requires asyncIterator mode.
// The channel is closed when the stream completes or fails.
func (s *XaiopStream) Chunks() <-chan any {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.modes[xaiop.StreamModeAsyncIterator]; !ok {
		ch := make(chan any)
		close(ch)
		return ch
	}
	if s.chunkCh == nil {
		s.chunkCh = make(chan any, 64)
	}
	return s.chunkCh
}

// Push ingests a RAW wire chunk (sync). Call Finish when the feed ends.
func (s *XaiopStream) Push(chunk string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.aborted.Load() {
		return fmt.Errorf("aborted")
	}
	if err := s.ensureRawEngineLocked(); err != nil {
		return err
	}
	if s.status == StatusConnecting {
		s.status = StatusStreaming
	}
	wire := s.control.Push(chunk)
	if wire == "" {
		return nil
	}
	if err := s.engine.Push(wire); err != nil {
		s.failLocked(err)
		return err
	}
	s.syncFromEngineLocked()
	return nil
}

// Finish completes a RAW Push cycle and materializes the final Snapshot.
func (s *XaiopStream) Finish() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.aborted.Load() {
		return fmt.Errorf("aborted")
	}
	if err := s.ensureRawEngineLocked(); err != nil {
		return err
	}
	s.status = StatusCompleting
	wire := s.control.Flush()
	if wire != "" {
		if err := s.engine.Push(wire); err != nil {
			s.failLocked(err)
			return err
		}
	}
	s.engine.Finish()
	s.syncFromEngineLocked()
	final := s.snapshot
	if final == nil {
		final = map[string]any{}
	}
	delivered := xaiop.CloneJSON(final)
	s.deliverDoneLocked(delivered)
	s.status = StatusCompleted
	s.rawActive = false
	s.closeChunksLocked()
	return nil
}

// Start begins an HTTP or SSE fetch for the bound URL and blocks until done,
// aborted, or ctx cancellation.
func (s *XaiopStream) Start(ctx context.Context) error {
	s.mu.Lock()
	if s.busyLocked() || s.rawActive {
		s.mu.Unlock()
		return fmt.Errorf("XaiopStream is busy; abort or wait before start")
	}
	s.resetCycleLocked()
	s.status = StatusConnecting
	s.aborted.Store(false)

	kind := s.opts.Transport
	if kind == "" {
		kind = TransportHTTP
	}
	if err := s.buildEngineLocked(); err != nil {
		s.mu.Unlock()
		return err
	}
	done := make(chan error, 1)
	req := TransportRequest{
		URL:     s.url,
		Kind:    kind,
		Method:  s.opts.Method,
		Headers: s.opts.Headers,
		Body:    s.opts.Body,
	}
	s.transport = OpenTransport(req, TransportHandlers{
		OnText: func(text string) {
			s.ingestText(text)
		},
		OnDone: func() {
			done <- s.completeSuccessfully()
		},
		OnError: func(err error) {
			s.fail(err)
			done <- err
		},
	})
	s.mu.Unlock()

	select {
	case <-ctx.Done():
		s.Abort()
		return ctx.Err()
	case err := <-done:
		if s.aborted.Load() {
			return fmt.Errorf("aborted")
		}
		if s.Status() == StatusCompleted {
			return nil
		}
		return err
	}
}

// SendRaw starts an async RAW transport from source (string / []byte / io.Reader / []string).
// Prefer Push/Finish for synchronous RAW feeds.
func (s *XaiopStream) SendRaw(source any) error {
	s.mu.Lock()
	if s.busyLocked() || s.rawActive {
		s.mu.Unlock()
		return fmt.Errorf("XaiopStream is busy; abort or wait before send")
	}
	s.resetCycleLocked()
	s.status = StatusConnecting
	s.aborted.Store(false)
	if err := s.buildEngineLocked(); err != nil {
		s.mu.Unlock()
		return err
	}
	done := make(chan error, 1)
	s.transport = OpenTransport(TransportRequest{
		URL:    s.url,
		Kind:   TransportRAW,
		Source: source,
	}, TransportHandlers{
		OnText: func(text string) { s.ingestText(text) },
		OnDone: func() { done <- s.completeSuccessfully() },
		OnError: func(err error) {
			s.fail(err)
			done <- err
		},
	})
	s.mu.Unlock()
	err := <-done
	if s.Status() == StatusCompleted {
		return nil
	}
	return err
}

// Abort cancels an in-flight Start/SendRaw (or marks a Push cycle aborted).
func (s *XaiopStream) Abort() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	busy := s.busyLocked()
	if !busy && s.transport == nil && !s.rawActive {
		return false
	}
	s.aborted.Store(true)
	if s.transport != nil {
		s.transport.Abort()
	}
	if busy || s.status == StatusConnecting {
		s.lastError = fmt.Errorf("aborted")
		s.status = StatusAborted
		s.deliverErrorLocked(s.lastError)
		s.closeChunksLocked()
		s.transport = nil
		s.rawActive = false
		return true
	}
	return false
}

func (s *XaiopStream) ensureRawEngineLocked() error {
	if s.engine != nil && s.rawActive {
		return nil
	}
	if s.busyLocked() && !s.rawActive {
		return fmt.Errorf("XaiopStream is busy")
	}
	s.resetCycleLocked()
	s.status = StatusConnecting
	s.rawActive = true
	s.aborted.Store(false)
	return s.buildEngineLocked()
}

func (s *XaiopStream) buildEngineLocked() error {
	emit := s.wantsPhaseDiffLocked()
	hooks := Hooks{
		OnChunk:           s.deliverChunk,
		Cover:             s.opts.Cover,
		HistorySnapshot:   s.opts.HistorySnapshot,
		HistoryRealtime:   s.opts.HistoryRealtime,
		SymbolKeys:        s.opts.SymbolKeys,
		Compat:            s.opts.Compat,
		LineIntercept:     append([]xaiop.LineInterceptor(nil), s.opts.LineIntercept...),
		AnnotationSpan:    append([]xaiop.AnnotationSpanHandler(nil), s.opts.AnnotationSpan...),
		MergeChunkWindow:  &s.mergeChunkWindow,
		StreamProcessing:  &s.streamProcessing,
		RetainWireHistory: s.opts.RetainWireHistory,
		EmitDiff:          &emit,
	}
	s.engine = NewDotCheckpointEngine(hooks)
	if s.opts.HistorySnapshot && s.engine.History() != nil {
		s.engine.History().SetSource(s.url)
	}
	if _, ok := s.modes[xaiop.StreamModeAsyncIterator]; ok && s.chunkCh == nil {
		s.chunkCh = make(chan any, 64)
	}
	return nil
}

func (s *XaiopStream) wantsPhaseDiffLocked() bool {
	if _, ok := s.modes[xaiop.StreamModeAsyncIterator]; ok {
		return true
	}
	if _, ok := s.modes[xaiop.StreamModeEvents]; ok {
		return true
	}
	if _, ok := s.modes[xaiop.StreamModeCallback]; ok && s.onChunk != nil {
		return true
	}
	return s.onChunk != nil
}

func (s *XaiopStream) ingestText(text string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.status == StatusAborted || s.status == StatusError || s.status == StatusCompleted {
		return
	}
	if s.status == StatusConnecting {
		s.status = StatusStreaming
	}
	wire := s.control.Push(text)
	if wire == "" || s.engine == nil {
		return
	}
	if err := s.engine.Push(wire); err != nil {
		s.failLocked(err)
		return
	}
	s.syncFromEngineLocked()
}

func (s *XaiopStream) completeSuccessfully() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.status == StatusAborted || s.status == StatusError {
		return s.lastError
	}
	s.status = StatusCompleting
	if s.engine == nil {
		return fmt.Errorf("no engine")
	}
	wire := s.control.Flush()
	if wire != "" {
		if err := s.engine.Push(wire); err != nil {
			s.failLocked(err)
			return err
		}
	}
	s.engine.Finish()
	s.syncFromEngineLocked()
	final := s.snapshot
	if final == nil {
		final = map[string]any{}
	}
	delivered := xaiop.CloneJSON(final)
	s.deliverDoneLocked(delivered)
	s.status = StatusCompleted
	s.transport = nil
	s.closeChunksLocked()
	return nil
}

func (s *XaiopStream) syncFromEngineLocked() {
	if s.engine == nil {
		return
	}
	// Do not materialize engine.Buffer() here: chunked Push would copy O(n)
	// bytes per chunk (quadratic). XaiopStream.Buffer() reads the engine live.
	if s.engine.CommittedAt() > 0 {
		s.committedSnapshot = nil
		s.committedAvailable = true
	}
	if snap := s.engine.Snapshot(); snap != nil {
		s.snapshot = snap
	}
}

// deliverChunk is invoked from DotCheckpointEngine while the stream lock may already
// be held (Push / ingestText). It must not re-enter s.mu.
func (s *XaiopStream) deliverChunk(diff any, meta map[string]any) {
	onChunk := s.onChunk
	ch := s.chunkCh
	closed := s.chunkClosed
	if onChunk != nil {
		onChunk(diff, meta)
	}
	if ch != nil && !closed {
		select {
		case ch <- diff:
		default:
			go func(c chan any, d any) { c <- d }(ch, diff)
		}
	}
}

func (s *XaiopStream) deliverDoneLocked(json any) {
	if s.onDone != nil {
		s.onDone(json)
	}
}

func (s *XaiopStream) deliverErrorLocked(err error) {
	if s.onError != nil {
		s.onError(err)
	}
}

func (s *XaiopStream) fail(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.failLocked(err)
}

func (s *XaiopStream) failLocked(err error) {
	if s.status == StatusCompleted || s.status == StatusAborted || s.status == StatusError {
		return
	}
	s.lastError = err
	s.status = StatusError
	s.deliverErrorLocked(err)
	s.closeChunksLocked()
	if s.transport != nil {
		s.transport.Abort()
		s.transport = nil
	}
	s.rawActive = false
}

func (s *XaiopStream) closeChunksLocked() {
	if s.chunkCh != nil && !s.chunkClosed {
		close(s.chunkCh)
		s.chunkClosed = true
	}
}

func (s *XaiopStream) resetCycleLocked() {
	s.lastError = nil
	s.snapshot = nil
	s.committedSnapshot = nil
	s.committedAvailable = false
	s.buffer = ""
	s.engine = nil
	s.rawActive = false
	s.transport = nil
	s.rebuildControl()
	// Keep an already-opened Chunks() channel so callers can subscribe before Push/Send.
	if s.chunkCh == nil || s.chunkClosed {
		s.chunkClosed = false
		s.chunkCh = nil
		if _, ok := s.modes[xaiop.StreamModeAsyncIterator]; ok {
			s.chunkCh = make(chan any, 64)
		}
	}
}
