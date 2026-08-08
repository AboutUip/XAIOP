// Fair Parse vs encoding/json wall-clock for the JSON gate (paired with json_gate.mjs).
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
)

func nest(level, breadth int) map[string]any {
	o := make(map[string]any, breadth+1)
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
			o[k] = nest(level-1, breadth)
		}
	}
	arr := make([]any, breadth)
	for j := 0; j < breadth; j++ {
		arr[j] = map[string]any{"id": int64(j), "tag": fmt.Sprintf("t%d", j)}
	}
	o["arr"] = arr
	return o
}

func timeLoop(iters int, fn func()) float64 {
	t0 := time.Now()
	for i := 0; i < iters; i++ {
		fn()
	}
	return float64(time.Since(t0).Nanoseconds()) / float64(iters)
}

func bestOf(rounds, iters int, fn func()) float64 {
	best := timeLoop(iters, fn)
	for r := 1; r < rounds; r++ {
		ns := timeLoop(iters, fn)
		if ns < best {
			best = ns
		}
	}
	return best
}

func main() {
	quick := flag.Bool("quick", false, "smaller fixture")
	itersF := flag.Int("iters", 0, "iterations (0 = default)")
	warmupF := flag.Int("warmup", 0, "warmup (0 = default)")
	flag.Parse()

	depth, breadth := 3, 8
	iters, warmup := 400, 40
	if *quick {
		depth, breadth = 2, 5
		iters, warmup = 200, 20
	}
	if *itersF > 0 {
		iters = *itersF
	}
	if *warmupF > 0 {
		warmup = *warmupF
	}

	fix := map[string]any{
		"doc":  nest(depth, breadth),
		"meta": map[string]any{"title": "sdk-timing", "n": int64(breadth * depth)},
	}
	jb, err := json.Marshal(fix)
	if err != nil {
		panic(err)
	}
	wire, err := xaiop.Encode(fix, xaiop.EncodeOptions{
		DotPolicy: "none", TrailingNewline: true, KeyOrder: "insertion",
	})
	if err != nil {
		panic(err)
	}

	for i := 0; i < warmup; i++ {
		var out any
		_ = json.Unmarshal(jb, &out)
		_, _ = xaiop.Parse(wire)
	}

	runtime.GC()
	parseNs := bestOf(3, iters, func() {
		if _, err := xaiop.Parse(wire); err != nil {
			panic(err)
		}
	})
	jsonNs := bestOf(3, iters, func() {
		var out any
		if err := json.Unmarshal(jb, &out); err != nil {
			panic(err)
		}
	})

	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
		"depth":          depth,
		"breadth":        breadth,
		"iters":          iters,
		"warmup":         warmup,
		"jsonBytes":      len(jb),
		"wireBytes":      len(wire),
		"goJsonNsPerOp":  jsonNs,
		"goParseNsPerOp": parseNs,
		"sdk":            xaiop.SDKVersion,
	})
}
