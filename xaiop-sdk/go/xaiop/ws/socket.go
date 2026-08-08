package ws

import (
	"sync"
)

// Ready-state constants (WHATWG / Node ws numbering).
const (
	Connecting = 0
	Open       = 1
	Closing    = 2
	Closed     = 3
)

// Socket is the minimal WebSocket surface used by Connection.
type Socket interface {
	ReadyState() int
	Send(text string) error
	Close(code int, reason string) error
	Terminate()
	OnMessage(fn func(text string))
	OnClose(fn func())
	OnError(fn func(err error))
	RemoveListeners()
}

// MockSocket is an in-memory Socket for unit tests (no network).
type MockSocket struct {
	mu          sync.Mutex
	state       int
	sent        []string
	onMessage   func(string)
	onClose     func()
	onError     func(error)
	peer        *MockSocket
	closed      bool
}

// NewMockPair returns two linked mock sockets (client, server).
func NewMockPair() (client, server *MockSocket) {
	c := &MockSocket{state: Open}
	s := &MockSocket{state: Open}
	c.peer = s
	s.peer = c
	return c, s
}

// ReadyState implements Socket.
func (m *MockSocket) ReadyState() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state
}

// Send implements Socket.
func (m *MockSocket) Send(text string) error {
	m.mu.Lock()
	if m.state != Open {
		m.mu.Unlock()
		return errSocketClosed
	}
	m.sent = append(m.sent, text)
	peer := m.peer
	m.mu.Unlock()
	if peer != nil {
		peer.deliver(text)
	}
	return nil
}

func (m *MockSocket) deliver(text string) {
	m.mu.Lock()
	fn := m.onMessage
	m.mu.Unlock()
	if fn != nil {
		fn(text)
	}
}

// Sent returns outbound texts (test helper).
func (m *MockSocket) Sent() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]string(nil), m.sent...)
}

// Close implements Socket.
func (m *MockSocket) Close(code int, reason string) error {
	_ = code
	_ = reason
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return nil
	}
	m.closed = true
	m.state = Closed
	fn := m.onClose
	peer := m.peer
	m.mu.Unlock()
	if fn != nil {
		fn()
	}
	if peer != nil {
		peer.peerClose()
	}
	return nil
}

func (m *MockSocket) peerClose() {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return
	}
	m.closed = true
	m.state = Closed
	fn := m.onClose
	m.mu.Unlock()
	if fn != nil {
		fn()
	}
}

// Terminate implements Socket.
func (m *MockSocket) Terminate() { _ = m.Close(1006, "terminate") }

// OnMessage implements Socket.
func (m *MockSocket) OnMessage(fn func(text string)) {
	m.mu.Lock()
	m.onMessage = fn
	m.mu.Unlock()
}

// OnClose implements Socket.
func (m *MockSocket) OnClose(fn func()) {
	m.mu.Lock()
	m.onClose = fn
	m.mu.Unlock()
}

// OnError implements Socket.
func (m *MockSocket) OnError(fn func(err error)) {
	m.mu.Lock()
	m.onError = fn
	m.mu.Unlock()
}

// RemoveListeners implements Socket.
func (m *MockSocket) RemoveListeners() {
	m.mu.Lock()
	m.onMessage = nil
	m.onClose = nil
	m.onError = nil
	m.mu.Unlock()
}

type socketClosedError struct{}

func (socketClosedError) Error() string { return "websocket is not open" }

var errSocketClosed = socketClosedError{}
