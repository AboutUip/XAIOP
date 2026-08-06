package io.xaiop.control;

import io.xaiop.Json;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SDK Control Root ({@code #!}) frame codec helpers.
 *
 * <p>Faithful port of the Node.js SDK's {@code control.js} constants and encode helpers.
 */
public final class ControlFrames {
  /** Official control namespace. */
  public static final String CONTROL_NS = "xaiop";

  /** Known capability names under {@link #CONTROL_NS}. */
  public static final class CONTROL_NAME {
    public static final String TYPES = "types";
    public static final String SESSION = "session";
    public static final String RESUME = "resume";
    public static final String ACK = "ack";
    public static final String SNAPSHOT = "snapshot";
    public static final String SEQ = "seq";

    private CONTROL_NAME() {}
  }

  /** Capability ids {@code ns/name/vN}. */
  public static final class CONTROL_CAPABILITY {
    public static final String TYPES_V1 = "xaiop/types/v1";
    public static final String SESSION_V1 = "xaiop/session/v1";
    public static final String RESUME_V1 = "xaiop/resume/v1";
    public static final String ACK_V1 = "xaiop/ack/v1";
    public static final String SNAPSHOT_V1 = "xaiop/snapshot/v1";
    public static final String SEQ_V1 = "xaiop/seq/v1";

    private CONTROL_CAPABILITY() {}
  }

  private static final Pattern HEADER_RE =
      Pattern.compile("^#!([A-Za-z][A-Za-z0-9_-]*)/([A-Za-z][A-Za-z0-9_-]*)/v(\\d+)$");

  private ControlFrames() {}

  /** @return whether {@code line} starts with {@code #!} */
  public static boolean isSdkControlLine(String line) {
    return line != null && line.length() >= 2 && line.charAt(0) == '#' && line.charAt(1) == '!';
  }

  /**
   * Parse a control header line (no trailing newline).
   *
   * @return header fields, or {@code null} when not a well-formed control header
   */
  public static ControlFrame parseControlHeader(String line) {
    if (!isSdkControlLine(line)) return null;
    Matcher m = HEADER_RE.matcher(line);
    if (!m.matches()) return null;
    String ns = m.group(1);
    String name = m.group(2);
    int version = Integer.parseInt(m.group(3));
    String id = ns + "/" + name + "/v" + version;
    return new ControlFrame(ns, name, version, id, line, null, null);
  }

  /**
   * Encodes {@code #!&lt;ns&gt;/&lt;name&gt;/v&lt;version&gt;\n&lt;body&gt;\n}.
   *
   * @param body JSON-compatible tree, raw string body, or {@code null} for empty body
   */
  public static String encodeControlFrame(String ns, String name, int version, Object body) {
    if (ns == null || ns.isEmpty() || name == null || name.isEmpty()) {
      throw new IllegalArgumentException("encodeControlFrame requires ns and name");
    }
    if (version < 1) {
      throw new IllegalArgumentException("encodeControlFrame version must be a positive integer");
    }
    String header = "#!" + ns + "/" + name + "/v" + version;
    String bodyText;
    if (body == null) {
      bodyText = "";
    } else if (body instanceof String s) {
      bodyText = s;
    } else {
      bodyText = Json.stringify(body);
    }
    if (bodyText.indexOf('\n') >= 0 || bodyText.indexOf('\r') >= 0) {
      throw new XaiopControlError(
          "control frame body must be a single logical line (no CR/LF)",
          "CONTROL_BODY_MULTILINE",
          header);
    }
    return header + "\n" + bodyText + "\n";
  }

  public static String encodeSessionFrame(Object body) {
    return encodeControlFrame(CONTROL_NS, CONTROL_NAME.SESSION, 1, body);
  }

  public static String encodeResumeFrame(Object body) {
    return encodeControlFrame(CONTROL_NS, CONTROL_NAME.RESUME, 1, body);
  }

  public static String encodeAckFrame(Object body) {
    return encodeControlFrame(CONTROL_NS, CONTROL_NAME.ACK, 1, body);
  }

  public static String encodeSnapshotFrame(Object body) {
    return encodeControlFrame(CONTROL_NS, CONTROL_NAME.SNAPSHOT, 1, body);
  }

  /**
   * Stamp one session-log seq for the following document phase. Body: {@code { seq: number }}
   * ({@code seq >= 1}).
   *
   * @param body either an integer seq, or a map/object with {@code seq}
   */
  @SuppressWarnings("unchecked")
  public static String encodeSeqFrame(Object body) {
    Object seqObj = body;
    if (body instanceof Map<?, ?> map) {
      seqObj = map.get("seq");
    }
    int n;
    if (seqObj instanceof Number num) {
      n = num.intValue();
      if (num.doubleValue() != n) {
        throw new IllegalArgumentException("encodeSeqFrame requires seq >= 1");
      }
    } else {
      throw new IllegalArgumentException("encodeSeqFrame requires seq >= 1");
    }
    if (n < 1) {
      throw new IllegalArgumentException("encodeSeqFrame requires seq >= 1");
    }
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("seq", n);
    return encodeControlFrame(CONTROL_NS, CONTROL_NAME.SEQ, 1, payload);
  }

  /**
   * Prefix document wire with a log-seq stamp frame (resume / pushJson path).
   */
  public static String stampWireWithLogSeq(int seq, String wire) {
    if (wire == null) {
      throw new IllegalArgumentException("stampWireWithLogSeq requires wire string");
    }
    return encodeSeqFrame(seq) + wire;
  }

  /**
   * Parse control frame body as JSON.
   *
   * @return parsed value, or {@code null} when body is blank
   */
  public static Object parseControlBodyJson(ControlFrame frame) {
    if (frame == null) {
      throw new IllegalArgumentException("parseControlBodyJson requires frame");
    }
    String t = frame.body() == null ? "" : frame.body().trim();
    if (t.isEmpty()) return null;
    try {
      return Json.parse(t);
    } catch (RuntimeException err) {
      throw new XaiopControlError(
          "invalid control JSON for " + frame.id(),
          "CONTROL_BODY_JSON",
          frame.header(),
          frame,
          err);
    }
  }
}
