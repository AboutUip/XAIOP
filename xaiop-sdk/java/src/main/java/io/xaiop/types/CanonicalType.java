package io.xaiop.types;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Canonical type descriptor: leaf ({@code int}/{@code float}/…), structural ({@code object}/
 * {@code array}), or meta ({@code any}).
 */
public final class CanonicalType {
  private final TypeKind kind;
  /** Present only for object shapes with field constraints; insertion-ordered. */
  private final LinkedHashMap<String, CanonicalType> fields;
  /** Present only for array shapes with a homogeneous element type. */
  private final CanonicalType element;

  private CanonicalType(
      TypeKind kind, LinkedHashMap<String, CanonicalType> fields, CanonicalType element) {
    this.kind = Objects.requireNonNull(kind, "kind");
    this.fields = fields;
    this.element = element;
  }

  public static CanonicalType of(TypeKind kind) {
    return new CanonicalType(kind, null, null);
  }

  public static CanonicalType object(LinkedHashMap<String, CanonicalType> fields) {
    return new CanonicalType(TypeKind.OBJECT, fields, null);
  }

  public static CanonicalType array(CanonicalType element) {
    return new CanonicalType(TypeKind.ARRAY, null, element);
  }

  public TypeKind kind() {
    return kind;
  }

  /** @return field map or {@code null} when unconstrained / not an object shape. */
  public LinkedHashMap<String, CanonicalType> fields() {
    return fields;
  }

  /** @return element type or {@code null} when unconstrained / not an array shape. */
  public CanonicalType element() {
    return element;
  }

  /** Deep-clone for snapshots / registry immutability. */
  public CanonicalType cloneType() {
    if (kind == TypeKind.OBJECT && fields != null) {
      LinkedHashMap<String, CanonicalType> copy = new LinkedHashMap<>();
      for (Map.Entry<String, CanonicalType> e : fields.entrySet()) {
        copy.put(e.getKey(), e.getValue().cloneType());
      }
      return object(copy);
    }
    if (kind == TypeKind.ARRAY && element != null) {
      return array(element.cloneType());
    }
    return of(kind);
  }

  /** JSON-compatible tree for control-frame bodies. */
  public LinkedHashMap<String, Object> toJsonTree() {
    LinkedHashMap<String, Object> out = new LinkedHashMap<>();
    out.put("kind", kind.wire());
    if (kind == TypeKind.OBJECT && fields != null) {
      LinkedHashMap<String, Object> f = new LinkedHashMap<>();
      for (Map.Entry<String, CanonicalType> e : fields.entrySet()) {
        f.put(e.getKey(), e.getValue().toJsonTree());
      }
      out.put("fields", f);
    }
    if (kind == TypeKind.ARRAY && element != null) {
      out.put("element", element.toJsonTree());
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  static CanonicalType fromJsonTree(Object raw) {
    if (!(raw instanceof Map<?, ?> map)) {
      throw new IllegalArgumentException("invalid type schema entry type");
    }
    Object kindObj = map.get("kind");
    if (!(kindObj instanceof String kindStr)) {
      throw new IllegalArgumentException("type object must have a kind");
    }
    TypeKind kind = TypeKind.fromWire(kindStr);
    if (kind == null) {
      throw new IllegalArgumentException("unknown type kind: " + kindStr);
    }
    switch (kind) {
      case INT:
      case FLOAT:
      case BOOL:
      case STRING:
      case NULL:
      case ANY:
        return of(kind);
      case OBJECT:
        {
          Object fieldsObj = map.get("fields");
          if (fieldsObj == null) return of(TypeKind.OBJECT);
          if (!(fieldsObj instanceof Map<?, ?> fm)) {
            throw new IllegalArgumentException("objectType(fields) requires a plain object");
          }
          LinkedHashMap<String, CanonicalType> fields = new LinkedHashMap<>();
          for (Map.Entry<?, ?> e : fm.entrySet()) {
            String k = String.valueOf(e.getKey());
            if (k.isEmpty()) {
              throw new IllegalArgumentException("objectType field names must be non-empty strings");
            }
            fields.put(k, fromJsonTree(e.getValue()));
          }
          return object(fields);
        }
      case ARRAY:
        {
          Object el = map.get("element");
          if (el == null) return of(TypeKind.ARRAY);
          return array(fromJsonTree(el));
        }
      default:
        throw new IllegalArgumentException("unknown type kind: " + kindStr);
    }
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof CanonicalType other)) return false;
    return kind == other.kind
        && Objects.equals(fields, other.fields)
        && Objects.equals(element, other.element);
  }

  @Override
  public int hashCode() {
    return Objects.hash(kind, fields, element);
  }

  @Override
  public String toString() {
    return Types.typeToString(this);
  }
}
