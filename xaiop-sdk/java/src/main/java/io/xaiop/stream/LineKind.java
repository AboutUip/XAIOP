package io.xaiop.stream;

/**
 * Stable kind ids for the fixed {@link LineIntercept.LineView} template (Node {@code LINE_KIND}).
 *
 * <p>Not a type system — only enough structure for checkpoint line interceptors to read / rewrite /
 * skip a wire line.
 */
public final class LineKind {
  public static final String PHASE = "phase";
  public static final String ANNOTATION = "annotation";
  public static final String POP = "pop";
  public static final String POP_ENTER = "pop_enter";
  public static final String LOCATE = "locate";
  public static final String EXACT = "exact";
  public static final String BROADCAST = "broadcast";
  public static final String DELETE = "delete";
  public static final String SELECT = "select";
  public static final String OBJECT_ANON = "object_anon";
  public static final String ARRAY_ANON = "array_anon";
  public static final String ARRAY_NAMED = "array_named";
  public static final String OBJECT_NAMED = "object_named";
  public static final String CONTENT = "content";
  public static final String UNKNOWN = "unknown";

  private LineKind() {}
}
