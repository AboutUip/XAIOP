package io.xaiop.types;

import io.xaiop.Encode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;

/**
 * Server-side check: only registered paths; invokes optional hook.
 *
 * <p>Faithful port of {@code TypeChecker} from the Node.js SDK's {@code types.js}.
 */
public final class TypeChecker {
  private final TypeRegistry registry;
  private final BiConsumer<XaiopTypeError, ViolationContext> onViolation;

  public TypeChecker(TypeRegistry registry) {
    this(registry, null);
  }

  public TypeChecker(
      TypeRegistry registry, BiConsumer<XaiopTypeError, ViolationContext> onViolation) {
    this.registry = registry;
    this.onViolation = onViolation;
  }

  public TypeRegistry registry() {
    return registry;
  }

  /**
   * @param shouldThrow default {@code true} — throw the first error after collecting
   * @return all violations (empty when valid)
   */
  public List<XaiopTypeError> checkTree(Object value, boolean shouldThrow) {
    ArrayList<XaiopTypeError> errors = new ArrayList<>();
    Object root = Types.unwrapFragment(value);
    walk(root, new ArrayList<>(), errors);
    if (shouldThrow && !errors.isEmpty()) throw errors.get(0);
    return errors;
  }

  public List<XaiopTypeError> checkTree(Object value) {
    return checkTree(value, true);
  }

  private void walk(Object value, List<Object> segs, List<XaiopTypeError> errors) {
    if (!segs.isEmpty()) {
      String path = Encode.formatJsonPath(segs);
      TypeEntry entry = registry.get(path);
      if (entry != null) checkEntry(path, value, entry, errors);
    }

    if (value != null && (value instanceof Map || value instanceof List)) {
      if (value instanceof List<?> list) {
        String path = segs.isEmpty() ? null : Encode.formatJsonPath(segs);
        TypeEntry entry = path != null ? registry.get(path) : null;
        CanonicalType elemType =
            entry != null
                    && entry.polarity() == TypePolarity.ALLOW
                    && entry.type().kind() == TypeKind.ARRAY
                ? entry.type().element()
                : null;
        for (int i = 0; i < list.size(); i++) {
          Object el = list.get(i);
          ArrayList<Object> childSegs = new ArrayList<>(segs);
          childSegs.add(i);
          if (elemType != null && el != null) {
            String childPath = Encode.formatJsonPath(childSegs);
            if (!Types.valueMatchesType(el, elemType)) {
              fail(
                  new XaiopTypeError(
                      "type mismatch at "
                          + childPath
                          + ": expected "
                          + Types.typeToString(elemType)
                          + ", got "
                          + Types.typeToString(Types.classifyValueSafe(el)),
                      childPath,
                      elemType,
                      Types.classifyValueSafe(el),
                      TypePolarity.ALLOW),
                  new ViolationContext(childPath, el, entry),
                  errors);
            }
          }
          walk(el, childSegs, errors);
        }
      } else {
        @SuppressWarnings("unchecked")
        Map<String, Object> map = (Map<String, Object>) value;
        for (String key : map.keySet()) {
          ArrayList<Object> childSegs = new ArrayList<>(segs);
          childSegs.add(key);
          walk(map.get(key), childSegs, errors);
        }
      }
    }
  }

  private void checkEntry(
      String path, Object value, TypeEntry entry, List<XaiopTypeError> errors) {
    boolean matches = Types.valueMatchesType(value, entry.type());
    if (entry.polarity() == TypePolarity.ALLOW) {
      if (!matches) {
        fail(
            new XaiopTypeError(
                "type mismatch at "
                    + path
                    + ": expected "
                    + Types.typeToString(entry.type())
                    + ", got "
                    + Types.typeToString(Types.classifyValueSafe(value)),
                path,
                entry.type(),
                Types.classifyValueSafe(value),
                TypePolarity.ALLOW),
            new ViolationContext(path, value, entry),
            errors);
      }
    } else if (matches) {
      fail(
          new XaiopTypeError(
              "type denied at " + path + ": must not be " + Types.typeToString(entry.type()),
              path,
              entry.type(),
              Types.classifyValueSafe(value),
              TypePolarity.DENY),
          new ViolationContext(path, value, entry),
          errors);
    }
  }

  private void fail(
      XaiopTypeError err, ViolationContext ctx, List<XaiopTypeError> errors) {
    if (onViolation != null) onViolation.accept(err, ctx);
    errors.add(err);
  }

  /** Hook context for registry violations. */
  public static final class ViolationContext {
    private final String path;
    private final Object value;
    private final TypeEntry entry;

    public ViolationContext(String path, Object value, TypeEntry entry) {
      this.path = path;
      this.value = value;
      this.entry = entry;
    }

    public String path() {
      return path;
    }

    public Object value() {
      return value;
    }

    public TypeEntry entry() {
      return entry;
    }
  }
}
