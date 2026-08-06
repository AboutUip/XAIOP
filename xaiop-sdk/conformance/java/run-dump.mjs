#!/usr/bin/env node
/**
 * Compile Java test sources and run GoldenDumpMain → NDJSON.
 * Portable Windows / Linux classpath handling.
 *
 * Usage:
 *   node run-dump.mjs              # stdout (UTF-8)
 *   node run-dump.mjs --out path   # write UTF-8 file
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFORMANCE_ROOT = join(__dirname, "..");
const JAVA_SDK = join(CONFORMANCE_ROOT, "..", "java");
const FIXTURES = join(CONFORMANCE_ROOT, "fixtures");
const SEP = process.platform === "win32" ? ";" : ":";

function parseOutPath(argv) {
  const i = argv.indexOf("--out");
  if (i >= 0) return argv[i + 1] ?? join(CONFORMANCE_ROOT, "out", "java.ndjson");
  const eq = argv.find((a) => a.startsWith("--out="));
  if (eq) return eq.slice(6);
  return null;
}

/** Run a command; on Windows prefer cmd.exe /c for .cmd tools with spaced PATH entries. */
function run(command, args, opts = {}) {
  const cwd = opts.cwd ?? JAVA_SDK;
  let r;
  if (process.platform === "win32") {
    // Quote each arg; avoid spawn({shell:true}) path-with-spaces breakage.
    const quoted = [command, ...args]
      .map((a) => (/\s/.test(a) ? `"${a}"` : a))
      .join(" ");
    r = spawnSync(quoted, {
      cwd,
      encoding: "utf8",
      shell: true,
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    });
  } else {
    r = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      shell: false,
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    });
  }
  if (r.error) {
    console.error(`failed to spawn ${command}:`, r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    if (r.stdout) process.stderr.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    process.exit(r.status ?? 1);
  }
  return r;
}

const mvn = process.platform === "win32" ? "mvn.cmd" : "mvn";
run(mvn, ["-q", "-DskipTests", "test-compile"]);

const classes = join(JAVA_SDK, "target", "classes");
const testClasses = join(JAVA_SDK, "target", "test-classes");
if (!existsSync(join(testClasses, "io", "xaiop", "conformance", "GoldenDumpMain.class"))) {
  console.error("GoldenDumpMain.class missing after test-compile");
  process.exit(1);
}

const cp = `${classes}${SEP}${testClasses}`;
const javaArgs = ["-cp", cp, "io.xaiop.conformance.GoldenDumpMain", FIXTURES];
let dump;
if (process.platform === "win32") {
  const quoted = ["java", ...javaArgs]
    .map((a) => (/\s/.test(a) ? `"${a}"` : a))
    .join(" ");
  dump = spawnSync(quoted, {
    cwd: JAVA_SDK,
    encoding: "utf8",
    shell: true,
    maxBuffer: 32 * 1024 * 1024,
  });
} else {
  dump = spawnSync("java", javaArgs, {
    cwd: JAVA_SDK,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

if (dump.error) {
  console.error("failed to spawn java:", dump.error.message);
  process.exit(1);
}
if (dump.status !== 0) {
  if (dump.stdout) process.stderr.write(dump.stdout);
  if (dump.stderr) process.stderr.write(dump.stderr);
  process.exit(dump.status ?? 1);
}

const body = dump.stdout ?? "";
const outPath = parseOutPath(process.argv);
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, body, "utf8");
} else {
  process.stdout.write(body);
}
