package io.xaiop.types;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Versioned type-schema snapshot ({@code version: 1}). */
public final class TypeSchemaSnapshot {
  private final int version;
  private final List<TypeEntry> entries;

  public TypeSchemaSnapshot(int version, List<TypeEntry> entries) {
    this.version = version;
    this.entries = List.copyOf(Objects.requireNonNull(entries, "entries"));
  }

  public int version() {
    return version;
  }

  public List<TypeEntry> entries() {
    return entries;
  }

  /** Mutable JSON tree for {@link io.xaiop.Json#stringify(Object)}. */
  public java.util.LinkedHashMap<String, Object> toJsonTree() {
    java.util.LinkedHashMap<String, Object> out = new java.util.LinkedHashMap<>();
    out.put("version", version);
    ArrayList<Object> list = new ArrayList<>(entries.size());
    for (TypeEntry e : entries) {
      java.util.LinkedHashMap<String, Object> row = new java.util.LinkedHashMap<>();
      row.put("path", e.path());
      row.put("type", e.type().toJsonTree());
      row.put("polarity", e.polarity().wire());
      list.add(row);
    }
    out.put("entries", list);
    return out;
  }
}
