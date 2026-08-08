package ws

import (
	"bufio"
	"io"
	"net"
	"sync"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
)

type netSocket struct {
	conn     net.Conn
	br       *bufio.Reader
	client   bool // client must mask outbound frames
	maxPay   int
	mu       sync.Mutex
	state    int
	onMsg    func(string)
	onClose  func()
	onError  func(error)
	closed   bool
	readDone chan struct{}
}

func newNetSocket(conn net.Conn, br *bufio.Reader, client bool, maxPay int) *netSocket {
	if br == nil {
		br = bufio.NewReader(conn)
	}
	if maxPay <= 0 {
		maxPay = defaultMaxPayload
	}
	s := &netSocket{
		conn:     conn,
		br:       br,
		client:   client,
		maxPay:   maxPay,
		state:    Open,
		readDone: make(chan struct{}),
	}
	go s.readLoop()
	return s
}

func (s *netSocket) ReadyState() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

func (s *netSocket) Send(text string) error {
	s.mu.Lock()
	if s.state != Open {
		s.mu.Unlock()
		return errSocketClosed
	}
	conn := s.conn
	client := s.client
	s.mu.Unlock()
	return writeFrame(conn, opcodeText, []byte(text), client, true)
}

func (s *netSocket) Close(code int, reason string) error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	s.state = Closing
	conn := s.conn
	client := s.client
	s.mu.Unlock()
	_ = writeFrame(conn, opcodeClose, closePayload(code, reason), client, true)
	s.mu.Lock()
	s.state = Closed
	fn := s.onClose
	s.mu.Unlock()
	_ = conn.Close()
	if fn != nil {
		fn()
	}
	return nil
}

func (s *netSocket) Terminate() {
	s.mu.Lock()
	s.closed = true
	s.state = Closed
	conn := s.conn
	fn := s.onClose
	s.mu.Unlock()
	_ = conn.Close()
	if fn != nil {
		fn()
	}
}

func (s *netSocket) OnMessage(fn func(text string)) {
	s.mu.Lock()
	s.onMsg = fn
	s.mu.Unlock()
}

func (s *netSocket) OnClose(fn func()) {
	s.mu.Lock()
	s.onClose = fn
	s.mu.Unlock()
}

func (s *netSocket) OnError(fn func(err error)) {
	s.mu.Lock()
	s.onError = fn
	s.mu.Unlock()
}

func (s *netSocket) RemoveListeners() {
	s.mu.Lock()
	s.onMsg = nil
	s.onClose = nil
	s.onError = nil
	s.mu.Unlock()
}

func (s *netSocket) readLoop() {
	defer close(s.readDone)
	var cont []byte
	var contOpcode int
	for {
		frame, err := readFrame(s.br, s.maxPay)
		if err != nil {
			if err != io.EOF {
				s.mu.Lock()
				fn := s.onError
				s.mu.Unlock()
				if fn != nil {
					fn(err)
				}
			}
			s.forceClose()
			return
		}
		switch frame.opcode {
		case opcodeText, opcodeBinary:
			if !frame.fin {
				cont = append([]byte(nil), frame.payload...)
				contOpcode = frame.opcode
				continue
			}
			s.dispatchText(string(frame.payload))
		case opcodeContinuation:
			cont = append(cont, frame.payload...)
			if frame.fin {
				if contOpcode == opcodeText || contOpcode == opcodeBinary {
					s.dispatchText(string(cont))
				}
				cont = nil
				contOpcode = 0
			}
		case opcodePing:
			_ = writeFrame(s.conn, opcodePong, frame.payload, s.client, true)
		case opcodePong:
			// ignore
		case opcodeClose:
			s.forceClose()
			return
		default:
			s.forceClose()
			return
		}
	}
}

func (s *netSocket) dispatchText(text string) {
	s.mu.Lock()
	fn := s.onMsg
	s.mu.Unlock()
	if fn != nil {
		fn(text)
	}
}

func (s *netSocket) forceClose() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	s.state = Closed
	fn := s.onClose
	conn := s.conn
	s.mu.Unlock()
	_ = conn.Close()
	if fn != nil {
		fn()
	}
}

func pushPhaseKV(key string, value any, final bool) (string, error) {
	return xaiop.PhaseEncodeKeyValue(key, value, xaiop.PhaseEncodeOptions{Final: final})
}

func pushPhaseObj(obj map[string]any, final bool) (string, error) {
	return xaiop.PhaseEncodeObjectPhase(obj, xaiop.PhaseEncodeOptions{Final: final})
}