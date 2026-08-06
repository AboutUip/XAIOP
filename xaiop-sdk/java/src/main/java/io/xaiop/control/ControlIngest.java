package io.xaiop.control;

/**
 * Ingest pipeline: demux + dispatch; returns wire text for the document engine.
 *
 * <p>Faithful port of {@code ControlIngest} from the Node.js SDK's {@code control.js}.
 */
public final class ControlIngest {
  private final ControlDemux demux = new ControlDemux();
  private ControlDispatch.Handlers handlers;

  public ControlIngest() {
    this(new ControlDispatch.Handlers());
  }

  public ControlIngest(ControlDispatch.Handlers handlers) {
    this.handlers = handlers == null ? new ControlDispatch.Handlers() : handlers;
  }

  public void setHandlers(ControlDispatch.Handlers handlers) {
    this.handlers = handlers == null ? new ControlDispatch.Handlers() : handlers;
  }

  /** Patch individual callbacks without replacing the whole handler map. */
  public void patchHandlers(ControlDispatch.Handlers patch) {
    if (patch == null) return;
    ControlDispatch.Handlers next = new ControlDispatch.Handlers();
    next.onTypes = patch.onTypes != null ? patch.onTypes : handlers.onTypes;
    next.onSession = patch.onSession != null ? patch.onSession : handlers.onSession;
    next.onResume = patch.onResume != null ? patch.onResume : handlers.onResume;
    next.onAck = patch.onAck != null ? patch.onAck : handlers.onAck;
    next.onSnapshot = patch.onSnapshot != null ? patch.onSnapshot : handlers.onSnapshot;
    next.onSeq = patch.onSeq != null ? patch.onSeq : handlers.onSeq;
    next.onControlError =
        patch.onControlError != null ? patch.onControlError : handlers.onControlError;
    this.handlers = next;
  }

  /** @return wire text to feed DotCheckpointEngine (may be empty) */
  public String push(String text) {
    ControlDemux.PushResult out = demux.push(text);
    emitErrors(out.errors());
    for (ControlFrame frame : out.frames()) {
      ControlDispatch.dispatchControlFrame(frame, handlers);
    }
    return out.wireText();
  }

  public String flush() {
    ControlDemux.PushResult out = demux.flush();
    emitErrors(out.errors());
    for (ControlFrame frame : out.frames()) {
      ControlDispatch.dispatchControlFrame(frame, handlers);
    }
    return out.wireText();
  }

  private void emitErrors(java.util.List<XaiopControlError> errors) {
    if (errors == null || errors.isEmpty()) return;
    if (handlers.onControlError == null) return;
    for (XaiopControlError e : errors) handlers.onControlError.accept(e);
  }
}
