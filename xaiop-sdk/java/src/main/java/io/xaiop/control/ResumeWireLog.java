package io.xaiop.control;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Outbound phase wire log for producer-side resume.
 *
 * <p>Faithful port of {@code ResumeWireLog} from the Node.js SDK's {@code resume-log.js}.
 *
 * <p>Seq here is the <b>session-log</b> sequence (one entry per completed logical phase). On {@code
 * resume{ fromSeq }}, replay {@link #wiresAfter(int)} — each entry is prefixed with {@code
 * #!xaiop/seq/v1} so the consumer gets {@code meta.logSeq}.
 */
public final class ResumeWireLog {
  public record Entry(int seq, String wire, Object committed) {}

  private final List<Entry> entries = new ArrayList<>();

  public int size() {
    return entries.size();
  }

  /** Highest recorded seq, or 0 if empty. */
  public int highestSeq() {
    if (entries.isEmpty()) return 0;
    return entries.get(entries.size() - 1).seq();
  }

  public ResumeWireLog record(int seq, String wire) {
    return record(seq, wire, ABSENT);
  }

  /**
   * @param committed optional committed JSON; pass {@code null} to store an explicit null snapshot
   */
  public ResumeWireLog record(int seq, String wire, Object committed) {
    if (seq < 1) {
      throw new IllegalArgumentException("ResumeWireLog.record requires seq >= 1");
    }
    if (wire == null) {
      throw new IllegalArgumentException("ResumeWireLog.record requires wire string");
    }
    int last = highestSeq();
    if (seq <= last) {
      throw new XaiopResumeLogError(
          "ResumeWireLog seq must be strictly increasing (got " + seq + ", last " + last + ")",
          "RESUME_LOG_SEQ",
          seq);
    }
    Object stored = committed == ABSENT ? null : committed;
    boolean hasCommitted = committed != ABSENT;
    entries.add(new Entry(seq, wire, hasCommitted ? stored : ABSENT));
    return this;
  }

  /** Record from a map with keys {@code seq}, {@code wire}, optional {@code committed}. */
  public ResumeWireLog record(Map<String, Object> entry) {
    if (entry == null) {
      throw new IllegalArgumentException("ResumeWireLog.record requires seq >= 1");
    }
    Object seqObj = entry.get("seq");
    if (!(seqObj instanceof Number n) || n.intValue() < 1 || n.doubleValue() != n.intValue()) {
      throw new IllegalArgumentException("ResumeWireLog.record requires seq >= 1");
    }
    Object wireObj = entry.get("wire");
    if (!(wireObj instanceof String wire)) {
      throw new IllegalArgumentException("ResumeWireLog.record requires wire string");
    }
    if (entry.containsKey("committed")) {
      return record(n.intValue(), wire, entry.get("committed"));
    }
    return record(n.intValue(), wire);
  }

  /**
   * Concatenated wire for all phases with seq &gt; fromSeq (resume continue). Each phase is
   * prefixed with {@code #!xaiop/seq/v1}.
   */
  public String wiresAfter(int fromSeq) {
    return joinAfter(fromSeq, true);
  }

  /** Like {@link #wiresAfter(int)} but without seq stamp frames (tests / raw dump). */
  public String wiresAfterRaw(int fromSeq) {
    return joinAfter(fromSeq, false);
  }

  private String joinAfter(int fromSeq, boolean stamp) {
    if (fromSeq < 0) {
      throw new IllegalArgumentException("wiresAfter requires non-negative integer fromSeq");
    }
    StringBuilder out = new StringBuilder();
    for (Entry e : entries) {
      if (e.seq() > fromSeq) {
        out.append(stamp ? ControlFrames.stampWireWithLogSeq(e.seq(), e.wire()) : e.wire());
      }
    }
    return out.toString();
  }

  public Entry entryAt(int seq) {
    for (Entry e : entries) {
      if (e.seq() == seq) {
        Object committed = e.committed() == ABSENT ? null : e.committed();
        boolean has = e.committed() != ABSENT;
        // Return a copy-like entry; committed may be ABSENT → expose via committedAt
        return new Entry(e.seq(), e.wire(), has ? committed : null);
      }
    }
    return null;
  }

  /** Committed snapshot recorded at {@code seq}, or {@code null} if none / missing. */
  public Object committedAt(int seq) {
    for (Entry e : entries) {
      if (e.seq() == seq) {
        return e.committed() == ABSENT ? null : e.committed();
      }
    }
    return null;
  }

  /** Whether an entry at {@code seq} stored a committed field (including explicit null). */
  public boolean hasCommittedAt(int seq) {
    for (Entry e : entries) {
      if (e.seq() == seq) return e.committed() != ABSENT;
    }
    return false;
  }

  public List<Map<String, Object>> toArray() {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Entry e : entries) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("seq", e.seq());
      m.put("wire", e.wire());
      if (e.committed() != ABSENT) m.put("committed", e.committed());
      out.add(m);
    }
    return out;
  }

  public ResumeWireLog clear() {
    entries.clear();
    return this;
  }

  /** Sentinel: committed field was not provided. */
  private static final Object ABSENT = new Object();
}
