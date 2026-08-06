#!/usr/bin/env node
/**
 * Compile Java tests and run FuzzHarnessMain with a budget.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFORMANCE_ROOT = join(__dirname, "..", "..");
const JAVA_SDK = join(CONFORMANCE_ROOT, "..", "java");
const SEEDS = join(__dirname, "..", "seeds");
const SEP = process.platform === "win32" ? ";" : ":";

function parseArgs(argv) {
  const passthrough = [];
  for (let i = 2; i < argv.length; i++) {
    passthrough.push(argv[i]);
  }
  if (!passthrough.some((a) => a.startsWith("--max") || a === "--max")) {
    passthrough.push("--max=200");
  }
  return passthrough;
}

function runShell(commandLine, cwd) {
  const r = spawnSync(commandLine, {
    cwd,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error) {
    console.error(r.error.message);
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
runShell(`${mvn} -q -DskipTests test-compile`, JAVA_SDK);

const cp = `${join(JAVA_SDK, "target", "classes")}${SEP}${join(JAVA_SDK, "target", "test-classes")}`;
const passthrough = parseArgs(process.argv)
  .map((a) => (/\s/.test(a) ? `"${a}"` : a))
  .join(" ");
const seedsArg = /\s/.test(SEEDS) ? `"${SEEDS}"` : SEEDS;
const cpArg = /\s/.test(cp) ? `"${cp}"` : cp;
const cmd = `java -cp ${cpArg} io.xaiop.conformance.FuzzHarnessMain ${passthrough} ${seedsArg}`;
const run = spawnSync(cmd, {
  cwd: JAVA_SDK,
  encoding: "utf8",
  shell: true,
  stdio: ["ignore", "inherit", "inherit"],
  maxBuffer: 16 * 1024 * 1024,
});
if (run.error) {
  console.error(run.error.message);
  process.exit(1);
}
process.exit(run.status ?? 1);
