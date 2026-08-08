// Command dump-goldens dumps product golden cases (encode / parse / stream) as NDJSON
// for Node ↔ Go comparison (mirrors conformance/python/dump-goldens.py).
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/stream"
)

var parseStreamFixtures = []string{
	"complex",
	"stream-phases",
	"overwrite-id",
	"delete-phases",
	"at-array-d2",
	"bang-broadcast",
	"d1-named-enter",
	"locate-equals",
	"hash-ignore",
	"at-exact",
}

func main() {
	outPath := flag.String("out", "", "output NDJSON path")
	fixturesDir := flag.String("fixtures", "", "fixtures directory (default: ../../conformance/fixtures)")
	flag.Parse()
	if *outPath == "" {
		fmt.Fprintln(os.Stderr, "--out required")
		os.Exit(2)
	}

	fix := *fixturesDir
	if fix == "" {
		here, _ := os.Getwd()
		candidates := []string{
			filepath.Join(here, "fixtures"),
			filepath.Join(here, "..", "conformance", "fixtures"),
			filepath.Join(here, "..", "..", "conformance", "fixtures"),
		}
		for _, c := range candidates {
			if st, err := os.Stat(c); err == nil && st.IsDir() {
				fix = c
				break
			}
		}
	}
	if fix == "" {
		fatal(fmt.Errorf("fixtures dir not found; pass --fixtures"))
	}

	var rows []string
	emit := func(obj map[string]any) {
		b, err := json.Marshal(obj)
		if err != nil {
			fatal(err)
		}
		rows = append(rows, string(b))
	}

	dumpEncode(fix, emit)
	dumpParse(fix, emit)
	for _, name := range parseStreamFixtures {
		dumpStream(fix, name, emit)
	}

	if err := os.MkdirAll(filepath.Dir(*outPath), 0o755); err != nil {
		fatal(err)
	}
	body := ""
	for i, line := range rows {
		if i > 0 {
			body += "\n"
		}
		body += line
	}
	body += "\n"
	if err := os.WriteFile(*outPath, []byte(body), 0o644); err != nil {
		fatal(err)
	}
	fmt.Printf("wrote %d cases → %s (SDK %s · protocol %s)\n",
		len(rows), *outPath, xaiop.SDKVersion, xaiop.ProtocolVersion)
}

func dumpEncode(fix string, emit func(map[string]any)) {
	raw, err := os.ReadFile(filepath.Join(fix, "encode-corpus.json"))
	if err != nil {
		fatal(err)
	}
	var corpus []json.RawMessage
	if err := json.Unmarshal(raw, &corpus); err != nil {
		fatal(err)
	}
	for i, item := range corpus {
		value, err := xaiop.DecodeJSONOrdered(item)
		if err != nil {
			fatal(fmt.Errorf("encode corpus %d: %w", i, err))
		}
		wire, err := xaiop.Encode(value, xaiop.EncodeOptions{TrailingNewline: true})
		if err != nil {
			fatal(fmt.Errorf("encode %d: %w", i, err))
		}
		emit(map[string]any{"case": fmt.Sprintf("encode:%d", i), "kind": "encode", "wire": wire})
	}
}

func dumpParse(fix string, emit func(map[string]any)) {
	for _, name := range parseStreamFixtures {
		b, err := os.ReadFile(filepath.Join(fix, name+".xaiop"))
		if err != nil {
			fatal(err)
		}
		tree, err := xaiop.Parse(string(b))
		if err != nil {
			fatal(fmt.Errorf("parse %s: %w", name, err))
		}
		emit(map[string]any{
			"case": "parse:" + name,
			"kind": "parse",
			"tree": xaiop.MaterializeSnapshot(tree),
		})
	}
}

func dumpStream(fix, name string, emit func(map[string]any)) {
	b, err := os.ReadFile(filepath.Join(fix, name+".xaiop"))
	if err != nil {
		fatal(err)
	}
	mergeFalse := false
	var diffs []any
	engine := stream.NewDotCheckpointEngine(stream.Hooks{
		OnChunk: func(diff any, _ map[string]any) {
			diffs = append(diffs, diff)
		},
		MergeChunkWindow: &mergeFalse,
	})
	if err := engine.Push(string(b)); err != nil {
		fatal(fmt.Errorf("stream push %s: %w", name, err))
	}
	engine.Finish()
	caseName := name
	if name == "stream-phases" {
		caseName = "phases"
	}
	if diffs == nil {
		diffs = []any{}
	}
	emit(map[string]any{
		"case":     "stream:" + caseName,
		"kind":     "stream",
		"diffs":    diffs,
		"snapshot": engine.Snapshot(),
	})
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
