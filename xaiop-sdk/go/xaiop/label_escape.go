package xaiop

// LabelEscapeIntroducer is U+001F for symbol-key mode.
const LabelEscapeIntroducer = "\u001f"

// KeyNeedsSymbolEscape reports whether a JSON key must be escaped on the wire
// when symbolKeys is enabled (operator-headed or introducer-headed keys).
func KeyNeedsSymbolEscape(key string) bool {
	if key == "" {
		return false
	}
	c := key[0]
	return c == 0x1F || c == '#' || c == '@' || c == '>' || c == '<' || c == '=' || c == '!' || c == '&' || c == '?'
}

// EncodeWireLabel escapes a key for the wire when symbolKeys is on.
func EncodeWireLabel(key string, symbolKeys bool) string {
	if symbolKeys && KeyNeedsSymbolEscape(key) {
		return LabelEscapeIntroducer + key
	}
	return key
}

// DecodeWireLabel strips the U+001F introducer when symbolKeys is on.
func DecodeWireLabel(wireLabel string, symbolKeys bool) string {
	if symbolKeys && len(wireLabel) > 0 && wireLabel[0] == 0x1F {
		return wireLabel[1:]
	}
	return wireLabel
}
