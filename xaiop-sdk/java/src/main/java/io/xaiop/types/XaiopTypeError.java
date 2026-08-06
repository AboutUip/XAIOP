package io.xaiop.types;

/**
 * Type registry / freeze violation.
 *
 * <p>Faithful port of {@code XaiopTypeError} from the Node.js SDK's {@code types.js}. Unchecked so
 * call sites mirror the JS throw-anywhere behaviour.
 */
public class XaiopTypeError extends RuntimeException {
  private String path;
  private final CanonicalType expected;
  private final CanonicalType actual;
  private final TypePolarity polarity;

  public XaiopTypeError(String message) {
    this(message, null, null, null, null);
  }

  public XaiopTypeError(String message, String path) {
    this(message, path, null, null, null);
  }

  public XaiopTypeError(
      String message,
      String path,
      CanonicalType expected,
      CanonicalType actual,
      TypePolarity polarity) {
    super(message);
    this.path = path;
    this.expected = expected;
    this.actual = actual;
    this.polarity = polarity;
  }

  public String getPath() {
    return path;
  }

  /** Package-internal: freeze walk may attach path after construction. */
  void setPath(String path) {
    this.path = path;
  }

  public CanonicalType getExpected() {
    return expected;
  }

  public CanonicalType getActual() {
    return actual;
  }

  public TypePolarity getPolarity() {
    return polarity;
  }
}
