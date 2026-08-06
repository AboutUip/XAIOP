package io.xaiop.types;

import java.util.Objects;

/** One registry entry: JSON path → canonical type + polarity. */
public final class TypeEntry {
  private final String path;
  private final CanonicalType type;
  private final TypePolarity polarity;

  public TypeEntry(String path, CanonicalType type, TypePolarity polarity) {
    this.path = Objects.requireNonNull(path, "path");
    this.type = Objects.requireNonNull(type, "type");
    this.polarity = polarity == null ? TypePolarity.ALLOW : polarity;
  }

  public String path() {
    return path;
  }

  public CanonicalType type() {
    return type;
  }

  public TypePolarity polarity() {
    return polarity;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof TypeEntry other)) return false;
    return path.equals(other.path)
        && type.equals(other.type)
        && polarity == other.polarity;
  }

  @Override
  public int hashCode() {
    return Objects.hash(path, type, polarity);
  }
}
