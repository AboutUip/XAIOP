package xaiop

import (
	"encoding/json"
	"fmt"
	"testing"
)

// Shared nested fixture for Parse vs JSON gates (depth/breadth like timing harness).
func benchFixture(depth, breadth int) map[string]any {
	var nest func(level int) map[string]any
	nest = func(level int) map[string]any {
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

func mustBenchWire(depth, breadth int) (jsonBytes []byte, xaiopWire string) {
	fix := benchFixture(depth, breadth)
	jb, err := json.Marshal(fix)
	if err != nil {
		panic(err)
	}
	wire, err := Encode(fix, EncodeOptions{DotPolicy: "none", TrailingNewline: true, KeyOrder: "insertion"})
	if err != nil {
		panic(err)
	}
	return jb, wire
}

func BenchmarkParseVsJSON(b *testing.B) {
	jsonBytes, wire := mustBenchWire(3, 8)
	b.ReportAllocs()

	b.Run("encoding_json_Unmarshal", func(b *testing.B) {
		b.SetBytes(int64(len(jsonBytes)))
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			var out any
			if err := json.Unmarshal(jsonBytes, &out); err != nil {
				b.Fatal(err)
			}
		}
	})

	b.Run("xaiop_Parse", func(b *testing.B) {
		b.SetBytes(int64(len(wire)))
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			if _, err := Parse(wire); err != nil {
				b.Fatal(err)
			}
		}
	})
}

func BenchmarkParseVsJSONQuick(b *testing.B) {
	jsonBytes, wire := mustBenchWire(2, 5)
	b.ReportAllocs()

	b.Run("encoding_json_Unmarshal", func(b *testing.B) {
		b.SetBytes(int64(len(jsonBytes)))
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			var out any
			if err := json.Unmarshal(jsonBytes, &out); err != nil {
				b.Fatal(err)
			}
		}
	})

	b.Run("xaiop_Parse", func(b *testing.B) {
		b.SetBytes(int64(len(wire)))
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			if _, err := Parse(wire); err != nil {
				b.Fatal(err)
			}
		}
	})
}
