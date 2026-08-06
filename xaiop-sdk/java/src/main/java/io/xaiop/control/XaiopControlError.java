package io.xaiop.control;

/**
 * Control-plane error ({@code #!} demux / dispatch).
 *
 * <p>Faithful port of {@code XaiopControlError} from the Node.js SDK's {@code control.js}.
 */
public class XaiopControlError extends RuntimeException {
  private final String code;
  private final String header;
  private final ControlFrame frame;

  public XaiopControlError(String message) {
    this(message, "CONTROL_ERROR", null, null, null);
  }

  public XaiopControlError(String message, String code) {
    this(message, code, null, null, null);
  }

  public XaiopControlError(String message, String code, String header) {
    this(message, code, header, null, null);
  }

  public XaiopControlError(String message, String code, String header, ControlFrame frame) {
    this(message, code, header, frame, null);
  }

  public XaiopControlError(
      String message, String code, String header, ControlFrame frame, Throwable cause) {
    super(message, cause);
    this.code = code == null ? "CONTROL_ERROR" : code;
    this.header = header;
    this.frame = frame;
  }

  public String getCode() {
    return code;
  }

  public String getHeader() {
    return header;
  }

  public ControlFrame getFrame() {
    return frame;
  }
}
