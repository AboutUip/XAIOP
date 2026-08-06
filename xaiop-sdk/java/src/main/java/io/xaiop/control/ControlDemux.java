package io.xaiop.control;

import java.util.ArrayList;
import java.util.List;

/**
 * Streaming demux: peel {@code #!} control frames; remainder is document wire text.
 *
 * <p>Faithful port of {@code ControlDemux} from the Node.js SDK's {@code control.js}.
 */
public final class ControlDemux {
  private String carry = "";
  private ControlFrame pendingHeader;
  private String skipBodyAfterBadHeader;
  private boolean skipNextEmptyWireLine;

  /** Result of {@link #push(String)} / {@link #flush()}. */
  public record PushResult(String wireText, List<ControlFrame> frames, List<XaiopControlError> errors) {}

  public PushResult push(String text) {
    return push(text, false);
  }

  /**
   * @param finalizeBodies end-of-chunk / EOF: complete a pending body if present
   */
  public PushResult push(String text, boolean finalizeBodies) {
    List<ControlFrame> frames = new ArrayList<>();
    List<XaiopControlError> errors = new ArrayList<>();
    List<String> wireParts = new ArrayList<>();

    if (text != null && !text.isEmpty()) {
      carry += text;
    }

    int start = 0;
    while (start < carry.length()) {
      int nl = carry.indexOf('\n', start);
      if (nl < 0) break;
      String line = carry.substring(start, nl);
      if (line.endsWith("\r")) line = line.substring(0, line.length() - 1);
      String rawLineWithNl = carry.substring(start, nl + 1);
      start = nl + 1;
      handleCompleteLine(line, rawLineWithNl, wireParts, frames, errors);
    }
    carry = carry.substring(start);

    if (finalizeBodies) {
      finalizePending(wireParts, frames, errors);
    } else if (pendingHeader != null && !carry.isEmpty()) {
      if (looksCompleteJson(carry)) {
        completeFrame(carry, frames);
        pendingHeader = null;
        carry = "";
        skipNextEmptyWireLine = true;
      }
    } else if (skipBodyAfterBadHeader != null && !carry.isEmpty()) {
      if (looksCompleteJson(carry) || !carry.isEmpty()) {
        skipBodyAfterBadHeader = null;
        carry = "";
        skipNextEmptyWireLine = true;
      }
    }

    StringBuilder wire = new StringBuilder();
    for (String p : wireParts) wire.append(p);
    return new PushResult(wire.toString(), frames, errors);
  }

  /** End of stream / peer close: flush carry into pending body or wire. */
  public PushResult flush() {
    return push("", true);
  }

  public boolean hasPending() {
    return !carry.isEmpty() || pendingHeader != null || skipBodyAfterBadHeader != null;
  }

  private void handleCompleteLine(
      String line,
      String rawLineWithNl,
      List<String> wireParts,
      List<ControlFrame> frames,
      List<XaiopControlError> errors) {
    if (skipBodyAfterBadHeader != null) {
      skipBodyAfterBadHeader = null;
      return;
    }

    if (pendingHeader != null) {
      completeFrame(line, frames);
      pendingHeader = null;
      return;
    }

    if (ControlFrames.isSdkControlLine(line)) {
      ControlFrame header = ControlFrames.parseControlHeader(line);
      if (header == null) {
        errors.add(
            new XaiopControlError(
                "malformed control header: " + line, "CONTROL_HEADER_MALFORMED", line));
        skipBodyAfterBadHeader = line;
        return;
      }
      pendingHeader = header;
      return;
    }

    if (line.isEmpty() && skipNextEmptyWireLine) {
      skipNextEmptyWireLine = false;
      return;
    }
    skipNextEmptyWireLine = false;

    wireParts.add(rawLineWithNl);
  }

  private void finalizePending(
      List<String> wireParts, List<ControlFrame> frames, List<XaiopControlError> errors) {
    if (!carry.isEmpty()) {
      String rem = carry;
      carry = "";
      if (pendingHeader != null) {
        completeFrame(rem, frames);
        pendingHeader = null;
        return;
      }
      if (skipBodyAfterBadHeader != null) {
        skipBodyAfterBadHeader = null;
        return;
      }
      if (ControlFrames.isSdkControlLine(rem)) {
        ControlFrame header = ControlFrames.parseControlHeader(rem);
        if (header == null) {
          errors.add(
              new XaiopControlError(
                  "malformed control header: " + rem, "CONTROL_HEADER_MALFORMED", rem));
        } else {
          pendingHeader = header;
          completeFrame("", frames);
          pendingHeader = null;
        }
        return;
      }
      wireParts.add(rem);
      return;
    }

    if (skipBodyAfterBadHeader != null) {
      skipBodyAfterBadHeader = null;
      return;
    }

    if (pendingHeader != null) {
      completeFrame("", frames);
      pendingHeader = null;
    }
  }

  private void completeFrame(String body, List<ControlFrame> frames) {
    ControlFrame h = pendingHeader;
    if (h == null) return;
    String bodyText = body == null ? "" : body;
    frames.add(
        new ControlFrame(
            h.ns(),
            h.name(),
            h.version(),
            h.id(),
            h.header(),
            bodyText,
            h.header() + "\n" + bodyText));
  }

  private static boolean looksCompleteJson(String text) {
    String t = text.trim();
    if (t.isEmpty()) return true;
    char open = t.charAt(0);
    if (open != '{'
        && open != '['
        && open != '"'
        && open != 'n'
        && open != 't'
        && open != 'f'
        && open != '-'
        && !(open >= '0' && open <= '9')) {
      return false;
    }
    try {
      JsonParseProbe.parse(t);
      return true;
    } catch (RuntimeException e) {
      return false;
    }
  }

  /** Tiny probe using {@link io.xaiop.Json#parse} without importing cycles. */
  private static final class JsonParseProbe {
    static void parse(String t) {
      io.xaiop.Json.parse(t);
    }
  }
}
