package io.xaiop.timing;

import io.xaiop.DotPolicy;
import io.xaiop.Encode;
import io.xaiop.EncodeOptions;
import io.xaiop.Json;
import io.xaiop.Parse;
import io.xaiop.Xaiop;
import io.xaiop.XaiopEngine;
import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.Materialize;
import io.xaiop.stream.StreamMode;
import io.xaiop.stream.XaiopStream;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * XAIOP Java SDK stage timing harness (same stage names as {@code timing/node/bench.mjs} /
 * {@code timing/python/bench.py}).
 *
 * <pre>
 *   cd xaiop-sdk/timing &amp;&amp; npm run bench:java
 *   # or:
 *   mvn -f ../java/pom.xml -q -DskipTests package
 *   mvn -f java/pom.xml -q exec:java
 * </pre>
 */
public final class StageTimingMain {
  private static final String HARNESS = "0.2.1";

  private static final String D1_WIRE =
      ">\n>meta\nname:x\n.\n>rules-\n>\nid:R1\n<\n.\n";
  private static final String D2_WIRE =
      ">\n>orders-\n>\nid:1\nsku:a\n<\n.\n@orders\n>\nid:2\nsku:b\n<\n.\n";
  private static final String LOCATE_WIRE =
      ">\n>left\n>test\nx:1\n.\n>right\n>test\ny:2\n.\n!test\nz:9\n.\n=left>test\nw:8\n.\n";

  private StageTimingMain() {}

  @FunctionalInterface
  private interface Work {
    void run() throws Exception;
  }

  private static final class Row {
    final String name;
    final int iters;
    final double totalMs;
    final double msPerOp;
    final double opsPerSec;
    final Integer bytes;
    final Double mbPerSec;
    final String note;

    Row(
        String name,
        int iters,
        double totalMs,
        double msPerOp,
        double opsPerSec,
        Integer bytes,
        Double mbPerSec,
        String note) {
      this.name = name;
      this.iters = iters;
      this.totalMs = totalMs;
      this.msPerOp = msPerOp;
      this.opsPerSec = opsPerSec;
      this.bytes = bytes;
      this.mbPerSec = mbPerSec;
      this.note = note;
    }
  }

  private static final class DeltaSummary {
    final int faster;
    final int slower;
    final int missing;

    DeltaSummary(int faster, int slower, int missing) {
      this.faster = faster;
      this.slower = slower;
      this.missing = missing;
    }
  }

  public static void main(String[] args) throws Exception {
    boolean quick = false;
    boolean jsonOut = false;
    boolean saveBaseline = false;
    boolean noBaseline = false;
    for (String a : args) {
      switch (a) {
        case "--quick" -> quick = true;
        case "--json" -> jsonOut = true;
        case "--save-baseline" -> saveBaseline = true;
        case "--no-baseline" -> noBaseline = true;
        case "--help", "-h" -> {
          System.out.println(
              "Usage: StageTimingMain [--quick] [--json] [--save-baseline] [--no-baseline]");
          return;
        }
        default -> {
          System.err.println("Unknown arg: " + a);
          System.exit(64);
          return;
        }
      }
    }

    int iters = envInt("BENCH_ITERS", quick ? 40 : 120);
    int warmup = envInt("BENCH_WARMUP", quick ? 5 : 15);
    int longPhases = envInt("BENCH_LONG_PHASES", quick ? 24 : 80);

    Path root = timingRoot();
    Path lastPath = root.resolve("last-bench.json");
    Path baselinePath = root.resolve("baseline-bench.json");

    Map<String, Object> fixture = buildFixture(quick ? 2 : 3, quick ? 5 : 8);
    String wireNone =
        Encode.encode(fixture, EncodeOptions.builder().dotPolicy(DotPolicy.NONE).build());
    String wirePhased =
        Encode.encode(
            fixture, EncodeOptions.builder().dotPolicy(DotPolicy.PER_TOP_LEVEL_KEY).build());
    String wireDense =
        Encode.encode(
            fixture,
            EncodeOptions.builder().dotPolicy(DotPolicy.PER_N_KEYS).phaseEvery(1).build());
    String longWire = buildLongSessionWire(longPhases);
    List<String> longChunks = splitPhases(longWire);

    List<Row> rows = new ArrayList<>();
    Map<String, Integer> extras = new LinkedHashMap<>();

    rows.add(
        bench(
            "encodeSync/none",
            () -> Encode.encode(fixture, EncodeOptions.builder().dotPolicy(DotPolicy.NONE).build()),
            iters,
            warmup,
            null,
            null));
    rows.add(
        bench(
            "encodeSync/perTopLevelKey",
            () ->
                Encode.encode(
                    fixture, EncodeOptions.builder().dotPolicy(DotPolicy.PER_TOP_LEVEL_KEY).build()),
            iters,
            warmup,
            null,
            null));
    rows.add(
        bench(
            "parseSync/none-wire",
            () -> Parse.parse(wireNone),
            iters,
            warmup,
            utf8(wireNone),
            null));
    rows.add(
        bench(
            "parseSync/phased-wire",
            () -> Parse.parse(wirePhased),
            iters,
            warmup,
            utf8(wirePhased),
            null));
    rows.add(
        bench(
            "parseSync+materialize/none",
            () -> Materialize.materializeSnapshot(Parse.parse(wireNone)),
            iters,
            warmup,
            utf8(wireNone),
            null));

    rows.add(
        bench(
            "checkpoint/streamOn/phased",
            () -> runCheckpoint(List.of(wirePhased), null),
            iters,
            warmup,
            utf8(wirePhased),
            null));
    rows.add(
        bench(
            "checkpoint/streamOff/phased",
            () -> runCheckpoint(List.of(wirePhased), o -> o.streamProcessing(false)),
            iters,
            warmup,
            utf8(wirePhased),
            null));
    rows.add(
        bench(
            "checkpoint/streamOn/dense",
            () -> runCheckpoint(List.of(wireDense), null),
            iters,
            warmup,
            utf8(wireDense),
            null));
    rows.add(
        bench(
            "checkpoint/emitDiffOn/dense",
            () -> runCheckpoint(List.of(wireDense), o -> o.emitDiff(true).onChunk(d -> {})),
            iters,
            warmup,
            utf8(wireDense),
            "default Diff delivery"));
    rows.add(
        bench(
            "checkpoint/emitDiffOff/dense",
            () -> runCheckpoint(List.of(wireDense), o -> o.emitDiff(false)),
            iters,
            warmup,
            utf8(wireDense),
            "Commit only; onChunk optional"));

    int mid = D1_WIRE.indexOf(".\n") + 2;
    String d1a = D1_WIRE.substring(0, mid);
    String d1b = D1_WIRE.substring(mid);
    rows.add(
        bench(
            "checkpoint/D1-split/>after-dot",
            () -> runCheckpoint(List.of(d1a, d1b), o -> o.mergeChunkWindow(false)),
            iters,
            warmup,
            utf8(D1_WIRE),
            "Diff isolation object-root cont."));
    rows.add(
        bench(
            "checkpoint/D2-@/named-array",
            () -> runCheckpoint(List.of(D2_WIRE), o -> o.mergeChunkWindow(false)),
            iters,
            warmup,
            utf8(D2_WIRE),
            "cumulative @ Diff"));
    rows.add(
        bench(
            "checkpoint/locate/bang+eq",
            () -> runCheckpoint(List.of(LOCATE_WIRE), null),
            iters,
            warmup,
            utf8(LOCATE_WIRE),
            null));

    int longIters = Math.max(8, iters / 4);
    int longWarm = Math.max(1, warmup / 2);
    rows.add(
        bench(
            "checkpoint/long/grow-buffer",
            () -> {
              DotCheckpointEngine eng =
                  runCheckpoint(longChunks, o -> o.mergeChunkWindow(false).emitDiff(false));
              extras.put("longGrowBufferBytes", eng.bufferStats().length);
            },
            longIters,
            longWarm,
            utf8(longWire),
            longPhases + " phases, no compact"));
    rows.add(
        bench(
            "checkpoint/long/compact-each-phase",
            () -> {
              DotCheckpointEngine eng =
                  runCheckpoint(longChunks, o -> o.mergeChunkWindow(false).emitDiff(false), false);
              for (String c : longChunks) {
                eng.push(c);
                if (!eng.bufferStats().openPhase) eng.compactCommitted();
              }
              eng.finish();
              extras.put("longCompactBufferBytes", eng.bufferStats().length);
            },
            longIters,
            longWarm,
            utf8(longWire),
            longPhases + " phases + compactCommitted"));

    rows.add(
        bench(
            "engine/uploadJsonSync+getSync",
            () -> {
              XaiopEngine e = new XaiopEngine();
              String id = e.uploadJsonSync(fixture);
              e.getSync(id);
            },
            iters,
            warmup,
            null,
            null));

    int asyncIters = Math.max(10, iters / 3);
    int asyncWarm = Math.max(1, warmup / 2);
    rows.add(
        bench(
            "stream.send/PROMISE/phased",
            () -> {
              XaiopStream stream =
                  new XaiopStream(
                      "raw://bench", XaiopStream.Options.defaults().modes(StreamMode.PROMISE));
              stream.sendRaw(List.of(wirePhased)).get(30, TimeUnit.SECONDS);
            },
            asyncIters,
            asyncWarm,
            utf8(wirePhased),
            "PROMISE alone → engine emitDiff false"));
    rows.add(
        bench(
            "stream.send/CALLBACK+onChunk/phased",
            () -> {
              XaiopStream stream =
                  new XaiopStream(
                      "raw://bench", XaiopStream.Options.defaults().modes(StreamMode.CALLBACK));
              stream.onChunk(d -> {});
              stream.onDone(d -> {});
              var fut = stream.sendRaw(List.of(wirePhased));
              if (fut != null) {
                fut.get(30, TimeUnit.SECONDS);
              } else {
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
                while (stream.isBusy() && System.nanoTime() < deadline) {
                  Thread.sleep(1);
                }
              }
            },
            asyncIters,
            asyncWarm,
            utf8(wirePhased),
            "forces phase Diff parse"));
    rows.add(
        bench(
            "stream.send/PROMISE/streamOff",
            () -> {
              XaiopStream stream =
                  new XaiopStream(
                      "raw://bench",
                      XaiopStream.Options.defaults()
                          .modes(StreamMode.PROMISE)
                          .streamProcessing(false));
              stream.sendRaw(List.of(wirePhased)).get(30, TimeUnit.SECONDS);
            },
            asyncIters,
            asyncWarm,
            utf8(wirePhased),
            null));
    int midLoc = LOCATE_WIRE.length() / 2;
    rows.add(
        bench(
            "stream.send/chunked/bang+eq",
            () -> {
              XaiopStream stream =
                  new XaiopStream(
                      "raw://bench", XaiopStream.Options.defaults().modes(StreamMode.PROMISE));
              stream
                  .sendRaw(
                      List.of(LOCATE_WIRE.substring(0, midLoc), LOCATE_WIRE.substring(midLoc)))
                  .get(30, TimeUnit.SECONDS);
            },
            asyncIters,
            asyncWarm,
            utf8(LOCATE_WIRE),
            null));

    DotCheckpointEngine eng = runCheckpoint(List.of(wirePhased), null);
    boolean same = sameTree(eng.committedSnapshot(), Parse.parse(wirePhased));
    DotCheckpointEngine d1 = runCheckpoint(List.of(d1a, d1b), o -> o.mergeChunkWindow(false));
    boolean d1Ok = sameTree(d1.committedSnapshot(), Parse.parse(D1_WIRE));
    DotCheckpointEngine d2 = runCheckpoint(List.of(D2_WIRE), o -> o.mergeChunkWindow(false));
    boolean d2Ok = sameTree(d2.committedSnapshot(), Parse.parse(D2_WIRE));

    if (!extras.containsKey("longGrowBufferBytes")) {
      DotCheckpointEngine g =
          runCheckpoint(longChunks, o -> o.mergeChunkWindow(false).emitDiff(false));
      extras.put("longGrowBufferBytes", g.bufferStats().length);
    }
    if (!extras.containsKey("longCompactBufferBytes")) {
      DotCheckpointEngine engC =
          runCheckpoint(longChunks, o -> o.mergeChunkWindow(false).emitDiff(false), false);
      for (String c : longChunks) {
        engC.push(c);
        if (!engC.bufferStats().openPhase) engC.compactCommitted();
      }
      engC.finish();
      extras.put("longCompactBufferBytes", engC.bufferStats().length);
    }

    Map<String, Object> report = new LinkedHashMap<>();
    report.put("kind", "xaiop-sdk-stage-timing");
    report.put("harness", HARNESS);
    report.put("runtime", "java");
    report.put("not", "JSON race · docs/performance.md PERF-METRICS");
    report.put("sdk", Xaiop.SDK_VERSION);
    report.put("protocol", Xaiop.PROTOCOL_VERSION);
    report.put("java", System.getProperty("java.version"));
    report.put("iters", iters);
    report.put("warmup", warmup);
    report.put("longPhases", longPhases);
    report.put("quick", quick);

    Map<String, Object> fixtureMeta = new LinkedHashMap<>();
    fixtureMeta.put("wireNone", utf8(wireNone));
    fixtureMeta.put("wirePhased", utf8(wirePhased));
    fixtureMeta.put("wireDense", utf8(wireDense));
    fixtureMeta.put("longWire", utf8(longWire));
    fixtureMeta.put("d1", utf8(D1_WIRE));
    fixtureMeta.put("d2", utf8(D2_WIRE));
    report.put("fixture", fixtureMeta);
    report.put("extras", extras);

    List<Map<String, Object>> stages = new ArrayList<>();
    for (Row r : rows) {
      Map<String, Object> s = new LinkedHashMap<>();
      s.put("name", r.name);
      s.put("msPerOp", r.msPerOp);
      s.put("opsPerSec", r.opsPerSec);
      s.put("iters", r.iters);
      s.put("bytes", r.bytes);
      s.put("mbPerSec", r.mbPerSec);
      s.put("note", r.note);
      stages.add(s);
    }
    report.put("stages", stages);

    Map<String, Object> correctness = new LinkedHashMap<>();
    correctness.put("checkpointVsParseSync", same);
    correctness.put("d1Split", d1Ok);
    correctness.put("d2At", d2Ok);
    report.put("correctness", correctness);
    report.put("savedAt", Instant.now().toString());

    String reportJson = prettyJson(report);
    Files.createDirectories(root);
    Files.writeString(lastPath, reportJson, StandardCharsets.UTF_8);
    if (saveBaseline) {
      Files.writeString(baselinePath, reportJson, StandardCharsets.UTF_8);
    }

    DeltaSummary deltaSummary = null;
    if (!noBaseline && Files.isRegularFile(baselinePath)) {
      try {
        @SuppressWarnings("unchecked")
        Map<String, Object> base =
            (Map<String, Object>) Json.parse(Files.readString(baselinePath, StandardCharsets.UTF_8));
        Map<String, Object> compare = new LinkedHashMap<>();
        compare.put("sdk", base.get("sdk"));
        compare.put("java", base.get("java"));
        compare.put("savedAt", base.get("savedAt"));
        compare.put("harness", base.get("harness"));
        report.put("baselineCompare", compare);
        if (!jsonOut) {
          @SuppressWarnings("unchecked")
          List<Map<String, Object>> baseStages = (List<Map<String, Object>>) base.get("stages");
          deltaSummary = printDelta(rows, baseStages == null ? List.of() : baseStages, compare);
        }
      } catch (Exception ignored) {
        // baseline optional
      }
    }

    if (jsonOut) {
      System.out.println(prettyJson(report));
    } else {
      System.out.printf(
          Locale.ROOT,
          "XAIOP Java stage timing  harness=%s  sdk=%s  protocol=%s  java=%s%n",
          HARNESS,
          Xaiop.SDK_VERSION,
          Xaiop.PROTOCOL_VERSION,
          report.get("java"));
      System.out.printf(
          Locale.ROOT,
          "iters=%d warmup=%d longPhases=%d%s%n%n",
          iters,
          warmup,
          longPhases,
          quick ? "  --quick" : "");
      printTable(rows);
      System.out.printf(
          Locale.ROOT,
          "%ncorrectness: checkpointVsParse=%s  d1Split=%s  d2At=%s%n",
          same,
          d1Ok,
          d2Ok);
      System.out.println("wrote " + lastPath.getFileName());
      if (saveBaseline) {
        System.out.println("wrote baseline " + baselinePath.getFileName());
      }
    }

    boolean failSlower = "1".equals(System.getenv("BENCH_FAIL_SLOWER"));
    int code = 0;
    if (failSlower && deltaSummary != null && deltaSummary.slower > 0) code = 1;
    if (!(same && d1Ok && d2Ok)) code = 2;
    if (code != 0) System.exit(code);
  }

  private static DotCheckpointEngine runCheckpoint(
      List<String> chunks, Consumer<DotCheckpointEngine.Options> configure) {
    return runCheckpoint(chunks, configure, true);
  }

  private static DotCheckpointEngine runCheckpoint(
      List<String> chunks, Consumer<DotCheckpointEngine.Options> configure, boolean ingest) {
    DotCheckpointEngine.Options opts =
        DotCheckpointEngine.Options.builder().compat(false).streamProcessing(true).onChunk(d -> {});
    if (configure != null) configure.accept(opts);
    DotCheckpointEngine eng = opts.build();
    if (ingest) {
      for (String c : chunks) eng.push(c);
      eng.finish();
    }
    return eng;
  }

  private static Row bench(
      String name, Work fn, int iters, int warmup, Integer bytes, String note) throws Exception {
    for (int i = 0; i < warmup; i++) fn.run();
    long t0 = System.nanoTime();
    for (int i = 0; i < iters; i++) fn.run();
    double totalMs = (System.nanoTime() - t0) / 1e6;
    double msPerOp = totalMs / iters;
    double opsPerSec = msPerOp > 0 ? 1000.0 / msPerOp : 0.0;
    Double mbPerSec = null;
    if (bytes != null && msPerOp > 0) {
      mbPerSec = (bytes / 1e6) / (msPerOp / 1000.0);
    }
    return new Row(name, iters, totalMs, msPerOp, opsPerSec, bytes, mbPerSec, note);
  }

  private static Map<String, Object> buildFixture(int depth, int breadth) {
    Map<String, Object> root = new LinkedHashMap<>();
    root.put("doc", nest(depth, breadth));
    Map<String, Object> meta = new LinkedHashMap<>();
    meta.put("title", "sdk-timing");
    meta.put("n", breadth * depth);
    root.put("meta", meta);
    return root;
  }

  private static Map<String, Object> nest(int level, int breadth) {
    Map<String, Object> o = new LinkedHashMap<>();
    for (int i = 0; i < breadth; i++) {
      String k = "k" + i;
      if (level <= 0) {
        if (i % 3 == 0) o.put(k, "v-" + i);
        else if (i % 3 == 1) o.put(k, i * 17);
        else o.put(k, i % 2 == 0);
      } else {
        o.put(k, nest(level - 1, breadth));
      }
    }
    List<Object> arr = new ArrayList<>(breadth);
    for (int j = 0; j < breadth; j++) {
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("id", j);
      item.put("tag", "t" + j);
      arr.add(item);
    }
    o.put("arr", arr);
    return o;
  }

  private static String buildLongSessionWire(int phases) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < phases; i++) {
      sb.append(">p").append(i).append('\n');
      sb.append("n:").append(i).append('\n');
      sb.append("tag:t").append(i % 7).append('\n');
      sb.append(".\n");
    }
    return sb.toString();
  }

  private static List<String> splitPhases(String wire) {
    List<String> chunks = new ArrayList<>();
    int start = 0;
    while (true) {
      int i = wire.indexOf(".\n", start);
      if (i < 0) {
        if (start < wire.length()) chunks.add(wire.substring(start));
        break;
      }
      chunks.add(wire.substring(start, i + 2));
      start = i + 2;
    }
    return chunks;
  }

  private static boolean sameTree(Object a, Object b) {
    EncodeOptions opts =
        EncodeOptions.builder()
            .dotPolicy(DotPolicy.NONE)
            .keyOrder(EncodeOptions.KeyOrder.SORTED)
            .build();
    return Encode.encode(a, opts).equals(Encode.encode(b, opts));
  }

  private static int utf8(String s) {
    return s.getBytes(StandardCharsets.UTF_8).length;
  }

  private static int envInt(String key, int fallback) {
    String v = System.getenv(key);
    if (v == null || v.isBlank()) return fallback;
    return Integer.parseInt(v.trim());
  }

  /**
   * Report artifact directory: {@code XAIOP_TIMING_ROOT}, else this Maven module cwd, else {@code
   * cwd/java}, else cwd.
   */
  private static Path timingRoot() {
    String env = System.getenv("XAIOP_TIMING_ROOT");
    if (env != null && !env.isBlank()) {
      return Path.of(env).toAbsolutePath().normalize();
    }
    Path cwd = Path.of("").toAbsolutePath().normalize();
    if (Files.isRegularFile(cwd.resolve("pom.xml"))
        && Files.isDirectory(cwd.resolve("src/main/java"))) {
      return cwd;
    }
    Path javaDir = cwd.resolve("java");
    if (Files.isDirectory(javaDir)) {
      return javaDir.toAbsolutePath().normalize();
    }
    return cwd;
  }

  private static void printTable(List<Row> rows) {
    String[] cols = {"name", "ms/op", "ops/s", "iters", "bytes", "MB/s"};
    List<String[]> data = new ArrayList<>();
    for (Row r : rows) {
      data.add(
          new String[] {
            r.name,
            String.format(Locale.ROOT, "%.4f", r.msPerOp),
            String.format(Locale.ROOT, "%.1f", r.opsPerSec),
            Integer.toString(r.iters),
            r.bytes == null ? "-" : Integer.toString(r.bytes),
            r.mbPerSec == null ? "-" : String.format(Locale.ROOT, "%.2f", r.mbPerSec)
          });
    }
    int[] widths = new int[cols.length];
    for (int i = 0; i < cols.length; i++) {
      widths[i] = cols[i].length();
      for (String[] d : data) widths[i] = Math.max(widths[i], d[i].length());
    }
    System.out.println(formatLine(cols, widths));
    String[] sep = new String[cols.length];
    for (int i = 0; i < cols.length; i++) sep[i] = "-".repeat(widths[i]);
    System.out.println(formatLine(sep, widths));
    for (String[] d : data) System.out.println(formatLine(d, widths));
  }

  private static DeltaSummary printDelta(
      List<Row> current, List<Map<String, Object>> baselineRows, Map<String, Object> meta) {
    Map<String, Double> baseMap = new LinkedHashMap<>();
    for (Map<String, Object> r : baselineRows) {
      Object name = r.get("name");
      Object ms = r.get("msPerOp");
      if (name != null && ms instanceof Number n) {
        baseMap.put(String.valueOf(name), n.doubleValue());
      }
    }
    System.out.println("\n— vs baseline (negative % = faster) —\n");
    if (meta != null) {
      System.out.printf(
          Locale.ROOT,
          "baseline: sdk=%s  java=%s  saved=%s%n",
          meta.getOrDefault("sdk", "?"),
          meta.getOrDefault("java", "?"),
          meta.getOrDefault("savedAt", "?"));
    }
    String[] cols = {"name", "now", "base", "Δ%", "verdict"};
    List<String[]> data = new ArrayList<>();
    int faster = 0;
    int slower = 0;
    int missing = 0;
    for (Row r : current) {
      Double b = baseMap.get(r.name);
      if (b == null || !(b > 0)) {
        missing++;
        data.add(
            new String[] {
              r.name, String.format(Locale.ROOT, "%.4f", r.msPerOp), "-", "-", "new"
            });
        continue;
      }
      double pct = ((r.msPerOp - b) / b) * 100.0;
      String verdict = "≈";
      if (pct <= -3) {
        verdict = "faster";
        faster++;
      } else if (pct >= 3) {
        verdict = "slower";
        slower++;
      }
      data.add(
          new String[] {
            r.name,
            String.format(Locale.ROOT, "%.4f", r.msPerOp),
            String.format(Locale.ROOT, "%.4f", b),
            String.format(Locale.ROOT, "%+.1f", pct),
            verdict
          });
    }
    int[] widths = new int[cols.length];
    for (int i = 0; i < cols.length; i++) {
      widths[i] = cols[i].length();
      for (String[] d : data) widths[i] = Math.max(widths[i], d[i].length());
    }
    System.out.println(formatLine(cols, widths));
    String[] sep = new String[cols.length];
    for (int i = 0; i < cols.length; i++) sep[i] = "-".repeat(widths[i]);
    System.out.println(formatLine(sep, widths));
    for (String[] d : data) System.out.println(formatLine(d, widths));
    System.out.printf(
        Locale.ROOT, "%nfaster=%d  slower=%d  new/missing=%d%n", faster, slower, missing);
    return new DeltaSummary(faster, slower, missing);
  }

  private static String formatLine(String[] cells, int[] widths) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < cells.length; i++) {
      if (i > 0) sb.append("  ");
      sb.append(String.format("%-" + widths[i] + "s", cells[i]));
    }
    return sb.toString();
  }

  private static String prettyJson(Object value) {
    StringBuilder sb = new StringBuilder();
    writePretty(sb, value, 0);
    sb.append('\n');
    return sb.toString();
  }

  @SuppressWarnings("unchecked")
  private static void writePretty(StringBuilder sb, Object value, int indent) {
    if (value == null) {
      sb.append("null");
      return;
    }
    if (value instanceof String || value instanceof Number || value instanceof Boolean) {
      sb.append(Json.stringify(value));
      return;
    }
    if (value instanceof Map<?, ?> map) {
      if (map.isEmpty()) {
        sb.append("{}");
        return;
      }
      sb.append("{\n");
      int i = 0;
      for (Map.Entry<?, ?> e : map.entrySet()) {
        pad(sb, indent + 2);
        sb.append(Json.stringify(String.valueOf(e.getKey()))).append(": ");
        writePretty(sb, e.getValue(), indent + 2);
        if (++i < map.size()) sb.append(',');
        sb.append('\n');
      }
      pad(sb, indent);
      sb.append('}');
      return;
    }
    if (value instanceof List<?> list) {
      if (list.isEmpty()) {
        sb.append("[]");
        return;
      }
      sb.append("[\n");
      for (int i = 0; i < list.size(); i++) {
        pad(sb, indent + 2);
        writePretty(sb, list.get(i), indent + 2);
        if (i + 1 < list.size()) sb.append(',');
        sb.append('\n');
      }
      pad(sb, indent);
      sb.append(']');
      return;
    }
    sb.append(Json.stringify(String.valueOf(value)));
  }

  private static void pad(StringBuilder sb, int n) {
    for (int i = 0; i < n; i++) sb.append(' ');
  }
}
