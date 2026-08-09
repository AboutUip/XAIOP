package io.xaiop.timing;

import io.xaiop.DotPolicy;
import io.xaiop.Encode;
import io.xaiop.EncodeOptions;
import io.xaiop.Json;
import io.xaiop.Parse;
import io.xaiop.Xaiop;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Fair JSON gate: Node JSON.parse vs io.xaiop.Json.parse vs Parse.parse.
 *
 * <pre>
 *   cd xaiop-sdk/timing
 *   npm run bench:java:json-gate
 *   npm run bench:java:json-gate:quick
 * </pre>
 *
 * <p>Note: JDK has no standard Map JSON parser; secondary gate uses {@link Json#parse}
 * (same product tree shape as Parse). Not Jackson.
 */
public final class JsonGateMain {
  private JsonGateMain() {}

  public static void main(String[] args) throws Exception {
    boolean quick = false;
    int itersArg = 0;
    int warmupArg = 0;
    for (String a : args) {
      if ("--quick".equals(a)) quick = true;
      else if (a.startsWith("--iters=")) itersArg = Integer.parseInt(a.substring(8));
      else if (a.startsWith("--warmup=")) warmupArg = Integer.parseInt(a.substring(9));
    }

    int depth = quick ? 2 : 3;
    int breadth = quick ? 5 : 8;
    int iters = itersArg > 0 ? itersArg : (quick ? 200 : 400);
    int warmup = warmupArg > 0 ? warmupArg : (quick ? 20 : 40);

    Map<String, Object> fixture = buildFixture(depth, breadth);
    String jsonText = Json.stringify(fixture);
    String wire =
        Encode.encode(
            fixture,
            EncodeOptions.builder()
                .dotPolicy(DotPolicy.NONE)
                .keyOrder(EncodeOptions.KeyOrder.INSERTION)
                .build());

    for (int i = 0; i < warmup; i++) {
      Json.parse(jsonText);
      Parse.parse(wire);
    }

    double javaJsonNs = bestOf(3, iters, () -> Json.parse(jsonText));
    double javaParseNs = bestOf(3, iters, () -> Parse.parse(wire));
    double nodeNs = nodeJsonNs(jsonText, iters, warmup);

    double ratioNode = javaParseNs / nodeNs;
    double ratioJava = javaParseNs / javaJsonNs;
    boolean primaryPass = ratioNode <= 1.2;
    boolean secondaryPass = ratioJava <= 1.2;
    double javaJsonOverNode = javaJsonNs / nodeNs;

    Map<String, Object> report = new LinkedHashMap<>();
    report.put("quick", quick);
    report.put("depth", depth);
    report.put("breadth", breadth);
    report.put("iters", iters);
    report.put("warmup", warmup);
    report.put("nodeJsonNsPerOp", nodeNs);
    report.put("javaJsonNsPerOp", javaJsonNs);
    report.put("javaParseNsPerOp", javaParseNs);
    report.put("ratioParseOverNodeJSON", ratioNode);
    report.put("ratioParseOverJavaJSON", ratioJava);
    report.put("primaryGatePass", primaryPass);
    report.put("secondaryGatePass", secondaryPass);
    report.put("javaJsonOverNodeJSON", javaJsonOverNode);
    report.put("jsonBytes", jsonText.getBytes(StandardCharsets.UTF_8).length);
    report.put("wireBytes", wire.getBytes(StandardCharsets.UTF_8).length);
    report.put("sdk", Xaiop.SDK_VERSION);
    report.put("javaJsonImpl", "io.xaiop.Json.parse (not Jackson)");

    Path root = timingRoot();
    Path out = root.resolve("last-json-gate.json");
    Files.writeString(out, Json.stringify(report) + "\n", StandardCharsets.UTF_8);

    System.out.println("XAIOP Java Parse <-> JSON gate");
    System.out.printf(
        Locale.ROOT, "  fixture depth=%d breadth=%d iters=%d%n", depth, breadth, iters);
    System.out.printf(Locale.ROOT, "  Node JSON.parse     %.4f ms/op%n", nodeNs / 1e6);
    System.out.printf(Locale.ROOT, "  Java Json.parse     %.4f ms/op%n", javaJsonNs / 1e6);
    System.out.printf(Locale.ROOT, "  Java Parse.parse    %.4f ms/op%n", javaParseNs / 1e6);
    System.out.printf(
        Locale.ROOT,
        "  Parse / NodeJSON    %.3fx  (primary <= 1.2)  %s%n",
        ratioNode,
        primaryPass ? "PASS" : "FAIL");
    System.out.printf(
        Locale.ROOT,
        "  Parse / JavaJSON    %.3fx  (secondary <= 1.2)  %s%n",
        ratioJava,
        secondaryPass ? "PASS" : "FAIL");
    System.out.println(
        "  note: secondary uses io.xaiop.Json.parse (JDK has no Map JSON; not Jackson)");
    if (javaJsonOverNode > 1.2) {
      System.out.printf(
          Locale.ROOT,
          "  note: Json.parse is %.2fx Node JSON.parse (JVM/runtime floor)%n",
          javaJsonOverNode);
    }
    System.out.println("  wrote " + out.toAbsolutePath());

    if (!primaryPass && "1".equals(System.getenv("BENCH_FAIL_GATE"))) {
      System.exit(2);
    }
  }

  private static Path timingRoot() {
    String env = System.getenv("XAIOP_TIMING_ROOT");
    if (env != null && !env.isBlank()) return Path.of(env);
    // Prefer timing/java when launched from xaiop-sdk/timing (npm scripts).
    Path cwd = Path.of(".").toAbsolutePath().normalize();
    Path asJava = cwd.resolve("java");
    if (Files.isDirectory(asJava) && Files.isRegularFile(asJava.resolve("pom.xml"))) {
      return asJava;
    }
    if (cwd.getFileName() != null && "java".equals(cwd.getFileName().toString())) {
      return cwd;
    }
    return cwd;
  }

  private static Map<String, Object> nest(int level, int breadth) {
    LinkedHashMap<String, Object> o = new LinkedHashMap<>();
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
      LinkedHashMap<String, Object> el = new LinkedHashMap<>();
      el.put("id", j);
      el.put("tag", "t" + j);
      arr.add(el);
    }
    o.put("arr", arr);
    return o;
  }

  private static Map<String, Object> buildFixture(int depth, int breadth) {
    LinkedHashMap<String, Object> meta = new LinkedHashMap<>();
    meta.put("title", "sdk-timing");
    meta.put("n", breadth * depth);
    LinkedHashMap<String, Object> fixture = new LinkedHashMap<>();
    fixture.put("doc", nest(depth, breadth));
    fixture.put("meta", meta);
    return fixture;
  }

  @FunctionalInterface
  private interface Work {
    void run();
  }

  private static double timeLoop(int iters, Work fn) {
    long t0 = System.nanoTime();
    for (int i = 0; i < iters; i++) fn.run();
    return (double) (System.nanoTime() - t0) / (double) iters;
  }

  private static double bestOf(int rounds, int iters, Work fn) {
    double best = timeLoop(iters, fn);
    for (int r = 1; r < rounds; r++) {
      double ns = timeLoop(iters, fn);
      if (ns < best) best = ns;
    }
    return best;
  }

  private static double nodeJsonNs(String jsonText, int iters, int warmup) throws Exception {
    Path root = timingRoot();
    Path timingParent = root.getFileName().toString().equals("java") ? root.getParent() : root;
    Path probe = timingParent.resolve("node_json_probe.mjs");
    Path tmp = root.resolve("_gate_fixture.json");
    Files.writeString(tmp, jsonText, StandardCharsets.UTF_8);
    try {
      ProcessBuilder pb =
          new ProcessBuilder(
              "node",
              probe.toAbsolutePath().toString(),
              tmp.toAbsolutePath().toString(),
              String.valueOf(iters),
              String.valueOf(warmup));
      pb.directory(timingParent.toFile());
      pb.redirectError(ProcessBuilder.Redirect.INHERIT);
      Process p = pb.start();
      String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
      int code = p.waitFor();
      if (code != 0) {
        throw new IllegalStateException("node JSON.parse probe failed with exit " + code);
      }
      return Double.parseDouble(out);
    } finally {
      try {
        Files.deleteIfExists(tmp);
      } catch (Exception ignored) {
        // best-effort cleanup
      }
    }
  }
}
