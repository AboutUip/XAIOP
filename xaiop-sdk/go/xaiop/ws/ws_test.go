package ws_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/ws"
)

func TestMockConnPhasePush(t *testing.T) {
	clientSock, serverSock := ws.NewMockPair()
	var phases []any
	var done any
	consumer, err := ws.NewConnection(serverSock, &ws.ConnectionOptions{
		MergeChunkWindow: boolPtr(false),
		OnPhase: func(diff any, _ map[string]any) {
			phases = append(phases, diff)
		},
		OnDone: func(snap any) { done = snap },
	})
	if err != nil {
		t.Fatal(err)
	}
	producer, err := ws.NewConnection(clientSock, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := producer.PushJSON("a", int64(1), false); err != nil {
		t.Fatal(err)
	}
	if err := producer.PushJSON("b", int64(2), false); err != nil {
		t.Fatal(err)
	}
	if err := producer.End(); err != nil {
		t.Fatal(err)
	}
	select {
	case <-consumer.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for done")
	}
	if len(phases) != 2 {
		t.Fatalf("phases=%#v", phases)
	}
	if !reflect.DeepEqual(phases[0], map[string]any{"a": int64(1)}) {
		t.Fatalf("phase0=%#v", phases[0])
	}
	want, err := xaiop.Parse(">\na:1\n.\n>\nb:2\n.\n")
	if err != nil {
		t.Fatal(err)
	}
	want = xaiop.Materialize(want)
	if !reflect.DeepEqual(done, want) {
		t.Fatalf("done=%#v want=%#v", done, want)
	}
}

func TestPhaseEncodePath(t *testing.T) {
	wire, err := xaiop.PhaseEncodeKeyValue("k", "v", xaiop.PhaseEncodeOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if wire == "" || wire[len(wire)-2:] != ".\n" && !(len(wire) >= 2 && wire[len(wire)-1] == '\n') {
		// must end with .\n for non-final
	}
	if len(wire) < 2 || wire[len(wire)-2:] != ".\n" {
		t.Fatalf("expected trailing .\\n, got %q", wire)
	}
}

func TestListenConnectSmoke(t *testing.T) {
	hub, err := ws.Listen(&ws.ListenOptions{Host: "127.0.0.1", Port: 0})
	if err != nil {
		t.Fatal(err)
	}
	defer hub.Close()

	accepted := make(chan *ws.Connection, 1)
	hub.OnConnection(func(c *ws.Connection) {
		accepted <- c
		_ = c.PushJSON("hello", "world", false)
		_ = c.End()
	})

	var phases []any
	client, err := ws.Connect(hub.URL(), &ws.ConnectOptions{
		ConnectionOptions: ws.ConnectionOptions{
			MergeChunkWindow: boolPtr(false),
			OnPhase: func(diff any, _ map[string]any) {
				phases = append(phases, diff)
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	select {
	case <-accepted:
	case <-time.After(2 * time.Second):
		t.Fatal("server accept timeout")
	}
	select {
	case <-client.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("client done timeout")
	}
	if len(phases) < 1 {
		t.Fatalf("expected phase, got %#v", phases)
	}
}

func boolPtr(v bool) *bool { return &v }
