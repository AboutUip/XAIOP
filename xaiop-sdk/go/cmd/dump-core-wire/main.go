// Command dump-core-wire dumps shared cases.json to NDJSON for Python ↔ Go comparison.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
)

type corpus struct {
	Cases []caseSpec `json:"cases"`
}

type caseSpec struct {
	ID         string          `json:"id"`
	Kind       string          `json:"kind"`
	Wire       string          `json:"wire"`
	File       string          `json:"file"`
	Fragment   bool            `json:"fragment"`
	Chunks     []string        `json:"chunks"`
	Value      json.RawMessage `json:"value"`
	Root       string          `json:"root"`
	KeyOrder   string          `json:"key_order"`
}

func main() {
	outPath := flag.String("out", "", "output NDJSON path")
	casesPath := flag.String("cases", "", "cases.json path (default: ../../conformance/core-wire/cases.json from module)")
	flag.Parse()
	if *outPath == "" {
		fmt.Fprintln(os.Stderr, "--out required")
		os.Exit(2)
	}

	casesFile := *casesPath
	if casesFile == "" {
		// xaiop-sdk/go/cmd/dump-core-wire → xaiop-sdk/conformance/core-wire/cases.json
		here, err := os.Getwd()
		if err != nil {
			fatal(err)
		}
		// Prefer relative to this source file location via cwd when run from repo.
		candidates := []string{
			filepath.Join(here, "cases.json"),
			filepath.Join(here, "..", "..", "conformance", "core-wire", "cases.json"),
			filepath.Join(here, "..", "..", "..", "conformance", "core-wire", "cases.json"),
		}
		for _, c := range candidates {
			if st, err := os.Stat(c); err == nil && !st.IsDir() {
				casesFile = c
				break
			}
		}
		if casesFile == "" {
			fatal(fmt.Errorf("cases.json not found; pass --cases"))
		}
	}

	root := filepath.Dir(casesFile)
	raw, err := os.ReadFile(casesFile)
	if err != nil {
		fatal(err)
	}
	var doc corpus
	if err := json.Unmarshal(raw, &doc); err != nil {
		fatal(err)
	}

	var lines []string
	for _, c := range doc.Cases {
		row, err := runCase(root, c)
		if err != nil {
			fatal(fmt.Errorf("%s: %w", c.ID, err))
		}
		b, err := json.Marshal(row)
		if err != nil {
			fatal(err)
		}
		lines = append(lines, string(b))
	}
	if err := os.MkdirAll(filepath.Dir(*outPath), 0o755); err != nil {
		fatal(err)
	}
	body := ""
	for i, line := range lines {
		if i > 0 {
			body += "\n"
		}
		body += line
	}
	body += "\n"
	if err := os.WriteFile(*outPath, []byte(body), 0o644); err != nil {
		fatal(err)
	}
	fmt.Printf("wrote %d cases → %s\n", len(lines), *outPath)
}

func runCase(root string, c caseSpec) (map[string]any, error) {
	out := map[string]any{"case": c.ID, "kind": c.Kind}
	switch c.Kind {
	case "parse":
		parsed, err := xaiop.Parse(c.Wire)
		if err != nil {
			out["error"] = err.Error()
			return out, nil
		}
		_, isFrag := parsed.(*xaiop.Fragment)
		if c.Fragment && !isFrag {
			out["error"] = "expected fragment"
			return out, nil
		}
		if !c.Fragment && isFrag {
			out["error"] = "unexpected fragment"
			return out, nil
		}
		out["fragment"] = isFrag
		out["tree"] = xaiop.Materialize(parsed)
		return out, nil

	case "parse_file":
		b, err := os.ReadFile(filepath.Join(root, c.File))
		if err != nil {
			return nil, err
		}
		parsed, err := xaiop.Parse(string(b))
		if err != nil {
			return nil, err
		}
		_, isFrag := parsed.(*xaiop.Fragment)
		out["fragment"] = isFrag
		out["tree"] = xaiop.Materialize(parsed)
		return out, nil

	case "parse_error":
		_, err := xaiop.Parse(c.Wire)
		if err == nil {
			out["error"] = "expected syntax error"
			return out, nil
		}
		if _, ok := err.(*xaiop.SyntaxError); !ok {
			out["error"] = "expected SyntaxError, got " + err.Error()
			return out, nil
		}
		out["ok"] = true
		out["message"] = err.Error()
		return out, nil

	case "live":
		live := xaiop.NewLiveParser()
		for _, chunk := range c.Chunks {
			live.FeedText(chunk)
		}
		parsed, err := live.Value()
		if err != nil {
			out["error"] = err.Error()
			return out, nil
		}
		_, isFrag := parsed.(*xaiop.Fragment)
		out["fragment"] = isFrag
		out["tree"] = xaiop.Materialize(parsed)
		return out, nil

	case "encode":
		var value any
		if err := json.Unmarshal(c.Value, &value); err != nil {
			return nil, err
		}
		rootOpt := c.Root
		if rootOpt == "" {
			rootOpt = "auto"
		}
		keyOrder := c.KeyOrder
		if keyOrder == "" {
			keyOrder = "sorted"
		}
		wire, err := xaiop.Encode(value, xaiop.EncodeOptions{Root: rootOpt, TrailingNewline: true, KeyOrder: keyOrder})
		if err != nil {
			out["error"] = err.Error()
			return out, nil
		}
		out["wire"] = wire
		return out, nil

	case "encode_error":
		var value any
		if err := json.Unmarshal(c.Value, &value); err != nil {
			return nil, err
		}
		rootOpt := c.Root
		if rootOpt == "" {
			rootOpt = "auto"
		}
		_, err := xaiop.Encode(value, xaiop.EncodeOptions{Root: rootOpt, TrailingNewline: true})
		if err == nil {
			out["error"] = "expected encode error"
			return out, nil
		}
		if _, ok := err.(*xaiop.EncodeError); !ok {
			out["error"] = "expected EncodeError, got " + err.Error()
			return out, nil
		}
		out["ok"] = true
		out["message"] = err.Error()
		return out, nil

	case "roundtrip":
		var value any
		if err := json.Unmarshal(c.Value, &value); err != nil {
			return nil, err
		}
		keyOrder := c.KeyOrder
		if keyOrder == "" {
			keyOrder = "sorted"
		}
		wire, err := xaiop.Encode(value, xaiop.EncodeOptions{TrailingNewline: true, KeyOrder: keyOrder})
		if err != nil {
			return nil, err
		}
		parsed, err := xaiop.Parse(wire)
		if err != nil {
			return nil, err
		}
		out["wire"] = wire
		out["tree"] = xaiop.Materialize(parsed)
		return out, nil
	}
	out["error"] = "unknown kind " + c.Kind
	return out, nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
