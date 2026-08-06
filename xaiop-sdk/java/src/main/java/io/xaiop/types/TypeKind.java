package io.xaiop.types;

/** Canonical leaf / structural / meta type kinds (PROT-CONTENT aligned). */
public enum TypeKind {
  INT("int"),
  FLOAT("float"),
  BOOL("bool"),
  STRING("string"),
  NULL("null"),
  OBJECT("object"),
  ARRAY("array"),
  ANY("any");

  private final String wire;

  TypeKind(String wire) {
    this.wire = wire;
  }

  /** Surface / wire name ({@code "int"}, {@code "array"}, …). */
  public String wire() {
    return wire;
  }

  public static TypeKind fromWire(String name) {
    if (name == null) return null;
    for (TypeKind k : values()) {
      if (k.wire.equals(name)) return k;
    }
    return null;
  }
}
