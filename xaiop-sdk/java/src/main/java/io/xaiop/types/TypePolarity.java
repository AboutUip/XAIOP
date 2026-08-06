package io.xaiop.types;

/** Registry polarity: allow (whitelist) or deny (blacklist). */
public enum TypePolarity {
  ALLOW("allow"),
  DENY("deny");

  private final String wire;

  TypePolarity(String wire) {
    this.wire = wire;
  }

  public String wire() {
    return wire;
  }

  public static TypePolarity fromWire(String s) {
    if ("deny".equals(s)) return DENY;
    return ALLOW;
  }
}
