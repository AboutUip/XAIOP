package io.xaiop;

/**
 * Deterministic XAIOP parser (protocol v0.4.0 Frozen).
 * Silent repair exists only under an explicit compatibility policy.
 *
 * <p>Faithful port of {@code XaiopSyntaxError} from the Node.js SDK's
 * {@code parse.js}. Unchecked (RuntimeException) so call sites mirror the
 * JS throw-anywhere behaviour without forcing checked-exception plumbing.
 */
public class XaiopSyntaxError extends RuntimeException {
  private final Integer line;

  public XaiopSyntaxError(String message) {
    this(message, null);
  }

  public XaiopSyntaxError(String message, Integer line) {
    super(line != null ? "line " + line + ": " + message : message);
    this.line = line;
  }

  /** @return 1-based source line the error occurred on, or {@code null} if unknown. */
  public Integer getLine() {
    return line;
  }
}
