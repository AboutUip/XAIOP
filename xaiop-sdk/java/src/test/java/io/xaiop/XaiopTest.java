package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class XaiopTest {
  @Test
  void protocolVersion() {
    assertEquals("0.1.0", Xaiop.PROTOCOL_VERSION);
  }
}
