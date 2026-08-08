package ws_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/ws"
)

func TestBidirectionalPhaseRoundTrip(t *testing.T) {
	aSock, bSock := ws.NewMockPair()
	var aPhases, bPhases []any
	var aDone, bDone any

	connA, err := ws.NewConnection(aSock, &ws.ConnectionOptions{
		MergeChunkWindow: boolPtr(false),
		OnPhase:          func(d any, _ map[string]any) { aPhases = append(aPhases, d) },
		OnDone:           func(s any) { aDone = s },
	})
	if err != nil {
		t.Fatal(err)
	}
	connB, err := ws.NewConnection(bSock, &ws.ConnectionOptions{
		MergeChunkWindow: boolPtr(false),
		OnPhase:          func(d any, _ map[string]any) { bPhases = append(bPhases, d) },
		OnDone:           func(s any) { bDone = s },
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := connA.PushJSON("fromA", int64(1), false); err != nil {
		t.Fatal(err)
	}
	if err := connA.End(); err != nil {
		t.Fatal(err)
	}
	select {
	case <-connB.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("B timeout")
	}
	if len(bPhases) != 1 || !reflect.DeepEqual(bPhases[0], map[string]any{"fromA": int64(1)}) {
		t.Fatalf("bPhases=%#v", bPhases)
	}
	want, _ := xaiop.Parse(">\nfromA:1\n.\n")
	if !reflect.DeepEqual(bDone, xaiop.Materialize(want)) {
		t.Fatalf("bDone=%#v", bDone)
	}

	// Fresh pair for reverse direction after End.
	cSock, dSock := ws.NewMockPair()
	connC, err := ws.NewConnection(cSock, &ws.ConnectionOptions{
		MergeChunkWindow: boolPtr(false),
		OnPhase:          func(d any, _ map[string]any) { aPhases = append(aPhases, d) },
		OnDone:           func(s any) { aDone = s },
	})
	if err != nil {
		t.Fatal(err)
	}
	connD, err := ws.NewConnection(dSock, &ws.ConnectionOptions{
		MergeChunkWindow: boolPtr(false),
		OnPhase:          func(any, map[string]any) {},
		OnDone:           func(any) {},
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = connC
	if err := connD.PushJSON("fromD", "ok", false); err != nil {
		t.Fatal(err)
	}
	if err := connD.End(); err != nil {
		t.Fatal(err)
	}
	select {
	case <-connC.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("C timeout")
	}
	_ = aDone
}

func TestListenConnectMultiPhase(t *testing.T) {
	hub, err := ws.Listen(&ws.ListenOptions{Host: "127.0.0.1", Port: 0})
	if err != nil {
		t.Fatal(err)
	}
	defer hub.Close()

	accepted := make(chan *ws.Connection, 1)
	hub.OnConnection(func(c *ws.Connection) {
		accepted <- c
		_ = c.PushJSON("n", int64(1), false)
		_ = c.PushJSON("m", int64(2), false)
		_ = c.End()
	})

	var phases []any
	var done any
	client, err := ws.Connect(hub.URL(), &ws.ConnectOptions{
		ConnectionOptions: ws.ConnectionOptions{
			MergeChunkWindow: boolPtr(false),
			OnPhase:          func(d any, _ map[string]any) { phases = append(phases, d) },
			OnDone:           func(s any) { done = s },
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	select {
	case <-accepted:
	case <-time.After(2 * time.Second):
		t.Fatal("accept timeout")
	}
	select {
	case <-client.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("done timeout")
	}
	if len(phases) != 2 {
		t.Fatalf("phases=%#v", phases)
	}
	want, err := xaiop.Parse(">\nn:1\n.\n>\nm:2\n.\n")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(done, xaiop.Materialize(want)) {
		t.Fatalf("done=%#v want=%#v", done, xaiop.Materialize(want))
	}
}
