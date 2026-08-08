package ws

import (
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"
)

const guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

const (
	opcodeContinuation = 0x0
	opcodeText         = 0x1
	opcodeBinary       = 0x2
	opcodeClose        = 0x8
	opcodePing         = 0x9
	opcodePong         = 0xA
)

const (
	closeMessageTooBig = 1009
	defaultMaxPayload  = 100 * 1024 * 1024
)

func acceptKey(secWebSocketKey string) string {
	h := sha1.New()
	_, _ = io.WriteString(h, secWebSocketKey+guid)
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

type frame struct {
	fin     bool
	opcode  int
	payload []byte
}

func readFrame(r io.Reader, maxPayload int) (frame, error) {
	var hdr [2]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		return frame{}, err
	}
	fin := hdr[0]&0x80 != 0
	opcode := int(hdr[0] & 0x0F)
	masked := hdr[1]&0x80 != 0
	lenField := int64(hdr[1] & 0x7F)
	var payloadLen int64
	switch lenField {
	case 126:
		var ext [2]byte
		if _, err := io.ReadFull(r, ext[:]); err != nil {
			return frame{}, err
		}
		payloadLen = int64(binary.BigEndian.Uint16(ext[:]))
	case 127:
		var ext [8]byte
		if _, err := io.ReadFull(r, ext[:]); err != nil {
			return frame{}, err
		}
		payloadLen = int64(binary.BigEndian.Uint64(ext[:]))
		if payloadLen > int64(^uint(0)>>1) {
			return frame{}, fmt.Errorf("WebSocket frame too large: %d", payloadLen)
		}
	default:
		payloadLen = lenField
	}
	if maxPayload > 0 && payloadLen > int64(maxPayload) {
		return frame{}, fmt.Errorf("WebSocket frame too large: %d > maxPayload %d", payloadLen, maxPayload)
	}
	var maskKey [4]byte
	if masked {
		if _, err := io.ReadFull(r, maskKey[:]); err != nil {
			return frame{}, err
		}
	}
	payload := make([]byte, int(payloadLen))
	if payloadLen > 0 {
		if _, err := io.ReadFull(r, payload); err != nil {
			return frame{}, err
		}
	}
	if masked {
		for i := range payload {
			payload[i] ^= maskKey[i%4]
		}
	}
	return frame{fin: fin, opcode: opcode, payload: payload}, nil
}

func writeFrame(w io.Writer, opcode int, payload []byte, mask bool, fin bool) error {
	if payload == nil {
		payload = []byte{}
	}
	b0 := byte(opcode & 0x0F)
	if fin {
		b0 |= 0x80
	}
	buf := make([]byte, 0, len(payload)+14)
	buf = append(buf, b0)
	n := len(payload)
	maskBit := byte(0)
	if mask {
		maskBit = 0x80
	}
	switch {
	case n < 126:
		buf = append(buf, maskBit|byte(n))
	case n <= 0xFFFF:
		buf = append(buf, maskBit|126, byte(n>>8), byte(n))
	default:
		buf = append(buf, maskBit|127)
		var lenBuf [8]byte
		binary.BigEndian.PutUint64(lenBuf[:], uint64(n))
		buf = append(buf, lenBuf[:]...)
	}
	if mask {
		var key [4]byte
		if _, err := rand.Read(key[:]); err != nil {
			return err
		}
		buf = append(buf, key[:]...)
		for i, b := range payload {
			buf = append(buf, b^key[i%4])
		}
	} else {
		buf = append(buf, payload...)
	}
	_, err := w.Write(buf)
	return err
}

func closePayload(code int, reason string) []byte {
	rb := []byte(reason)
	if len(rb) > 123 {
		rb = rb[:123]
	}
	out := make([]byte, 2+len(rb))
	binary.BigEndian.PutUint16(out[:2], uint16(code))
	copy(out[2:], rb)
	return out
}
