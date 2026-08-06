package xaiop

import "testing"

func TestProtocolVersion(t *testing.T) {
	if ProtocolVersion != "0.6.0" {
		t.Fatalf("ProtocolVersion = %q, want 0.6.0", ProtocolVersion)
	}
}

func TestSDKVersion(t *testing.T) {
	if SDKVersion != "0.6.0-alpha.1" {
		t.Fatalf("SDKVersion = %q, want 0.6.0-alpha.1", SDKVersion)
	}
}
