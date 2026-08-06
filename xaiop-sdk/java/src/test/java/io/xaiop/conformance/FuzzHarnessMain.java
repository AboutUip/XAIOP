package io.xaiop.conformance;

import io.xaiop.Parse;
import io.xaiop.XaiopSyntaxError;
import io.xaiop.stream.DotCheckpointEngine;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * JUnit-free mutation fuzz main. Syntax errors are expected; other throwables fail.
 *
 * <pre>
 * java -cp target/classes:target/test-classes io.xaiop.conformance.FuzzHarnessMain \
 *   --max=200 --seed=1 /path/to/fuzz/seeds
 * </pre>
 */
public final class FuzzHarnessMain {
  private static final String[] INSERT_LINES = {
    ">", "a:1", ".", "&x", "#note", "@a", "!a", "<", "-", ":item", "=a"
  };

  private FuzzHarnessMain() {}

  public static void main(String[] args) throws Exception {
    int max = 200;
    long seed = System.currentTimeMillis();
    Path seedsDir = null;
    for (int i = 0; i < args.length; i++) {
      String a = args[i];
      if (a.startsWith("--max=")) max = Math.max(1, Integer.parseInt(a.substring(6)));
      else if (a.equals("--max")) max = Math.max(1, Integer.parseInt(args[++i]));
      else if (a.startsWith("--seed=")) seed = Long.parseLong(a.substring(7));
      else if (a.equals("--seed")) seed = Long.parseLong(args[++i]);
      else if (!a.startsWith("-")) seedsDir = Path.of(a);
    }
    if (seedsDir == null) {
      Path guess = Path.of("..", "conformance", "fuzz", "seeds").toAbsolutePath().normalize();
      if (Files.isDirectory(guess)) seedsDir = guess;
      else throw new IllegalArgumentException("pass seeds directory path");
    }

    List<String> seeds = loadSeeds(seedsDir);
    if (seeds.isEmpty()) throw new IllegalStateException("no .xaiop seeds in " + seedsDir);

    java.util.Random rnd = new java.util.Random(seed);
    int syntax = 0;
    int ok = 0;
    long deadline = System.currentTimeMillis() + 30_000L;

    for (int i = 0; i < max; i++) {
      if (System.currentTimeMillis() > deadline) {
        System.err.println("fuzz-java: time budget hit after " + i + " iterations");
        break;
      }
      String text = seeds.get(rnd.nextInt(seeds.size()));
      int muts = 1 + rnd.nextInt(4);
      for (int m = 0; m < muts; m++) text = mutate(text, rnd);

      try {
        Parse.parse(text);
        ok++;
      } catch (XaiopSyntaxError e) {
        syntax++;
      } catch (Throwable t) {
        System.err.println("fuzz-java: unexpected parse error at iter " + i + ": " + t);
        t.printStackTrace(System.err);
        System.exit(1);
      }

      try {
        List<Object> diffs = new ArrayList<>();
        DotCheckpointEngine engine =
            DotCheckpointEngine.Options.builder()
                .mergeChunkWindow(false)
                .onChunk(diffs::add)
                .build();
        engine.push(text);
        engine.finish();
      } catch (XaiopSyntaxError e) {
        syntax++;
      } catch (Throwable t) {
        System.err.println("fuzz-java: unexpected stream error at iter " + i + ": " + t);
        t.printStackTrace(System.err);
        System.exit(1);
      }
    }

    System.out.printf(
        "fuzz-java OK seed=%d max=%d parseOk~%d syntaxErrors~%d%n", seed, max, ok, syntax);
  }

  private static List<String> loadSeeds(Path dir) throws IOException {
    List<String> out = new ArrayList<>();
    try (Stream<Path> stream = Files.list(dir)) {
      for (Path p : stream.filter(f -> f.getFileName().toString().endsWith(".xaiop")).toList()) {
        out.add(Files.readString(p, StandardCharsets.UTF_8));
      }
    }
    return out;
  }

  private static String mutate(String text, java.util.Random rnd) {
    int op = rnd.nextInt(4);
    if (op == 0 && !text.isEmpty()) {
      int i = rnd.nextInt(text.length());
      char c = (char) (32 + rnd.nextInt(95));
      return text.substring(0, i) + c + text.substring(i + 1);
    }
    if (op == 1) {
      String line = INSERT_LINES[rnd.nextInt(INSERT_LINES.length)];
      String[] lines = text.split("\n", -1);
      int at = rnd.nextInt(lines.length + 1);
      StringBuilder sb = new StringBuilder();
      for (int i = 0; i < lines.length; i++) {
        if (i == at) {
          if (sb.length() > 0) sb.append('\n');
          sb.append(line);
        }
        if (sb.length() > 0) sb.append('\n');
        sb.append(lines[i]);
      }
      if (at == lines.length) {
        if (sb.length() > 0) sb.append('\n');
        sb.append(line);
      }
      return sb.toString();
    }
    if (op == 2 && !text.isEmpty()) {
      return text.substring(0, rnd.nextInt(text.length()));
    }
    String[] lines = text.split("\n", -1);
    if (lines.length == 0) return text + "\n>";
    int i = rnd.nextInt(lines.length);
    StringBuilder sb = new StringBuilder();
    for (int j = 0; j < lines.length; j++) {
      if (j == i) {
        if (sb.length() > 0) sb.append('\n');
        sb.append(lines[j]);
      }
      if (sb.length() > 0) sb.append('\n');
      sb.append(lines[j]);
    }
    return sb.toString();
  }
}
