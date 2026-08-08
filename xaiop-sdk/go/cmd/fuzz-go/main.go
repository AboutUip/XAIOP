// Command fuzz-go is a budgeted mutation fuzz harness for STRICT Parse / LiveParser.
// Syntax errors are expected; panics and unexpected error types fail the process.
package main

import (
	"errors"
	"flag"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"time"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
)

var insertLines = []string{">", "a:1", ".", "&x", "#note", "@a", "!a", "<", "-", ":item", "=a"}

func mutate(text string, rnd *rand.Rand) string {
	op := rnd.Intn(4)
	switch op {
	case 0:
		if text == "" {
			return text + ">"
		}
		i := rnd.Intn(len(text))
		code := 32 + rnd.Intn(95)
		return text[:i] + string(rune(code)) + text[i+1:]
	case 1:
		line := insertLines[rnd.Intn(len(insertLines))]
		lines := splitKeep(text)
		at := rnd.Intn(len(lines) + 1)
		out := make([]string, 0, len(lines)+1)
		out = append(out, lines[:at]...)
		out = append(out, line)
		out = append(out, lines[at:]...)
		return joinLines(out)
	case 2:
		if text == "" {
			return text
		}
		cut := rnd.Intn(len(text))
		return text[:cut]
	default:
		lines := splitKeep(text)
		if len(lines) == 0 {
			return text + "\n>"
		}
		i := rnd.Intn(len(lines))
		out := make([]string, 0, len(lines)+1)
		out = append(out, lines[:i]...)
		out = append(out, lines[i])
		out = append(out, lines[i:]...)
		return joinLines(out)
	}
}

func splitKeep(text string) []string {
	if text == "" {
		return nil
	}
	var lines []string
	start := 0
	for i := 0; i < len(text); i++ {
		if text[i] == '\n' {
			lines = append(lines, text[start:i])
			start = i + 1
		}
	}
	if start <= len(text) {
		lines = append(lines, text[start:])
	}
	return lines
}

func joinLines(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	out := lines[0]
	for i := 1; i < len(lines); i++ {
		out += "\n" + lines[i]
	}
	return out
}

func loadSeeds(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var seeds []string
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".xaiop" {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		seeds = append(seeds, string(b))
	}
	if len(seeds) == 0 {
		return nil, fmt.Errorf("no seeds in %s", dir)
	}
	return seeds, nil
}

func acceptErr(err error) bool {
	if err == nil {
		return true
	}
	var se *xaiop.SyntaxError
	return errors.As(err, &se)
}

func main() {
	maxIters := flag.Int("max", 200, "iteration budget")
	seedFlag := flag.Int64("seed", 0, "PRNG seed (default: time)")
	seedsDir := flag.String("seeds", "", "seeds directory (default: ../../conformance/fuzz/seeds)")
	flag.Parse()

	seed := *seedFlag
	if seed == 0 {
		seed = time.Now().UnixNano() & 0xffffffff
	}
	rnd := rand.New(rand.NewSource(seed))

	dir := *seedsDir
	if dir == "" {
		here, _ := os.Getwd()
		candidates := []string{
			filepath.Join(here, "seeds"),
			filepath.Join(here, "..", "..", "conformance", "fuzz", "seeds"),
			filepath.Join(here, "..", "conformance", "fuzz", "seeds"),
		}
		for _, c := range candidates {
			if st, err := os.Stat(c); err == nil && st.IsDir() {
				dir = c
				break
			}
		}
	}
	seeds, err := loadSeeds(dir)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	ok, syntax := 0, 0
	deadline := time.Now().Add(30 * time.Second)
	n := *maxIters
	if n < 1 {
		n = 1
	}

	for i := 0; i < n; i++ {
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "fuzz-go: time budget hit after %d iterations\n", i)
			break
		}
		text := seeds[rnd.Intn(len(seeds))]
		muts := 1 + rnd.Intn(4)
		for m := 0; m < muts; m++ {
			text = mutate(text, rnd)
		}

		func() {
			defer func() {
				if r := recover(); r != nil {
					fmt.Fprintf(os.Stderr, "fuzz-go: parse panic at iter %d: %v\n", i, r)
					os.Exit(1)
				}
			}()
			_, err := xaiop.Parse(text)
			if err == nil {
				ok++
				return
			}
			if acceptErr(err) {
				syntax++
				return
			}
			fmt.Fprintf(os.Stderr, "fuzz-go: unexpected parse error at iter %d: %v\n", i, err)
			os.Exit(1)
		}()

		func() {
			defer func() {
				if r := recover(); r != nil {
					fmt.Fprintf(os.Stderr, "fuzz-go: live panic at iter %d: %v\n", i, r)
					os.Exit(1)
				}
			}()
			lp := xaiop.NewLiveParser().FeedText(text)
			_, err := lp.Value()
			if err == nil {
				return
			}
			if acceptErr(err) {
				syntax++
				return
			}
			fmt.Fprintf(os.Stderr, "fuzz-go: unexpected live error at iter %d: %v\n", i, err)
			os.Exit(1)
		}()
	}

	fmt.Printf("fuzz-go OK seed=%d max=%d parseOk≈%d syntaxErrors≈%d\n", seed, n, ok, syntax)
}
