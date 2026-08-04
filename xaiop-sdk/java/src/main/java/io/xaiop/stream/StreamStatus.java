package io.xaiop.stream;

/**
 * Stream / request lifecycle (Node {@code STREAM_STATUS}).
 *
 * <pre>
 * idle → connecting → streaming → completing → completed
 *                              ↘ aborted | error
 * </pre>
 */
public enum StreamStatus {
  IDLE("idle"),
  CONNECTING("connecting"),
  STREAMING("streaming"),
  COMPLETING("completing"),
  COMPLETED("completed"),
  ABORTED("aborted"),
  ERROR("error");

  private final String wire;

  StreamStatus(String wire) {
    this.wire = wire;
  }

  /** Wire / Node-compatible string. */
  public String wire() {
    return wire;
  }

  public boolean idleLike() {
    return this == IDLE || this == COMPLETED || this == ABORTED || this == ERROR;
  }

  public boolean busy() {
    return this == CONNECTING || this == STREAMING || this == COMPLETING;
  }
}
