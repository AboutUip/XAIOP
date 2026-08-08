// XAIOP Go SDK stage timing harness (same stage names as timing/node + python + java).
//
// Goal: same-machine wall-clock regression / cross-runtime stage-name compare.
// Not JSON-parse championship; not LLM PERF-METRICS.
//
// Usage (from xaiop-sdk/timing):
//
//	go run ./go --quick
//	npm run bench:go
//	npm run bench:go:quick
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/stream"
)

const (
	d1Wire = `>
>meta
name:x
.
>rules-
>
id:R1
<
.
`
	d2Wire = `>
>orders-
>
id:1
sku:a
<
.
@orders
>
id:2
sku:b
<
.
`
	locateWire = `>
>left
>test
x:1
.
>right
>test
y:2
.
!test
z:9
.
=left>test
w:8
.
`
)

type row struct {
	Name      string   `json:"name"`
	Iters     int      `json:"iters"`
	TotalMs   float64  `json:"totalMs"`
	MsPerOp   float64  `json:"msPerOp"`
	OpsPerSec float64  `json:"opsPerSec"`
	Bytes     *int     `json:"bytes"`
	MBPerSec  *float64 `json:"mbPerSec"`
	Note      string   `json:"note,omitempty"`
}

func boolPtr(v bool) *bool { return &v }

func buildFixture(depth, breadth int) map[string]any {
	var nest func(level int) map[string]any
	nest = func(level int) map[string]any {
		o := map[string]any{}
		for i := 0; i < breadth; i++ {
			k := fmt.Sprintf("k%d", i)
			if level <= 0 {
				switch i % 3 {
				case 0:
					o[k] = fmt.Sprintf("v-%d", i)
				case 1:
					o[k] = int64(i * 17)
				default:
					o[k] = i%2 == 0
				}
			} else {
				o[k] = nest(level - 1)
			}
		}
		arr := make([]any, breadth)
		for j := 0; j < breadth; j++ {
			arr[j] = map[string]any{"id": int64(j), "tag": fmt.Sprintf("t%d", j)}
		}
		o["arr"] = arr
		return o
	}
	return map[string]any{
		"doc":  nest(depth),
		"meta": map[string]any{"title": "sdk-timing", "n": int64(breadth * depth)},
	}
}

func buildLongSessionWire(phases int) string {
	var b strings.Builder
	for i := 0; i < phases; i++ {
		fmt.Fprintf(&b, ">p%d\nn:%d\ntag:t%d\n.\n", i, i, i%7)
	}
	return b.String()
}

func splitPhases(wire string) []string {
	var chunks []string
	start := 0
	for {
		i := strings.Index(wire[start:], ".\n")
		if i < 0 {
			if start < len(wire) {
				chunks = append(chunks, wire[start:])
			}
			break
		}
		end := start + i + 2
		chunks = append(chunks, wire[start:end])
		start = end
	}
	return chunks
}

func runCheckpoint(chunks []string, hooks stream.Hooks) *stream.DotCheckpointEngine {
	if hooks.OnChunk == nil {
		hooks.OnChunk = func(any, map[string]any) {}
	}
	eng := stream.NewDotCheckpointEngine(hooks)
	for _, c := range chunks {
		_ = eng.Push(c)
	}
	eng.Finish()
	return eng
}

func bench(name string, iters, warmup int, bytes *int, note string, fn func()) row {
	for i := 0; i < warmup; i++ {
		fn()
	}
	t0 := time.Now()
	for i := 0; i < iters; i++ {
		fn()
	}
	totalMs := float64(time.Since(t0).Nanoseconds()) / 1e6
	msPerOp := totalMs / float64(iters)
	r := row{
		Name:      name,
		Iters:     iters,
		TotalMs:   totalMs,
		MsPerOp:   msPerOp,
		OpsPerSec: 0,
		Bytes:     bytes,
		Note:      note,
	}
	if msPerOp > 0 {
		r.OpsPerSec = 1000.0 / msPerOp
		if bytes != nil {
			mb := (float64(*bytes) / 1e6) / (msPerOp / 1000.0)
			r.MBPerSec = &mb
		}
	}
	return r
}

func intPtr(n int) *int { return &n }

func printTable(rows []row) {
	fmt.Printf("%-42s  %10s  %10s  %6s  %8s  %8s\n", "name", "ms/op", "ops/s", "iters", "bytes", "MB/s")
	fmt.Printf("%-42s  %10s  %10s  %6s  %8s  %8s\n", strings.Repeat("-", 42), "----------", "----------", "------", "--------", "--------")
	for _, r := range rows {
		b := "—"
		if r.Bytes != nil {
			b = fmt.Sprintf("%d", *r.Bytes)
		}
		mb := "—"
		if r.MBPerSec != nil {
			mb = fmt.Sprintf("%.2f", *r.MBPerSec)
		}
		fmt.Printf("%-42s  %10.4f  %10.1f  %6d  %8s  %8s\n", r.Name, r.MsPerOp, r.OpsPerSec, r.Iters, b, mb)
	}
}

func printDelta(current []row, baselineRows []row, meta map[string]any) map[string]int {
	baseMap := map[string]float64{}
	for _, r := range baselineRows {
		baseMap[r.Name] = r.MsPerOp
	}
	fmt.Println("\n— vs baseline (negative % = faster) —\n")
	if meta != nil {
		fmt.Printf("baseline: sdk=%v  go=%v  saved=%v\n", meta["sdk"], meta["go"], meta["savedAt"])
	}
	fmt.Printf("%-42s  %10s  %10s  %8s  %8s\n", "name", "now", "base", "Δ%", "verdict")
	faster, slower, missing := 0, 0, 0
	for _, r := range current {
		b, ok := baseMap[r.Name]
		if !ok || !(b > 0) {
			missing++
			fmt.Printf("%-42s  %10.4f  %10s  %8s  %8s\n", r.Name, r.MsPerOp, "—", "—", "new")
			continue
		}
		pct := ((r.MsPerOp - b) / b) * 100
		verdict := "≈"
		if pct <= -3 {
			verdict = "faster"
			faster++
		} else if pct >= 3 {
			verdict = "slower"
			slower++
		}
		fmt.Printf("%-42s  %10.4f  %10.4f  %+7.1f  %8s\n", r.Name, r.MsPerOp, b, pct, verdict)
	}
	fmt.Printf("\nfaster=%d  slower=%d  new/missing=%d\n", faster, slower, missing)
	return map[string]int{"faster": faster, "slower": slower, "missing": missing}
}

func mustEncode(v any, opts xaiop.EncodeOptions) string {
	opts.TrailingNewline = true
	if opts.KeyOrder == "" {
		opts.KeyOrder = "insertion"
	}
	w, err := xaiop.Encode(v, opts)
	if err != nil {
		panic(err)
	}
	return w
}

func main() {
	quick := flag.Bool("quick", false, "fewer iters")
	asJSON := flag.Bool("json", false, "emit JSON only")
	saveBaseline := flag.Bool("save-baseline", false, "write baseline-bench.json")
	noBaseline := flag.Bool("no-baseline", false, "skip baseline delta")
	flag.Parse()

	here, _ := os.Getwd()
	outDir := here
	if filepath.Base(here) != "go" {
		cand := filepath.Join(here, "go")
		if st, err := os.Stat(cand); err == nil && st.IsDir() {
			outDir = cand
		}
	}
	lastPath := filepath.Join(outDir, "last-bench.json")
	baselinePath := filepath.Join(outDir, "baseline-bench.json")

	iters := 120
	warmup := 15
	longPhases := 80
	if *quick {
		iters = 40
		warmup = 5
		longPhases = 24
	}
	if v := os.Getenv("BENCH_ITERS"); v != "" {
		fmt.Sscanf(v, "%d", &iters)
	}
	if v := os.Getenv("BENCH_WARMUP"); v != "" {
		fmt.Sscanf(v, "%d", &warmup)
	}
	if v := os.Getenv("BENCH_LONG_PHASES"); v != "" {
		fmt.Sscanf(v, "%d", &longPhases)
	}

	depth, breadth := 3, 8
	if *quick {
		depth, breadth = 2, 5
	}
	fixture := buildFixture(depth, breadth)
	wireNone := mustEncode(fixture, xaiop.EncodeOptions{DotPolicy: "none"})
	wirePhased := mustEncode(fixture, xaiop.EncodeOptions{DotPolicy: "perTopLevelKey"})
	wireDense := mustEncode(fixture, xaiop.EncodeOptions{DotPolicy: "perNKeys", PhaseEvery: 1})
	longWire := buildLongSessionWire(longPhases)
	longChunks := splitPhases(longWire)
	bn := len(wireNone)
	bp := len(wirePhased)
	bd := len(wireDense)
	bl := len(longWire)
	bd1 := len(d1Wire)
	bd2 := len(d2Wire)
	bloc := len(locateWire)

	extras := map[string]int{}
	var rows []row

	rows = append(rows, bench("encodeSync/none", iters, warmup, nil, "", func() {
		_ = mustEncode(fixture, xaiop.EncodeOptions{DotPolicy: "none"})
	}))
	rows = append(rows, bench("encodeSync/perTopLevelKey", iters, warmup, nil, "", func() {
		_ = mustEncode(fixture, xaiop.EncodeOptions{DotPolicy: "perTopLevelKey"})
	}))
	rows = append(rows, bench("parseSync/none-wire", iters, warmup, intPtr(bn), "", func() {
		_, _ = xaiop.Parse(wireNone)
	}))
	rows = append(rows, bench("parseSync/phased-wire", iters, warmup, intPtr(bp), "", func() {
		_, _ = xaiop.Parse(wirePhased)
	}))
	rows = append(rows, bench("parseSync+materialize/none", iters, warmup, intPtr(bn), "", func() {
		v, _ := xaiop.Parse(wireNone)
		_ = xaiop.MaterializeSnapshot(v)
	}))

	rows = append(rows, bench("checkpoint/streamOn/phased", iters, warmup, intPtr(bp), "", func() {
		runCheckpoint([]string{wirePhased}, stream.Hooks{})
	}))
	spOff := false
	rows = append(rows, bench("checkpoint/streamOff/phased", iters, warmup, intPtr(bp), "", func() {
		runCheckpoint([]string{wirePhased}, stream.Hooks{StreamProcessing: &spOff})
	}))
	rows = append(rows, bench("checkpoint/streamOn/dense", iters, warmup, intPtr(bd), "", func() {
		runCheckpoint([]string{wireDense}, stream.Hooks{})
	}))
	emitOn := true
	rows = append(rows, bench("checkpoint/emitDiffOn/dense", iters, warmup, intPtr(bd), "default Diff delivery", func() {
		runCheckpoint([]string{wireDense}, stream.Hooks{EmitDiff: &emitOn, OnChunk: func(any, map[string]any) {}})
	}))
	emitOff := false
	rows = append(rows, bench("checkpoint/emitDiffOff/dense", iters, warmup, intPtr(bd), "Commit only; onChunk optional", func() {
		runCheckpoint([]string{wireDense}, stream.Hooks{EmitDiff: &emitOff})
	}))

	mid := strings.Index(d1Wire, ".\n") + 2
	mergeFalse := false
	rows = append(rows, bench("checkpoint/D1-split/>after-dot", iters, warmup, intPtr(bd1), "Diff isolation object-root cont.", func() {
		runCheckpoint([]string{d1Wire[:mid], d1Wire[mid:]}, stream.Hooks{MergeChunkWindow: &mergeFalse})
	}))
	rows = append(rows, bench("checkpoint/D2-@/named-array", iters, warmup, intPtr(bd2), "cumulative @ Diff", func() {
		runCheckpoint([]string{d2Wire}, stream.Hooks{MergeChunkWindow: &mergeFalse})
	}))
	rows = append(rows, bench("checkpoint/locate/bang+eq", iters, warmup, intPtr(bloc), "", func() {
		runCheckpoint([]string{locateWire}, stream.Hooks{})
	}))

	longIters := iters / 4
	if longIters < 8 {
		longIters = 8
	}
	warmLong := warmup / 2
	if warmLong < 1 {
		warmLong = 1
	}
	rows = append(rows, bench("checkpoint/long/grow-buffer", longIters, warmLong, intPtr(bl), fmt.Sprintf("%d phases, no compact", longPhases), func() {
		eng := runCheckpoint(longChunks, stream.Hooks{MergeChunkWindow: &mergeFalse, EmitDiff: &emitOff})
		extras["longGrowBufferBytes"] = eng.BufferStats().Length
	}))
	rows = append(rows, bench("checkpoint/long/compact-each-phase", longIters, warmLong, intPtr(bl), fmt.Sprintf("%d phases + compactCommitted", longPhases), func() {
		eng := stream.NewDotCheckpointEngine(stream.Hooks{
			MergeChunkWindow: &mergeFalse,
			EmitDiff:         &emitOff,
			OnChunk:          func(any, map[string]any) {},
		})
		for _, c := range longChunks {
			_ = eng.Push(c)
			if !eng.BufferStats().OpenPhase {
				_, _ = eng.CompactCommitted(false)
			}
		}
		eng.Finish()
		extras["longCompactBufferBytes"] = eng.BufferStats().Length
	}))

	rows = append(rows, bench("engine/uploadJsonSync+getSync", iters, warmup, nil, "", func() {
		e := xaiop.NewEngine(false)
		id, err := e.UploadJSON(fixture, xaiop.EncodeOptions{DotPolicy: "none"})
		if err != nil {
			panic(err)
		}
		_, _ = e.Get(id)
	}))

	asyncIters := iters / 3
	if asyncIters < 10 {
		asyncIters = 10
	}
	warmAsync := warmup / 2
	if warmAsync < 1 {
		warmAsync = 1
	}
	rows = append(rows, bench("stream.send/PROMISE/phased", asyncIters, warmAsync, intPtr(bp), "PROMISE alone → engine emitDiff false", func() {
		s, err := stream.NewXaiopStream("raw://bench", stream.Options{
			Modes: []string{xaiop.StreamModePromise},
		})
		if err != nil {
			panic(err)
		}
		_ = s.Push(wirePhased)
		_ = s.Finish()
	}))
	rows = append(rows, bench("stream.send/CALLBACK+onChunk/phased", asyncIters, warmAsync, intPtr(bp), "forces phase Diff parse", func() {
		s, err := stream.NewXaiopStream("raw://bench", stream.Options{
			Modes:   []string{xaiop.StreamModeCallback},
			OnChunk: func(any, map[string]any) {},
			OnDone:  func(any) {},
		})
		if err != nil {
			panic(err)
		}
		_ = s.Push(wirePhased)
		_ = s.Finish()
	}))
	rows = append(rows, bench("stream.send/PROMISE/streamOff", asyncIters, warmAsync, intPtr(bp), "", func() {
		s, err := stream.NewXaiopStream("raw://bench", stream.Options{
			Modes:            []string{xaiop.StreamModePromise},
			StreamProcessing: &spOff,
		})
		if err != nil {
			panic(err)
		}
		_ = s.Push(wirePhased)
		_ = s.Finish()
	}))
	rows = append(rows, bench("stream.send/PROMISE/chunked-3B", asyncIters, warmAsync, intPtr(bp), "", func() {
		s, err := stream.NewXaiopStream("raw://bench", stream.Options{
			Modes: []string{xaiop.StreamModePromise},
		})
		if err != nil {
			panic(err)
		}
		for i := 0; i < len(wirePhased); i += 3 {
			end := i + 3
			if end > len(wirePhased) {
				end = len(wirePhased)
			}
			_ = s.Push(wirePhased[i:end])
		}
		_ = s.Finish()
	}))

	payload := map[string]any{
		"sdk":         xaiop.SDKVersion,
		"protocol":    xaiop.ProtocolVersion,
		"go":          runtime.Version(),
		"goos":        runtime.GOOS,
		"goarch":      runtime.GOARCH,
		"savedAt":     time.Now().UTC().Format(time.RFC3339),
		"quick":       *quick,
		"iters":       iters,
		"warmup":      warmup,
		"longPhases":  longPhases,
		"rows":        rows,
		"extras":      extras,
		"harness":     "timing/go",
		"harnessVer":  "0.2.1",
	}

	raw, _ := json.MarshalIndent(payload, "", "  ")
	_ = os.WriteFile(lastPath, raw, 0o644)

	if *saveBaseline {
		_ = os.WriteFile(baselinePath, raw, 0o644)
		fmt.Fprintf(os.Stderr, "wrote baseline → %s\n", baselinePath)
	}

	if *asJSON {
		os.Stdout.Write(raw)
		os.Stdout.Write([]byte("\n"))
		return
	}

	fmt.Printf("XAIOP Go stage timing  sdk=%s  protocol=%s  go=%s\n\n",
		xaiop.SDKVersion, xaiop.ProtocolVersion, runtime.Version())
	printTable(rows)
	if extras["longGrowBufferBytes"] > 0 {
		fmt.Printf("\nextras: longGrowBufferBytes=%d  longCompactBufferBytes=%d\n",
			extras["longGrowBufferBytes"], extras["longCompactBufferBytes"])
	}

	if !*noBaseline {
		if b, err := os.ReadFile(baselinePath); err == nil {
			var base struct {
				SDK     string         `json:"sdk"`
				Go      string         `json:"go"`
				SavedAt string         `json:"savedAt"`
				Rows    []row          `json:"rows"`
			}
			if json.Unmarshal(b, &base) == nil && len(base.Rows) > 0 {
				delta := printDelta(rows, base.Rows, map[string]any{
					"sdk": base.SDK, "go": base.Go, "savedAt": base.SavedAt,
				})
				if os.Getenv("BENCH_FAIL_SLOWER") == "1" && delta["slower"] > 0 {
					os.Exit(2)
				}
			}
		} else {
			fmt.Fprintf(os.Stderr, "\n(no baseline at %s — run with --save-baseline once)\n", baselinePath)
		}
	}
	fmt.Fprintf(os.Stderr, "\nwrote %s\n", lastPath)
}
