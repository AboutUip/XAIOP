package stream

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"unicode/utf8"
)

// TransportKind selects the ingest transport.
type TransportKind string

const (
	TransportHTTP TransportKind = "http"
	TransportSSE  TransportKind = "sse"
	TransportRAW  TransportKind = "raw"
)

// TransportRequest configures OpenTransport.
type TransportRequest struct {
	URL        string
	Kind       TransportKind
	Method     string
	Headers    map[string]string
	Body       string
	TimeoutMs  int64
	SSEEvents  map[string]struct{} // nil = all events
	Source     any                 // RAW: io.Reader | string | []byte | []string | <-chan string
	HTTPClient *http.Client
}

// TransportHandlers receive transport events.
type TransportHandlers struct {
	OnText  func(text string)
	OnDone  func()
	OnError func(err error)
}

// TransportHandle can abort an in-flight transport.
type TransportHandle struct {
	abort func()
}

// Abort cancels the transport.
func (h *TransportHandle) Abort() {
	if h != nil && h.abort != nil {
		h.abort()
	}
}

// OpenTransport starts I/O on a goroutine and returns an abort handle.
func OpenTransport(req TransportRequest, handlers TransportHandlers) *TransportHandle {
	var aborted atomic.Bool
	ctx, cancel := context.WithCancel(context.Background())

	go func() {
		defer cancel()
		var err error
		kind := req.Kind
		if kind == "" {
			kind = TransportHTTP
		}
		switch kind {
		case TransportRAW:
			err = runRaw(req, handlers, &aborted)
		case TransportSSE:
			err = runSSE(ctx, req, handlers, &aborted)
		default:
			err = runHTTP(ctx, req, handlers, &aborted)
		}
		if aborted.Load() {
			if handlers.OnError != nil {
				handlers.OnError(fmt.Errorf("aborted"))
			}
			return
		}
		if err != nil {
			if handlers.OnError != nil {
				handlers.OnError(err)
			}
			return
		}
		if handlers.OnDone != nil {
			handlers.OnDone()
		}
	}()

	return &TransportHandle{abort: func() {
		aborted.Store(true)
		cancel()
	}}
}

func emitText(h TransportHandlers, text string) {
	if text != "" && h.OnText != nil {
		h.OnText(text)
	}
}

func runRaw(req TransportRequest, h TransportHandlers, aborted *atomic.Bool) error {
	if req.Source == nil {
		return fmt.Errorf("raw transport requires source")
	}
	switch src := req.Source.(type) {
	case string:
		if aborted.Load() {
			return fmt.Errorf("aborted")
		}
		emitText(h, src)
		return nil
	case []byte:
		if aborted.Load() {
			return fmt.Errorf("aborted")
		}
		emitText(h, string(src))
		return nil
	case io.Reader:
		return readReaderUTF8(src, h, aborted)
	case []string:
		for _, piece := range src {
			if aborted.Load() {
				return fmt.Errorf("aborted")
			}
			emitText(h, piece)
		}
		return nil
	case <-chan string:
		for piece := range src {
			if aborted.Load() {
				return fmt.Errorf("aborted")
			}
			emitText(h, piece)
		}
		return nil
	default:
		return fmt.Errorf("raw source type %T not supported (want io.Reader, string, []byte, []string, or <-chan string)", src)
	}
}

func readReaderUTF8(r io.Reader, h TransportHandlers, aborted *atomic.Bool) error {
	buf := make([]byte, 8192)
	var carry []byte
	for {
		if aborted.Load() {
			return fmt.Errorf("aborted")
		}
		n, err := r.Read(buf)
		if n > 0 {
			carry = append(carry, buf[:n]...)
			for len(carry) > 0 {
				r, size := utf8.DecodeRune(carry)
				if r == utf8.RuneError && size == 1 {
					if len(carry) < 4 {
						break // wait for more bytes
					}
					emitText(h, string(utf8.RuneError))
					carry = carry[1:]
					continue
				}
				emitText(h, string(carry[:size]))
				carry = carry[size:]
			}
		}
		if err == io.EOF {
			if len(carry) > 0 {
				emitText(h, string(carry))
			}
			return nil
		}
		if err != nil {
			return err
		}
	}
}

func httpClient(req TransportRequest) *http.Client {
	if req.HTTPClient != nil {
		return req.HTTPClient
	}
	return http.DefaultClient
}

func runHTTP(ctx context.Context, req TransportRequest, h TransportHandlers, aborted *atomic.Bool) error {
	if req.URL == "" {
		return fmt.Errorf("transport url is required")
	}
	method := req.Method
	if method == "" {
		method = http.MethodGet
	}
	var body io.Reader
	if req.Body != "" {
		body = strings.NewReader(req.Body)
	}
	httpReq, err := http.NewRequestWithContext(ctx, method, req.URL, body)
	if err != nil {
		return err
	}
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}
	resp, err := httpClient(req).Do(httpReq)
	if err != nil {
		if aborted.Load() || ctx.Err() != nil {
			return fmt.Errorf("aborted")
		}
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return readReaderUTF8(resp.Body, h, aborted)
}

func runSSE(ctx context.Context, req TransportRequest, h TransportHandlers, aborted *atomic.Bool) error {
	headers := map[string]string{}
	for k, v := range req.Headers {
		headers[k] = v
	}
	if _, ok := headers["Accept"]; !ok {
		headers["Accept"] = "text/event-stream"
	}
	inner := TransportRequest{
		URL:        req.URL,
		Kind:       TransportHTTP,
		Method:     req.Method,
		Headers:    headers,
		Body:       req.Body,
		TimeoutMs:  req.TimeoutMs,
		HTTPClient: req.HTTPClient,
	}
	var mu sync.Mutex
	var buf strings.Builder
	wrapped := TransportHandlers{
		OnText: func(text string) {
			mu.Lock()
			defer mu.Unlock()
			buf.WriteString(text)
			flushSSEBlocks(&buf, h, req.SSEEvents)
		},
		OnDone:  func() {},
		OnError: h.OnError,
	}
	if err := runHTTP(ctx, inner, wrapped, aborted); err != nil {
		return err
	}
	mu.Lock()
	defer mu.Unlock()
	if rem := strings.TrimSpace(buf.String()); rem != "" {
		emitSSEData(h, ParseSSEBlock(buf.String(), req.SSEEvents))
	}
	return nil
}

func flushSSEBlocks(buf *strings.Builder, h TransportHandlers, allow map[string]struct{}) {
	s := buf.String()
	parts := splitOnBlankLines(s)
	if len(parts) <= 1 {
		return
	}
	buf.Reset()
	buf.WriteString(parts[len(parts)-1])
	for i := 0; i < len(parts)-1; i++ {
		emitSSEData(h, ParseSSEBlock(parts[i], allow))
	}
}

// splitOnBlankLines splits on \n\n or \r\n\r\n; last element is the incomplete tail.
func splitOnBlankLines(s string) []string {
	var parts []string
	start := 0
	i := 0
	for i < len(s) {
		if s[i] == '\n' && i+1 < len(s) && s[i+1] == '\n' {
			parts = append(parts, s[start:i+1])
			start = i + 2
			i += 2
			continue
		}
		if s[i] == '\n' && i >= 1 && s[i-1] == '\r' &&
			i+2 < len(s) && s[i+1] == '\r' && s[i+2] == '\n' {
			parts = append(parts, s[start:i+1])
			start = i + 3
			i += 3
			continue
		}
		i++
	}
	parts = append(parts, s[start:])
	return parts
}

func emitSSEData(h TransportHandlers, data string) {
	if data == "" {
		return
	}
	if !strings.HasSuffix(data, "\n") {
		data += "\n"
	}
	emitText(h, data)
}

// ParseSSEBlock joins multi-line data: fields with \n (Node SSE parser).
func ParseSSEBlock(block string, allow map[string]struct{}) string {
	if strings.TrimSpace(block) == "" {
		return ""
	}
	event := "message"
	var dataLines []string
	sc := bufio.NewScanner(strings.NewReader(block))
	for sc.Scan() {
		raw := sc.Text()
		if raw == "" || strings.HasPrefix(raw, ":") {
			continue
		}
		field, value := raw, ""
		if idx := strings.IndexByte(raw, ':'); idx >= 0 {
			field = raw[:idx]
			value = raw[idx+1:]
			if strings.HasPrefix(value, " ") {
				value = value[1:]
			}
		}
		switch field {
		case "event":
			event = value
		case "data":
			dataLines = append(dataLines, value)
		}
	}
	if allow != nil {
		if _, ok := allow[event]; !ok {
			return ""
		}
	}
	if len(dataLines) == 0 {
		return ""
	}
	return strings.Join(dataLines, "\n")
}

// ChunksOf is a RAW source helper (string pieces).
func ChunksOf(pieces ...string) []string {
	return pieces
}

// BytesReader wraps bytes as an io.Reader for RAW.
func BytesReader(b []byte) io.Reader {
	return bytes.NewReader(b)
}
