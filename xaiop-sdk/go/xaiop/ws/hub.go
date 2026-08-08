package ws

import (
	"bufio"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Hub is a listen-side WebSocket acceptor.
type Hub struct {
	ln       net.Listener
	url      string
	mu       sync.Mutex
	onConn   []func(*Connection)
	closed   bool
	maxPay   int
}

// ListenOptions configures Listen.
type ListenOptions struct {
	Host string
	Port int // 0 = ephemeral
}

// Listen starts an RFC6455 WebSocket server and returns a Hub.
func Listen(opts *ListenOptions) (*Hub, error) {
	if opts == nil {
		opts = &ListenOptions{}
	}
	host := opts.Host
	if host == "" {
		host = "127.0.0.1"
	}
	addr := fmt.Sprintf("%s:%d", host, opts.Port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}
	h := &Hub{
		ln:     ln,
		url:    "ws://" + ln.Addr().String(),
		maxPay: defaultMaxPayload,
	}
	go h.acceptLoop()
	return h, nil
}

// URL returns the ws:// listen URL.
func (h *Hub) URL() string { return h.url }

// OnConnection registers an accept handler.
func (h *Hub) OnConnection(fn func(*Connection)) *Hub {
	if fn != nil {
		h.mu.Lock()
		h.onConn = append(h.onConn, fn)
		h.mu.Unlock()
	}
	return h
}

// Close shuts down the listener.
func (h *Hub) Close() error {
	h.mu.Lock()
	h.closed = true
	h.mu.Unlock()
	return h.ln.Close()
}

func (h *Hub) acceptLoop() {
	for {
		conn, err := h.ln.Accept()
		if err != nil {
			return
		}
		go h.handleConn(conn)
	}
}

func (h *Hub) handleConn(nc net.Conn) {
	br := bufio.NewReader(nc)
	req, err := http.ReadRequest(br)
	if err != nil {
		_ = nc.Close()
		return
	}
	if !strings.EqualFold(req.Header.Get("Upgrade"), "websocket") {
		_ = nc.Close()
		return
	}
	key := req.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		_ = nc.Close()
		return
	}
	accept := acceptKey(key)
	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
	if _, err := io.WriteString(nc, resp); err != nil {
		_ = nc.Close()
		return
	}
	sock := newNetSocket(nc, br, false, h.maxPay)
	xc, err := NewConnection(sock, nil)
	if err != nil {
		_ = nc.Close()
		return
	}
	xc.LockHandlers()
	h.mu.Lock()
	handlers := append([]func(*Connection){}, h.onConn...)
	h.mu.Unlock()
	for _, fn := range handlers {
		fn(xc)
	}
}

// ConnectOptions configures Connect.
type ConnectOptions struct {
	ConnectionOptions
	HandshakeTimeout time.Duration
	Headers          map[string]string
}

// Connect dials a WebSocket server and returns a Connection.
func Connect(url string, opts *ConnectOptions) (*Connection, error) {
	if url == "" {
		return nil, fmt.Errorf("XaiopWs.connect requires a non-empty url")
	}
	if opts == nil {
		opts = &ConnectOptions{}
	}
	timeout := opts.HandshakeTimeout
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	u := strings.TrimPrefix(url, "ws://")
	u = strings.TrimPrefix(u, "wss://")
	hostPath := u
	host := u
	path := "/"
	if i := strings.IndexByte(u, '/'); i >= 0 {
		host = u[:i]
		path = u[i:]
		hostPath = host
	}
	d := net.Dialer{Timeout: timeout}
	nc, err := d.Dial("tcp", hostPath)
	if err != nil {
		return nil, err
	}
	_ = nc.SetDeadline(time.Now().Add(timeout))
	key := make([]byte, 16)
	_, _ = rand.Read(key)
	secKey := base64.StdEncoding.EncodeToString(key)
	req := fmt.Sprintf("GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n",
		path, host, secKey)
	for k, v := range opts.Headers {
		req += k + ": " + v + "\r\n"
	}
	req += "\r\n"
	if _, err := io.WriteString(nc, req); err != nil {
		_ = nc.Close()
		return nil, err
	}
	br := bufio.NewReader(nc)
	resp, err := http.ReadResponse(br, &http.Request{Method: "GET"})
	if err != nil {
		_ = nc.Close()
		return nil, err
	}
	if resp.StatusCode != 101 {
		_ = nc.Close()
		return nil, fmt.Errorf("WebSocket handshake failed: status %d", resp.StatusCode)
	}
	_ = nc.SetDeadline(time.Time{})
	sock := newNetSocket(nc, br, true, defaultMaxPayload)
	connOpts := opts.ConnectionOptions
	xc, err := NewConnection(sock, &connOpts)
	if err != nil {
		_ = nc.Close()
		return nil, err
	}
	xc.LockHandlers()
	return xc, nil
}

// XaiopWs is the facade matching Node/Java/Python.
type XaiopWs struct{}

// EncodePhaseJSON encodes a key/value phase.
func (XaiopWs) EncodePhaseJSON(key string, value any, final bool) (string, error) {
	return encodePhaseJSON(key, value, final)
}

// EncodePhaseObject encodes an object phase.
func (XaiopWs) EncodePhaseObject(obj map[string]any, final bool) (string, error) {
	return encodePhaseObject(obj, final)
}

func encodePhaseJSON(key string, value any, final bool) (string, error) {
	return pushPhaseKV(key, value, final)
}

func encodePhaseObject(obj map[string]any, final bool) (string, error) {
	return pushPhaseObj(obj, final)
}
