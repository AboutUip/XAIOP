package main

// Minimal XAIOP Go demo — parse / encode / live (no network).
//
// Usage:
//
//	go run . 
//	go run . path/to/file.xaiop
import (
	"fmt"
	"os"
	"strings"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
)

func main() {
	src := ">\nid:1\nname:demo\n.\n>\nid:2\n"
	if len(os.Args) > 1 {
		b, err := os.ReadFile(os.Args[1])
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		src = string(b)
	}

	fmt.Printf("XAIOP Go demo · SDK %s · protocol %s\n", xaiop.SDKVersion, xaiop.ProtocolVersion)
	fmt.Println(strings.Repeat("─", 48))

	parsed, err := xaiop.Parse(src)
	if err != nil {
		fmt.Fprintln(os.Stderr, "parse:", err)
		os.Exit(1)
	}
	fmt.Printf("parse → %#v\n", xaiop.Materialize(parsed))

	wire, err := xaiop.Encode(map[string]any{"hello": "world", "n": int64(1)}, xaiop.EncodeOptions{TrailingNewline: true})
	if err != nil {
		fmt.Fprintln(os.Stderr, "encode:", err)
		os.Exit(1)
	}
	fmt.Printf("encode → %q\n", wire)

	live := xaiop.NewLiveParser()
	live.FeedText(src)
	v, err := live.Value()
	if err != nil {
		fmt.Fprintln(os.Stderr, "live:", err)
		os.Exit(1)
	}
	fmt.Printf("live  → %#v\n", xaiop.Materialize(v))
}
