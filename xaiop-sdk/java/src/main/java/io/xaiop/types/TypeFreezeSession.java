package io.xaiop.types;

import io.xaiop.Encode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/**
 * Client freeze session: first non-null observation locks type; schema optional.
 *
 * <p>Faithful port of {@code TypeFreezeSession} from the Node.js SDK's {@code types.js}.
 */
public final class TypeFreezeSession {
  private TypeRegistry schema;
  private final LinkedHashMap<String, CanonicalType> freeze = new LinkedHashMap<>();
  private List<String> escapePaths = List.of();
  private final Consumer<XaiopTypeError> onViolation;

  public TypeFreezeSession() {
    this(null, null);
  }

  public TypeFreezeSession(TypeRegistry schema) {
    this(schema, null);
  }

  public TypeFreezeSession(TypeRegistry schema, Consumer<XaiopTypeError> onViolation) {
    this.schema = schema;
    this.onViolation = onViolation;
    if (schema != null) seedFromSchema(schema);
  }

  /** @param schema registry, snapshot, or {@code null} to clear */
  public void applySchema(Object schema) {
    if (schema == null) {
      this.schema = null;
      return;
    }
    this.schema =
        schema instanceof TypeRegistry reg ? reg : TypeRegistry.fromSnapshot(schema);
    seedFromSchema(this.schema);
  }

  private void seedFromSchema(TypeRegistry reg) {
    for (TypeEntry e : reg.list()) {
      if (e.polarity() == TypePolarity.ALLOW && e.type().kind() != TypeKind.ANY) {
        if (!freeze.containsKey(e.path())) {
          freeze.put(e.path(), Types.stripShape(e.type()));
        }
      }
    }
  }

  public TypeRegistry schema() {
    return schema;
  }

  /** Live freeze map (path → locked type). */
  public Map<String, CanonicalType> freezes() {
    return freeze;
  }

  /** Clear freeze for path and descendants (after whole-node delete). */
  public void clearPath(String path) {
    String prefix = TypeRegistry.normalizeRegistryPath(path);
    ArrayList<String> keys = new ArrayList<>(freeze.keySet());
    for (String key : keys) {
      if (key.equals(prefix)
          || key.startsWith(prefix + ".")
          || key.startsWith(prefix + "[")) {
        freeze.remove(key);
      }
    }
  }

  /**
   * Observe a Diff / Snapshot tree. {@code null} leaves are skipped (no check / no freeze).
   *
   * @param shouldThrow default {@code true}
   * @param escapePaths paths (and descendants) that skip type check / freeze
   */
  public List<XaiopTypeError> observeTree(
      Object tree, boolean shouldThrow, Iterable<String> escapePaths) {
    ArrayList<XaiopTypeError> errors = new ArrayList<>();
    if (escapePaths != null) {
      ArrayList<String> eps = new ArrayList<>();
      for (String e : escapePaths) eps.add(e);
      this.escapePaths = eps;
    } else {
      this.escapePaths = List.of();
    }
    if (tree == null) return errors;
    Object root = Types.unwrapFragment(tree);
    walkObserve(root, new ArrayList<>(), errors);
    this.escapePaths = List.of();
    if (shouldThrow && !errors.isEmpty()) throw errors.get(0);
    return errors;
  }

  public List<XaiopTypeError> observeTree(Object tree, boolean shouldThrow) {
    return observeTree(tree, shouldThrow, null);
  }

  public List<XaiopTypeError> observeTree(Object tree) {
    return observeTree(tree, true, null);
  }

  /**
   * Drop freezes for paths absent from the commit tree (node removed → refresh).
   */
  public void reconcileCommit(Object commit) {
    if (commit == null) {
      freeze.clear();
      return;
    }
    Set<String> present = new LinkedHashSet<>();
    collectPaths(Types.unwrapFragment(commit), new ArrayList<>(), present);
    ArrayList<String> keys = new ArrayList<>(freeze.keySet());
    for (String key : keys) {
      if (!present.contains(key)) freeze.remove(key);
    }
  }

  private void walkObserve(Object value, List<Object> segs, List<XaiopTypeError> errors) {
    if (segs.isEmpty()) {
      if (value != null && (value instanceof Map || value instanceof List)) {
        if (value instanceof List<?> list) {
          observeArray(list, new ArrayList<>(), errors);
        } else {
          @SuppressWarnings("unchecked")
          Map<String, Object> map = (Map<String, Object>) value;
          for (String key : map.keySet()) {
            if (pathEscaped(key)) continue;
            ArrayList<Object> child = new ArrayList<>();
            child.add(key);
            walkObserve(map.get(key), child, errors);
          }
        }
      }
      return;
    }

    String path = Encode.formatJsonPath(segs);

    if (pathEscaped(path)) {
      return;
    }

    if (value == null) {
      return;
    }

    CanonicalType observed;
    try {
      observed = Types.stripShape(Types.classifyValue(value));
    } catch (RuntimeException e) {
      XaiopTypeError err =
          e instanceof XaiopTypeError te
              ? te
              : new XaiopTypeError(String.valueOf(e.getMessage()), path);
      if (err.getPath() == null) err.setPath(path);
      fail(err, errors);
      return;
    }

    TypeEntry schemaEntry = schema != null ? schema.get(path) : null;
    boolean schemaViolated = false;
    boolean schemaIgnore = false;
    if (schemaEntry != null) {
      if (schemaEntry.type().kind() == TypeKind.ANY
          && schemaEntry.polarity() == TypePolarity.ALLOW) {
        schemaIgnore = true;
      } else {
        boolean matches = Types.valueMatchesType(value, schemaEntry.type());
        if (schemaEntry.polarity() == TypePolarity.ALLOW && !matches) {
          schemaViolated = true;
          fail(
              new XaiopTypeError(
                  "type mismatch at "
                      + path
                      + ": expected "
                      + Types.typeToString(schemaEntry.type())
                      + ", got "
                      + Types.typeToString(observed),
                  path,
                  schemaEntry.type(),
                  observed,
                  TypePolarity.ALLOW),
              errors);
        } else if (schemaEntry.polarity() == TypePolarity.DENY && matches) {
          schemaViolated = true;
          fail(
              new XaiopTypeError(
                  "type denied at "
                      + path
                      + ": must not be "
                      + Types.typeToString(schemaEntry.type()),
                  path,
                  schemaEntry.type(),
                  observed,
                  TypePolarity.DENY),
              errors);
        }
      }
    }

    if (!schemaViolated && !schemaIgnore) {
      CanonicalType frozen = freeze.get(path);
      if (frozen != null) {
        if (!Types.typeCompatible(frozen, observed)) {
          fail(
              new XaiopTypeError(
                  "type freeze mismatch at "
                      + path
                      + ": expected "
                      + Types.typeToString(frozen)
                      + ", got "
                      + Types.typeToString(observed)
                      + " (replace whole node via delete to refresh)",
                  path,
                  frozen,
                  observed,
                  null),
              errors);
        } else if (frozen.kind() == TypeKind.ARRAY
            && observed.kind() == TypeKind.ARRAY
            && frozen.element() != null
            && observed.element() != null
            && !Types.typeCompatible(frozen.element(), observed.element())) {
          fail(
              new XaiopTypeError(
                  "array element type mismatch at "
                      + path
                      + ": expected "
                      + Types.typeToString(frozen.element())
                      + ", got "
                      + Types.typeToString(observed.element()),
                  path,
                  frozen,
                  observed,
                  null),
              errors);
        }
      } else {
        freeze.put(path, observed);
      }
    }

    if (value instanceof List<?> list) {
      observeArray(list, segs, errors);
    } else if (value instanceof Map<?, ?> map) {
      @SuppressWarnings("unchecked")
      Map<String, Object> m = (Map<String, Object>) map;
      for (String key : m.keySet()) {
        ArrayList<Object> child = new ArrayList<>(segs);
        child.add(key);
        walkObserve(m.get(key), child, errors);
      }
    }
  }

  private void observeArray(List<?> value, List<Object> segs, List<XaiopTypeError> errors) {
    String path = segs.isEmpty() ? null : Encode.formatJsonPath(segs);
    CanonicalType elemFreeze = path != null ? elementOf(freeze.get(path)) : null;

    for (int i = 0; i < value.size(); i++) {
      Object el = value.get(i);
      if (el == null) continue;
      CanonicalType elType;
      try {
        elType = Types.stripShape(Types.classifyValue(el));
      } catch (RuntimeException e) {
        ArrayList<Object> childSegs = new ArrayList<>(segs);
        childSegs.add(i);
        XaiopTypeError err =
            e instanceof XaiopTypeError te
                ? te
                : new XaiopTypeError(
                    String.valueOf(e.getMessage()), Encode.formatJsonPath(childSegs));
        fail(err, errors);
        continue;
      }
      if (elemFreeze == null) {
        elemFreeze = elType;
        if (path != null) {
          freeze.put(path, CanonicalType.array(elemFreeze));
        }
      } else if (!Types.typeCompatible(elemFreeze, elType)) {
        fail(
            new XaiopTypeError(
                "array element types must be consistent at "
                    + (path != null ? path : "<root>")
                    + ": expected "
                    + Types.typeToString(elemFreeze)
                    + ", got "
                    + Types.typeToString(elType),
                path,
                elemFreeze,
                elType,
                null),
            errors);
      }
      ArrayList<Object> child = new ArrayList<>(segs);
      child.add(i);
      walkObserve(el, child, errors);
    }
  }

  private static CanonicalType elementOf(CanonicalType t) {
    return t != null ? t.element() : null;
  }

  private boolean pathEscaped(String path) {
    if (escapePaths == null || escapePaths.isEmpty()) return false;
    for (String e : escapePaths) {
      if ("".equals(e)) return true;
      if (e == null) continue;
      if (path.equals(e)) return true;
      if (path.startsWith(e + ".") || path.startsWith(e + "[")) return true;
    }
    return false;
  }

  private void fail(XaiopTypeError err, List<XaiopTypeError> errors) {
    if (onViolation != null) onViolation.accept(err);
    errors.add(err);
  }

  private static void collectPaths(Object value, List<Object> segs, Set<String> out) {
    if (!segs.isEmpty()) out.add(Encode.formatJsonPath(segs));
    if (value == null || (!(value instanceof Map) && !(value instanceof List))) return;
    if (value instanceof List<?> list) {
      for (int i = 0; i < list.size(); i++) {
        ArrayList<Object> child = new ArrayList<>(segs);
        child.add(i);
        collectPaths(list.get(i), child, out);
      }
    } else {
      @SuppressWarnings("unchecked")
      Map<String, Object> map = (Map<String, Object>) value;
      for (String key : map.keySet()) {
        ArrayList<Object> child = new ArrayList<>(segs);
        child.add(key);
        collectPaths(map.get(key), child, out);
      }
    }
  }
}
