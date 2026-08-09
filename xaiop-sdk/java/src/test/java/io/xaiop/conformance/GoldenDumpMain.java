package io.xaiop.conformance;

import io.xaiop.Encode;
import io.xaiop.Json;
import io.xaiop.Parse;
import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.Materialize;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JUnit-free golden dump main for Node↔Java parity.
 *
 * <pre>
 * mvn -q -DskipTests test-compile
 * java -cp target/classes:target/test-classes io.xaiop.conformance.GoldenDumpMain
 * </pre>
 *
 * Or via {@code xaiop-sdk/conformance/java/run-dump.mjs}.
 */
public final class GoldenDumpMain {
  private static final String[] PARSE_STREAM = {
    "complex",
    "stream-phases",
    "overwrite-id",
    "delete-phases",
    "at-array-d2",
    "bang-broadcast",
    "d1-named-enter",
    "locate-equals",
    "hash-ignore",
    "at-exact",
  };

  private GoldenDumpMain() {}

  public static void main(String[] args) throws Exception {
    Path fixtures = resolveFixtures(args);
    dumpEncode(fixtures);
    for (String name : PARSE_STREAM) {
      dumpParse(fixtures, name);
    }
    for (String name : PARSE_STREAM) {
      String caseSuffix = "stream-phases".equals(name) ? "phases" : name;
      dumpStream(fixtures, name, caseSuffix);
    }
    System.out.flush();
  }

  private static Path resolveFixtures(String[] args) {
    if (args.length > 0 && !args[0].isBlank()) {
      return Path.of(args[0]).toAbsolutePath().normalize();
    }
    // Prefer cwd = xaiop-sdk/java (Maven); fall back to conformance/fixtures.
    Path fromJavaModule = Path.of("..", "conformance", "fixtures").toAbsolutePath().normalize();
    if (Files.isDirectory(fromJavaModule)) return fromJavaModule;
    Path fromConformance = Path.of("fixtures").toAbsolutePath().normalize();
    if (Files.isDirectory(fromConformance)) return fromConformance;
    throw new IllegalStateException(
        "cannot locate conformance fixtures (pass absolute path as argv[0])");
  }

  private static void dumpEncode(Path fixtures) throws IOException {
    String raw = Files.readString(fixtures.resolve("encode-corpus.json"), StandardCharsets.UTF_8);
    Object parsed = Json.parse(raw);
    if (!(parsed instanceof List<?> corpus)) {
      throw new IllegalStateException("encode-corpus.json must be a JSON array");
    }
    for (int i = 0; i < corpus.size(); i++) {
      String wire = Encode.encode(corpus.get(i));
      LinkedHashMap<String, Object> rec = new LinkedHashMap<>();
      rec.put("case", "encode:" + i);
      rec.put("kind", "encode");
      rec.put("wire", wire);
      emit(rec);
    }
  }

  private static void dumpParse(Path fixtures, String name) throws IOException {
    String wire = Files.readString(fixtures.resolve(name + ".xaiop"), StandardCharsets.UTF_8);
    Object tree = Materialize.materializeSnapshot(Parse.parse(wire));
    LinkedHashMap<String, Object> rec = new LinkedHashMap<>();
    rec.put("case", "parse:" + name);
    rec.put("kind", "parse");
    rec.put("tree", tree);
    emit(rec);
  }

  private static void dumpStream(Path fixtures, String fileStem, String caseSuffix)
      throws IOException {
    String wire = Files.readString(fixtures.resolve(fileStem + ".xaiop"), StandardCharsets.UTF_8);
    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.builder()
            .mergeChunkWindow(false)
            .onChunk(diffs::add)
            .build();
    engine.push(wire);
    engine.finish();
    LinkedHashMap<String, Object> rec = new LinkedHashMap<>();
    rec.put("case", "stream:" + caseSuffix);
    rec.put("kind", "stream");
    rec.put("diffs", diffs);
    rec.put("snapshot", engine.snapshot());
    emit(rec);
  }

  private static void emit(Map<String, Object> record) throws IOException {
    // Always emit UTF-8 bytes — Windows default console charset would corrupt CJK wire.
    byte[] line = (Json.stringify(record) + "\n").getBytes(StandardCharsets.UTF_8);
    System.out.write(line);
  }
}
