package io.xaiop.control;

/**
 * Resume wire-log error (strictly increasing seq guard).
 *
 * <p>Faithful port of {@code XaiopResumeLogError} from the Node.js SDK's {@code resume-log.js}.
 */
public class XaiopResumeLogError extends RuntimeException {
  private final String code;
  private final Integer seq;

  public XaiopResumeLogError(String message) {
    this(message, "RESUME_LOG", null);
  }

  public XaiopResumeLogError(String message, String code) {
    this(message, code, null);
  }

  public XaiopResumeLogError(String message, String code, Integer seq) {
    super(message);
    this.code = code == null ? "RESUME_LOG" : code;
    this.seq = seq;
  }

  public String getCode() {
    return code;
  }

  public Integer getSeq() {
    return seq;
  }
}
