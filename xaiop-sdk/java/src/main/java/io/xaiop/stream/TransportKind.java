package io.xaiop.stream;

/** Transport kinds for {@link XaiopStream#send(SendOptions)} (Node {@code TRANSPORT_KIND}). */
public enum TransportKind {
  HTTP("http"),
  SSE("sse"),
  RAW("raw");

  private final String wire;

  TransportKind(String wire) {
    this.wire = wire;
  }

  public String wire() {
    return wire;
  }
}
