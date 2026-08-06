package io.xaiop.control;

/**
 * Parsed SDK Control Root frame ({@code #!&lt;ns&gt;/&lt;name&gt;/vN} + one body line).
 */
public record ControlFrame(
    String ns, String name, int version, String id, String header, String body, String raw) {}
