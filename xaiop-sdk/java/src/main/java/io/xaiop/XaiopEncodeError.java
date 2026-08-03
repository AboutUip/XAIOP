package io.xaiop;

/**
 * JSON &rarr; XAIOP encoding failure (invalid options, unsupported value, rejected label).
 *
 * <p>Faithful port of {@code XaiopEncodeError} from the Node.js SDK's {@code encode.js}.
 * Unchecked (RuntimeException) so call sites mirror the JS throw-anywhere behaviour.
 */
public class XaiopEncodeError extends RuntimeException {
  private final String path;

  public XaiopEncodeError(String message) {
    this(message, null);
  }

  public XaiopEncodeError(String message, String path) {
    super(message);
    this.path = path;
  }

  /** @return JSON path of the offending node (e.g. {@code $.a.b[0]}), or {@code null}. */
  public String getPath() {
    return path;
  }
}
