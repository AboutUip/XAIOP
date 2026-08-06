package io.xaiop.control;

import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * Dispatch a control frame. Unknown / non-official capabilities → error + discard.
 *
 * <p>Faithful port of {@code dispatchControlFrame} from the Node.js SDK's {@code control.js}.
 */
public final class ControlDispatch {
  private ControlDispatch() {}

  /** Callbacks for official {@code xaiop/*} capabilities. */
  public static final class Handlers {
    public BiConsumer<Object, ControlFrame> onTypes;
    public BiConsumer<Object, ControlFrame> onSession;
    public BiConsumer<Object, ControlFrame> onResume;
    public BiConsumer<Object, ControlFrame> onAck;
    public BiConsumer<Object, ControlFrame> onSnapshot;
    public BiConsumer<Object, ControlFrame> onSeq;
    public Consumer<XaiopControlError> onControlError;

    public Handlers() {}

    public Handlers onTypes(BiConsumer<Object, ControlFrame> fn) {
      this.onTypes = fn;
      return this;
    }

    public Handlers onSession(BiConsumer<Object, ControlFrame> fn) {
      this.onSession = fn;
      return this;
    }

    public Handlers onResume(BiConsumer<Object, ControlFrame> fn) {
      this.onResume = fn;
      return this;
    }

    public Handlers onAck(BiConsumer<Object, ControlFrame> fn) {
      this.onAck = fn;
      return this;
    }

    public Handlers onSnapshot(BiConsumer<Object, ControlFrame> fn) {
      this.onSnapshot = fn;
      return this;
    }

    public Handlers onSeq(BiConsumer<Object, ControlFrame> fn) {
      this.onSeq = fn;
      return this;
    }

    public Handlers onControlError(Consumer<XaiopControlError> fn) {
      this.onControlError = fn;
      return this;
    }
  }

  public static void dispatchControlFrame(ControlFrame frame, Handlers handlers) {
    Handlers h = handlers == null ? new Handlers() : handlers;
    Consumer<XaiopControlError> report =
        err -> {
          if (h.onControlError != null) h.onControlError.accept(err);
        };

    if (!ControlFrames.CONTROL_NS.equals(frame.ns())) {
      report.accept(
          new XaiopControlError(
              "unknown control namespace: " + frame.ns(),
              "CONTROL_UNKNOWN_NS",
              frame.header(),
              frame));
      return;
    }

    try {
      switch (frame.name()) {
        case ControlFrames.CONTROL_NAME.TYPES -> {
          if (frame.version() != 1) {
            report.accept(unsupported(frame, "types"));
            return;
          }
          Object body = ControlFrames.parseControlBodyJson(frame);
          if (!(body instanceof Map<?, ?> map)
              || !Integer.valueOf(1).equals(asInt(map.get("version")))
              || !(map.get("entries") instanceof List)) {
            throw new XaiopControlError(
                "invalid type schema frame payload",
                "CONTROL_TYPES_PAYLOAD",
                frame.header(),
                frame);
          }
          if (h.onTypes != null) h.onTypes.accept(body, frame);
        }
        case ControlFrames.CONTROL_NAME.SESSION -> {
          if (frame.version() != 1) {
            report.accept(unsupported(frame, "session"));
            return;
          }
          Object body = ControlFrames.parseControlBodyJson(frame);
          if (body == null) body = Map.of();
          if (h.onSession != null) h.onSession.accept(body, frame);
        }
        case ControlFrames.CONTROL_NAME.RESUME -> {
          if (frame.version() != 1) {
            report.accept(unsupported(frame, "resume"));
            return;
          }
          Object body = ControlFrames.parseControlBodyJson(frame);
          if (body == null) body = Map.of();
          if (h.onResume != null) h.onResume.accept(body, frame);
        }
        case ControlFrames.CONTROL_NAME.ACK -> {
          if (frame.version() != 1) {
            report.accept(unsupported(frame, "ack"));
            return;
          }
          Object body = ControlFrames.parseControlBodyJson(frame);
          if (body == null) body = Map.of();
          if (h.onAck != null) h.onAck.accept(body, frame);
        }
        case ControlFrames.CONTROL_NAME.SNAPSHOT -> {
          if (frame.version() != 1) {
            report.accept(unsupported(frame, "snapshot"));
            return;
          }
          Object body = ControlFrames.parseControlBodyJson(frame);
          if (h.onSnapshot != null) h.onSnapshot.accept(body, frame);
        }
        case ControlFrames.CONTROL_NAME.SEQ -> {
          if (frame.version() != 1) {
            report.accept(unsupported(frame, "seq"));
            return;
          }
          Object body = ControlFrames.parseControlBodyJson(frame);
          if (body == null) body = Map.of();
          Object seqObj = body instanceof Map<?, ?> m ? m.get("seq") : null;
          Integer n = asInt(seqObj);
          if (n == null || n < 1) {
            throw new XaiopControlError(
                "invalid seq frame payload (need seq >= 1)",
                "CONTROL_SEQ_PAYLOAD",
                frame.header(),
                frame);
          }
          if (h.onSeq != null) h.onSeq.accept(body, frame);
        }
        default ->
            report.accept(
                new XaiopControlError(
                    "unknown control capability: " + frame.id(),
                    "CONTROL_UNKNOWN_CAPABILITY",
                    frame.header(),
                    frame));
      }
    } catch (XaiopControlError err) {
      report.accept(err);
    } catch (RuntimeException err) {
      report.accept(
          new XaiopControlError(
              err.getMessage() == null ? String.valueOf(err) : err.getMessage(),
              "CONTROL_DISPATCH",
              frame.header(),
              frame,
              err));
    }
  }

  private static XaiopControlError unsupported(ControlFrame frame, String name) {
    return new XaiopControlError(
        "unsupported " + name + " version: v" + frame.version(),
        "CONTROL_UNKNOWN_CAPABILITY",
        frame.header(),
        frame);
  }

  private static Integer asInt(Object v) {
    if (v instanceof Integer i) return i;
    if (v instanceof Number n) {
      double d = n.doubleValue();
      int i = n.intValue();
      if (d == i) return i;
    }
    return null;
  }
}
