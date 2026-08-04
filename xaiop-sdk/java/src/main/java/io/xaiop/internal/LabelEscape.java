package io.xaiop.internal;

/**
 * Symbol-key mode: Content / Cursor labels that would collide with line-start operators are
 * escaped on the wire with U+001F (UNIT SEPARATOR) as introducer.
 *
 * <p>Default ({@code symbolKeys} off): keys MUST NOT begin with an operator head or U+001F. On:
 * encoder prefixes one U+001F; parser strips one layer. Double-escape: a logical key that already
 * begins with U+001F gets another prefix.
 *
 * <p>True {@code #…} custom-annotation lines are unrelated (standalone wire lines).
 */
public final class LabelEscape {
  /** Label escape introducer — U+001F UNIT SEPARATOR. */
  public static final String INTRODUCER = "\u001f";

  private LabelEscape() {}

  /**
   * First-character set that would change line class if used as a bare Content / {@code >name}
   * label head (plus the reserved introducer itself). {@code .} alone is a reset line; keys like
   * {@code .k} remain unescaped / allowed.
   */
  public static boolean keyNeedsSymbolEscape(String key) {
    if (key == null || key.isEmpty()) return false;
    char c = key.charAt(0);
    return c == '\u001f'
        || c == '#'
        || c == '@'
        || c == '>'
        || c == '<'
        || c == '='
        || c == '!'
        || c == '&';
  }

  /** @return label text for the wire (no leading Cursor op) */
  public static String encodeWireLabel(String key, boolean symbolKeys) {
    if (symbolKeys && keyNeedsSymbolEscape(key)) {
      return INTRODUCER + key;
    }
    return key;
  }

  /** @return logical JSON key */
  public static String decodeWireLabel(String wireLabel, boolean symbolKeys) {
    if (symbolKeys
        && wireLabel != null
        && !wireLabel.isEmpty()
        && wireLabel.charAt(0) == '\u001f') {
      return wireLabel.substring(1);
    }
    return wireLabel;
  }
}
