package io.xaiop;

/**
 * XAIOP Java SDK entry (v0.1.0 Frozen).
 * Parser and streaming APIs will be added here.
 */
public final class Xaiop {
  public static final String PROTOCOL_VERSION = "0.1.0";

  private Xaiop() {}

  /**
   * Placeholder parse entry. Not yet implemented.
   *
   * @param source XAIOP text
   * @return parsed value (object / array / scalar tree)
   */
  public static Object parse(String source) {
    throw new UnsupportedOperationException("XAIOP parser not implemented yet");
  }
}
