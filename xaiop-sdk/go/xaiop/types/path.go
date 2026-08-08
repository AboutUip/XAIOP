package types

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

func normalizeRegistryPath(path string) (string, error) {
	segs, err := parseJSONPath(path)
	if err != nil {
		return "", err
	}
	return formatJSONPath(segs), nil
}

func parseJSONPath(path string) ([]any, error) {
	path = strings.TrimSpace(path)
	if path == "" || path == "$" {
		return nil, nil
	}
	if strings.HasPrefix(path, "$.") {
		path = path[2:]
	} else if path == "$" {
		return nil, nil
	}
	var segs []any
	i := 0
	n := len(path)
	for i < n {
		if path[i] == '[' {
			i++
			start := i
			for i < n && path[i] != ']' {
				i++
			}
			if i >= n {
				return nil, fmt.Errorf("unclosed array index in path")
			}
			idxText := path[start:i]
			idx, err := strconv.Atoi(idxText)
			if err != nil {
				return nil, fmt.Errorf("invalid array index %q", idxText)
			}
			segs = append(segs, idx)
			i++
			continue
		}
		if path[i] == '.' {
			i++
			continue
		}
		start := i
		for i < n && path[i] != '.' && path[i] != '[' {
			i++
		}
		key := path[start:i]
		if key == "" {
			return nil, fmt.Errorf("empty path segment")
		}
		segs = append(segs, key)
	}
	return segs, nil
}

func formatJSONPath(segs []any) string {
	if len(segs) == 0 {
		return ""
	}
	var b strings.Builder
	for _, seg := range segs {
		switch v := seg.(type) {
		case int:
			b.WriteByte('[')
			b.WriteString(strconv.Itoa(v))
			b.WriteByte(']')
		case int64:
			b.WriteByte('[')
			b.WriteString(strconv.FormatInt(v, 10))
			b.WriteByte(']')
		case string:
			if needsBracketKey(v) {
				if b.Len() > 0 {
					// keep as .key when possible; else bracket
				}
			}
			if b.Len() > 0 && !strings.HasSuffix(b.String(), "]") {
				// previous was key
			}
			if b.Len() == 0 {
				b.WriteString(v)
			} else {
				last := b.String()
				if strings.HasSuffix(last, "]") {
					b.WriteByte('.')
					b.WriteString(v)
				} else {
					b.WriteByte('.')
					b.WriteString(v)
				}
			}
		default:
			b.WriteString(fmt.Sprint(v))
		}
	}
	return b.String()
}

func needsBracketKey(s string) bool {
	if s == "" {
		return true
	}
	for _, r := range s {
		if !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '$') {
			return true
		}
	}
	return false
}
