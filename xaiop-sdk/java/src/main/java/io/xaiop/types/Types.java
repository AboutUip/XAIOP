package io.xaiop.types;

import io.xaiop.Json;
import io.xaiop.XaiopFragment;
import io.xaiop.control.ControlFrames;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * XAIOP SDK type registry / freeze checking (not protocol wire).
 *
 * <p>Faithful port of the Node.js SDK's {@code types.js}. Canonical leaf kinds align with
 * PROT-CONTENT: int, float, bool, null, string. Structural: object, array. Meta: any.
 */
public final class Types {
  /** Header + LF; body follows on the next line (see Control Root / {@link #encodeTypeSchemaFrame}). */
  public static final String TYPE_SCHEMA_FRAME_PREFIX = "#!xaiop/types/v1\n";

  /** Base type constants (canonical). */
  public static final class TYPE {
    public static final CanonicalType INT = CanonicalType.of(TypeKind.INT);
    public static final CanonicalType FLOAT = CanonicalType.of(TypeKind.FLOAT);
    public static final CanonicalType BOOL = CanonicalType.of(TypeKind.BOOL);
    public static final CanonicalType STRING = CanonicalType.of(TypeKind.STRING);
    public static final CanonicalType NULL = CanonicalType.of(TypeKind.NULL);
    public static final CanonicalType OBJECT = CanonicalType.of(TypeKind.OBJECT);
    public static final CanonicalType ARRAY = CanonicalType.of(TypeKind.ARRAY);
    public static final CanonicalType ANY = CanonicalType.of(TypeKind.ANY);

    private TYPE() {}
  }

  private static final long MAX_SAFE_INTEGER = 9007199254740991L;

  private Types() {}

  /** Builds {@code object&lt;k:t,…&gt;} from a field map (values are type inputs). */
  public static CanonicalType objectType(Map<String, ?> fields) {
    if (fields == null || fields instanceof List) {
      throw new IllegalArgumentException("objectType(fields) requires a plain object");
    }
    LinkedHashMap<String, CanonicalType> out = new LinkedHashMap<>();
    for (Map.Entry<String, ?> e : fields.entrySet()) {
      String k = e.getKey();
      if (k == null || k.isEmpty()) {
        throw new IllegalArgumentException("objectType field names must be non-empty strings");
      }
      out.put(k, canonicalizeType(e.getValue()));
    }
    return CanonicalType.object(out);
  }

  /** Builds {@code array&lt;element&gt;}. */
  public static CanonicalType arrayType(Object element) {
    return CanonicalType.array(canonicalizeType(element));
  }

  /**
   * Normalize user input (constant, builder, or surface string) → canonical.
   */
  public static CanonicalType canonicalizeType(Object input) {
    if (input == null) {
      throw new IllegalArgumentException("type is required");
    }
    if (input instanceof String s) {
      return parseTypeSurface(s.trim());
    }
    if (input instanceof CanonicalType ct) {
      return canonicalizeType(ct.toJsonTree());
    }
    if (input instanceof Map<?, ?> map) {
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
          return CanonicalType.of(kind);
        case OBJECT:
          {
            Object fields = map.get("fields");
            if (fields == null) return CanonicalType.of(TypeKind.OBJECT);
            if (!(fields instanceof Map<?, ?>)) {
              throw new IllegalArgumentException("objectType(fields) requires a plain object");
            }
            @SuppressWarnings("unchecked")
            Map<String, ?> fm = (Map<String, ?>) fields;
            return objectType(fm);
          }
        case ARRAY:
          {
            Object element = map.get("element");
            if (element == null) return CanonicalType.of(TypeKind.ARRAY);
            return CanonicalType.array(canonicalizeType(element));
          }
        default:
          throw new IllegalArgumentException("unknown type kind: " + kindStr);
      }
    }
    throw new IllegalArgumentException("invalid type: " + input.getClass().getSimpleName());
  }

  /**
   * Surface string: {@code string} | {@code array&lt;int&gt;} | {@code object&lt;name:string,old:int&gt;}.
   */
  public static CanonicalType parseTypeSurface(String text) {
    if (text == null || text.isEmpty()) {
      throw new IllegalArgumentException("type surface must be a non-empty string");
    }
    ParseResult r = parseTypeExpr(text, 0);
    if (r.next != text.length()) {
      throw new IllegalArgumentException(
          "unexpected trailing type syntax: " + Json.stringify(text.substring(r.next)));
    }
    return r.type;
  }

  private static final class ParseResult {
    final CanonicalType type;
    final int next;

    ParseResult(CanonicalType type, int next) {
      this.type = type;
      this.next = next;
    }
  }

  private static ParseResult parseTypeExpr(String s, int i) {
    i = skipWs(s, i);
    int start = i;
    while (i < s.length() && isTypeNameChar(s.charAt(i))) i++;
    if (i == start) {
      throw new IllegalArgumentException(
          "expected type name at " + Json.stringify(s.substring(i)));
    }
    String name = s.substring(start, i).toLowerCase();
    i = skipWs(s, i);
    if (i < s.length() && s.charAt(i) == '<') {
      i++;
      if ("array".equals(name)) {
        ParseResult inner = parseTypeExpr(s, i);
        i = skipWs(s, inner.next);
        if (i >= s.length() || s.charAt(i) != '>') {
          throw new IllegalArgumentException("array<...> missing '>'");
        }
        return new ParseResult(CanonicalType.array(inner.type), i + 1);
      }
      if ("object".equals(name)) {
        LinkedHashMap<String, CanonicalType> fields = new LinkedHashMap<>();
        i = skipWs(s, i);
        if (i < s.length() && s.charAt(i) == '>') {
          return new ParseResult(CanonicalType.of(TypeKind.OBJECT), i + 1);
        }
        while (true) {
          i = skipWs(s, i);
          int keyStart = i;
          while (i < s.length() && isFieldNameChar(s.charAt(i))) i++;
          if (i == keyStart) {
            throw new IllegalArgumentException("object field name expected");
          }
          String key = s.substring(keyStart, i);
          i = skipWs(s, i);
          if (i >= s.length() || s.charAt(i) != ':') {
            throw new IllegalArgumentException("object field " + key + " missing ':'");
          }
          i++;
          ParseResult val = parseTypeExpr(s, i);
          fields.put(key, val.type);
          i = skipWs(s, val.next);
          if (i < s.length() && s.charAt(i) == ',') {
            i++;
            continue;
          }
          if (i < s.length() && s.charAt(i) == '>') {
            return new ParseResult(CanonicalType.object(fields), i + 1);
          }
          throw new IllegalArgumentException("object<...> expected ',' or '>'");
        }
      }
      throw new IllegalArgumentException("type " + name + " does not take parameters");
    }
    TypeKind kind = TypeKind.fromWire(name);
    if (kind == null) {
      throw new IllegalArgumentException("unknown type name: " + name);
    }
    return new ParseResult(CanonicalType.of(kind), i);
  }

  private static boolean isTypeNameChar(char c) {
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_';
  }

  private static boolean isFieldNameChar(char c) {
    return isTypeNameChar(c) || (c >= '0' && c <= '9');
  }

  private static int skipWs(String s, int i) {
    while (i < s.length() && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
    return i;
  }

  /** Classify a runtime JSON value into a canonical type (observation / freeze). */
  public static CanonicalType classifyValue(Object value) {
    if (value == null) return TYPE.NULL;
    if (value instanceof Boolean) return TYPE.BOOL;
    if (value instanceof Number n) {
      if (!isFiniteNumber(n)) {
        throw new XaiopTypeError("non-finite number cannot be typed (" + n + ")");
      }
      if (isSafeIntegerNumber(n)) return TYPE.INT;
      return TYPE.FLOAT;
    }
    if (value instanceof String) return TYPE.STRING;
    if (value instanceof List<?> list) {
      CanonicalType element = null;
      for (Object el : list) {
        if (el == null) continue;
        CanonicalType t = classifyValue(el);
        CanonicalType leaf = stripShape(t);
        if (element == null) element = leaf;
        else if (!typeCompatible(element, leaf)) {
          throw new XaiopTypeError(
              "array elements must share one type", null, element, leaf, null);
        }
      }
      return element != null ? CanonicalType.array(element) : TYPE.ARRAY;
    }
    if (value instanceof Map<?, ?> || value instanceof XaiopFragment) {
      return TYPE.OBJECT;
    }
    throw new XaiopTypeError("unsupported runtime type: " + value.getClass().getSimpleName());
  }

  static CanonicalType stripShape(CanonicalType t) {
    if (t.kind() == TypeKind.OBJECT) return TYPE.OBJECT;
    if (t.kind() == TypeKind.ARRAY) {
      return t.element() != null
          ? CanonicalType.array(stripShape(t.element()))
          : TYPE.ARRAY;
    }
    return CanonicalType.of(t.kind());
  }

  /** Whether a value satisfies an expected type (allow-match). */
  public static boolean valueMatchesType(Object value, CanonicalType expected) {
    if (expected.kind() == TypeKind.ANY) return true;
    if (value == null) return expected.kind() == TypeKind.NULL;
    if (expected.kind() == TypeKind.NULL) return false;

    if (expected.kind() == TypeKind.BOOL) return value instanceof Boolean;
    if (expected.kind() == TypeKind.STRING) return value instanceof String;
    if (expected.kind() == TypeKind.INT) {
      return value instanceof Number n && isFiniteNumber(n) && isSafeIntegerNumber(n);
    }
    if (expected.kind() == TypeKind.FLOAT) {
      return value instanceof Number n
          && isFiniteNumber(n)
          && !(isSafeIntegerNumber(n));
    }
    if (expected.kind() == TypeKind.OBJECT) {
      if (value instanceof List) return false;
      Map<?, ?> map;
      if (value instanceof XaiopFragment frag) {
        map = frag.getEntries();
      } else if (value instanceof Map<?, ?> m) {
        map = m;
      } else {
        return false;
      }
      if (expected.fields() != null) {
        for (Map.Entry<String, CanonicalType> e : expected.fields().entrySet()) {
          String k = e.getKey();
          CanonicalType ft = e.getValue();
          if (!map.containsKey(k)) {
            if (ft.kind() == TypeKind.ANY) continue;
            return false;
          }
          Object child = map.get(k);
          if (child == null && ft.kind() != TypeKind.NULL && ft.kind() != TypeKind.ANY) {
            if (!valueMatchesType(null, ft)) return false;
            continue;
          }
          if (!valueMatchesType(child, ft)) return false;
        }
      }
      return true;
    }
    if (expected.kind() == TypeKind.ARRAY) {
      if (!(value instanceof List<?> list)) return false;
      if (expected.element() == null) return true;
      for (Object el : list) {
        if (el == null
            && expected.element().kind() != TypeKind.NULL
            && expected.element().kind() != TypeKind.ANY) {
          if (!valueMatchesType(null, expected.element())) return false;
          continue;
        }
        if (!valueMatchesType(el, expected.element())) return false;
      }
      return true;
    }
    return false;
  }

  /** Soft compatibility for freeze (object/object, array/array±element). */
  public static boolean typeCompatible(CanonicalType a, CanonicalType b) {
    if (a == null || b == null) return false;
    if (a.kind() == TypeKind.ANY || b.kind() == TypeKind.ANY) return true;
    if (a.kind() != b.kind()) return false;
    if (a.kind() == TypeKind.ARRAY) {
      if (a.element() == null || b.element() == null) return true;
      return typeCompatible(a.element(), b.element());
    }
    return true;
  }

  public static String typeToString(CanonicalType t) {
    if (t == null) return "?";
    if (t.kind() == TypeKind.ARRAY) {
      return t.element() != null ? "array<" + typeToString(t.element()) + ">" : "array";
    }
    if (t.kind() == TypeKind.OBJECT && t.fields() != null) {
      StringBuilder sb = new StringBuilder("object<");
      boolean first = true;
      for (Map.Entry<String, CanonicalType> e : t.fields().entrySet()) {
        if (!first) sb.append(',');
        first = false;
        sb.append(e.getKey()).append(':').append(typeToString(e.getValue()));
      }
      sb.append('>');
      return sb.toString();
    }
    return t.kind().wire();
  }

  public static CanonicalType cloneType(CanonicalType t) {
    return t.cloneType();
  }

  /** Encode a type-schema control frame ({@code #!xaiop/types/v1} + JSON body). */
  public static String encodeTypeSchemaFrame(TypeSchemaSnapshot snapshot) {
    if (snapshot == null || snapshot.version() != 1) {
      throw new IllegalArgumentException("encodeTypeSchemaFrame requires snapshot version 1");
    }
    return ControlFrames.encodeControlFrame(
        ControlFrames.CONTROL_NS,
        ControlFrames.CONTROL_NAME.TYPES,
        1,
        snapshot.toJsonTree());
  }

  /**
   * @return snapshot, or {@code null} when {@code text} is not a types frame
   */
  @SuppressWarnings("unchecked")
  public static TypeSchemaSnapshot tryParseTypeSchemaFrame(String text) {
    if (text == null || !text.startsWith(TYPE_SCHEMA_FRAME_PREFIX)) {
      return null;
    }
    String body = text.substring(TYPE_SCHEMA_FRAME_PREFIX.length());
    // Control frames may include a trailing LF after the body line.
    if (body.endsWith("\n")) body = body.substring(0, body.length() - 1);
    if (body.endsWith("\r")) body = body.substring(0, body.length() - 1);
    Object parsed;
    try {
      parsed = Json.parse(body);
    } catch (RuntimeException e) {
      throw new XaiopTypeError("invalid type schema frame JSON");
    }
    if (!(parsed instanceof Map<?, ?> map)
        || !Integer.valueOf(1).equals(asInt(map.get("version")))
        || !(map.get("entries") instanceof List<?>)) {
      throw new XaiopTypeError("invalid type schema frame payload");
    }
    List<?> rawEntries = (List<?>) map.get("entries");
    ArrayList<TypeEntry> entries = new ArrayList<>(rawEntries.size());
    for (Object row : rawEntries) {
      if (!(row instanceof Map<?, ?> em)) {
        throw new XaiopTypeError("invalid type schema frame payload");
      }
      Object pathObj = em.get("path");
      if (!(pathObj instanceof String path)) {
        throw new IllegalArgumentException("invalid type schema entry");
      }
      CanonicalType type = CanonicalType.fromJsonTree(em.get("type"));
      TypePolarity polarity = TypePolarity.fromWire(String.valueOf(em.get("polarity")));
      entries.add(new TypeEntry(path, type, polarity));
    }
    return new TypeSchemaSnapshot(1, entries);
  }

  static Object unwrapFragment(Object value) {
    if (value instanceof XaiopFragment frag) {
      return frag.getEntries();
    }
    if (value instanceof Map<?, ?> map) {
      Object isFrag = map.get("isFragment");
      Object entries = map.get("entries");
      if (Boolean.TRUE.equals(isFrag) && entries instanceof Map<?, ?>) {
        return entries;
      }
    }
    return value;
  }

  static CanonicalType classifyValueSafe(Object v) {
    try {
      return classifyValue(v);
    } catch (RuntimeException e) {
      return TYPE.ANY;
    }
  }

  private static Integer asInt(Object v) {
    if (v instanceof Integer i) return i;
    if (v instanceof Number n) return n.intValue();
    return null;
  }

  static boolean isFiniteNumber(Number n) {
    if (n instanceof Double d) return Double.isFinite(d);
    if (n instanceof Float f) return Float.isFinite(f);
    return true; // Integer/Long/etc.
  }

  static boolean isSafeIntegerNumber(Number n) {
    if (n instanceof Double d) {
      if (!Double.isFinite(d)) return false;
      double dv = d.doubleValue();
      if (dv != Math.rint(dv)) return false;
      long asLong = (long) dv;
      return asLong == dv && Math.abs(asLong) <= MAX_SAFE_INTEGER;
    }
    if (n instanceof Float f) {
      if (!Float.isFinite(f)) return false;
      double dv = f.doubleValue();
      if (dv != Math.rint(dv)) return false;
      long asLong = (long) dv;
      return asLong == dv && Math.abs(asLong) <= MAX_SAFE_INTEGER;
    }
    if (n instanceof Long l) {
      return Math.abs(l) <= MAX_SAFE_INTEGER;
    }
    if (n instanceof Integer) return true;
    // Short/Byte etc.
    long l = n.longValue();
    return Math.abs(l) <= MAX_SAFE_INTEGER && n.doubleValue() == l;
  }
}
