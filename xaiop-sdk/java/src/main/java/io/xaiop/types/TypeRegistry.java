package io.xaiop.types;

import io.xaiop.Encode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Immutable path → type registry (server).
 *
 * <p>Faithful port of {@code TypeRegistry} from the Node.js SDK's {@code types.js}.
 */
public final class TypeRegistry {
  private final LinkedHashMap<String, TypeEntry> entries = new LinkedHashMap<>();

  public int size() {
    return entries.size();
  }

  /**
   * @param polarity {@link TypePolarity#ALLOW} when {@code null}
   * @return {@code false} if path already registered
   */
  public boolean register(String path, Object typeInput, TypePolarity polarity) {
    String canonPath = normalizeRegistryPath(path);
    if (entries.containsKey(canonPath)) return false;
    TypePolarity pol = polarity == TypePolarity.DENY ? TypePolarity.DENY : TypePolarity.ALLOW;
    CanonicalType type = Types.canonicalizeType(typeInput);
    if (pol == TypePolarity.DENY && type.kind() == TypeKind.ANY) {
      throw new IllegalArgumentException("cannot register deny polarity for type any");
    }
    entries.put(canonPath, new TypeEntry(canonPath, type.cloneType(), pol));
    return true;
  }

  public boolean register(String path, Object typeInput) {
    return register(path, typeInput, TypePolarity.ALLOW);
  }

  /**
   * Register many path/type pairs from a map (same polarity for all) or a list of {@code [path,
   * type]} / {@link TypeEntry}.
   *
   * @return {@code ok} / {@code rejected} normalized paths
   */
  public RegisterManyResult registerMany(Object map, TypePolarity polarity) {
    ArrayList<String> ok = new ArrayList<>();
    ArrayList<String> rejected = new ArrayList<>();
    if (map instanceof Map<?, ?> m && !(map instanceof List)) {
      for (Map.Entry<?, ?> e : m.entrySet()) {
        String path = String.valueOf(e.getKey());
        if (register(path, e.getValue(), polarity)) ok.add(normalizeRegistryPath(path));
        else rejected.add(normalizeRegistryPath(path));
      }
      return new RegisterManyResult(ok, rejected);
    }
    if (!(map instanceof Iterable<?> iterable)) {
      throw new IllegalArgumentException("registerMany requires a Map or Iterable");
    }
    for (Object item : iterable) {
      if (item instanceof List<?> pair && pair.size() >= 2) {
        String path = String.valueOf(pair.get(0));
        if (register(path, pair.get(1), polarity)) ok.add(normalizeRegistryPath(path));
        else rejected.add(normalizeRegistryPath(path));
      } else if (item instanceof Object[] arr && arr.length >= 2) {
        String path = String.valueOf(arr[0]);
        if (register(path, arr[1], polarity)) ok.add(normalizeRegistryPath(path));
        else rejected.add(normalizeRegistryPath(path));
      } else if (item instanceof TypeEntry entry) {
        // Node: item.polarity === "deny" ? "deny" : options.polarity
        TypePolarity pol =
            entry.polarity() == TypePolarity.DENY ? TypePolarity.DENY : polarity;
        if (register(entry.path(), entry.type(), pol)) {
          ok.add(normalizeRegistryPath(entry.path()));
        } else rejected.add(normalizeRegistryPath(entry.path()));
      } else if (item instanceof Map<?, ?> em && em.get("path") != null) {
        TypePolarity pol =
            "deny".equals(String.valueOf(em.get("polarity")))
                ? TypePolarity.DENY
                : polarity;
        String path = String.valueOf(em.get("path"));
        if (register(path, em.get("type"), pol)) ok.add(normalizeRegistryPath(path));
        else rejected.add(normalizeRegistryPath(path));
      } else {
        throw new IllegalArgumentException("registerMany item must be [path, type] or TypeEntry");
      }
    }
    return new RegisterManyResult(ok, rejected);
  }

  public RegisterManyResult registerMany(Object map) {
    return registerMany(map, TypePolarity.ALLOW);
  }

  public boolean has(String path) {
    return entries.containsKey(normalizeRegistryPath(path));
  }

  public TypeEntry get(String path) {
    return entries.get(normalizeRegistryPath(path));
  }

  public List<TypeEntry> list() {
    ArrayList<TypeEntry> out = new ArrayList<>(entries.size());
    for (TypeEntry e : entries.values()) {
      out.add(new TypeEntry(e.path(), e.type().cloneType(), e.polarity()));
    }
    return out;
  }

  public TypeSchemaSnapshot snapshot() {
    return new TypeSchemaSnapshot(1, list());
  }

  public static TypeRegistry fromSnapshot(Object snap) {
    TypeRegistry reg = new TypeRegistry();
    if (snap instanceof TypeRegistry other) {
      for (TypeEntry e : other.list()) {
        if (!reg.register(e.path(), e.type(), e.polarity())) {
          throw new XaiopTypeError("duplicate path in schema: " + e.path(), e.path());
        }
      }
      return reg;
    }
    if (snap instanceof TypeSchemaSnapshot schema) {
      if (schema.version() != 1) {
        throw new IllegalArgumentException("invalid type schema snapshot");
      }
      for (TypeEntry e : schema.entries()) {
        if (e == null || e.path() == null) {
          throw new IllegalArgumentException("invalid type schema entry");
        }
        if (!reg.register(e.path(), e.type(), e.polarity())) {
          throw new XaiopTypeError("duplicate path in schema: " + e.path(), e.path());
        }
      }
      return reg;
    }
    if (snap instanceof Map<?, ?> map) {
      Object version = map.get("version");
      Object entriesObj = map.get("entries");
      int ver =
          version instanceof Number n ? n.intValue() : -1;
      if (ver != 1 || !(entriesObj instanceof List<?>)) {
        throw new IllegalArgumentException("invalid type schema snapshot");
      }
      for (Object row : (List<?>) entriesObj) {
        if (!(row instanceof Map<?, ?> em) || !(em.get("path") instanceof String)) {
          throw new IllegalArgumentException("invalid type schema entry");
        }
        String path = (String) em.get("path");
        TypePolarity polarity = TypePolarity.fromWire(String.valueOf(em.get("polarity")));
        if (!reg.register(path, em.get("type"), polarity)) {
          throw new XaiopTypeError("duplicate path in schema: " + path, path);
        }
      }
      return reg;
    }
    throw new IllegalArgumentException("invalid type schema snapshot");
  }

  static String normalizeRegistryPath(String path) {
    return Encode.formatJsonPath(Encode.parseJsonPath(path));
  }

  /** Result of {@link #registerMany(Object, TypePolarity)}. */
  public static final class RegisterManyResult {
    private final List<String> ok;
    private final List<String> rejected;

    public RegisterManyResult(List<String> ok, List<String> rejected) {
      this.ok = List.copyOf(ok);
      this.rejected = List.copyOf(rejected);
    }

    public List<String> ok() {
      return ok;
    }

    public List<String> rejected() {
      return rejected;
    }
  }
}
