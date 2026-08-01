#!/usr/bin/env node
/**
 * XAIOP Node.js demo — type (or pipe) XAIOP text, get pretty JSON.
 *
 * Usage:
 *   node demo.js
 *   node demo.js path/to/file.xaiop
 *   Get-Content file.xaiop | node demo.js
 *
 * Interactive: paste XAIOP, then end input with a line containing only: END
 *   (or Ctrl+Z Enter on Windows / Ctrl+D on Unix when piping is not used)
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
  PROTOCOL_VERSION,
  XaiopEngine,
  XaiopSyntaxError,
} from "../../xaiop-sdk/nodejs/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const fileArg = process.argv[2];
  let source;

  if (fileArg) {
    const resolved = path.resolve(process.cwd(), fileArg);
    source = fs.readFileSync(resolved, "utf8");
    console.log(`# file: ${resolved}`);
  } else if (!process.stdin.isTTY) {
    source = await readStdin();
  } else {
    source = await readInteractive();
  }

  source = source.replace(/^\uFEFF/, "");
  if (!source.trim()) {
    console.error("No XAIOP input.");
    process.exitCode = 1;
    return;
  }

  const engine = new XaiopEngine();
  try {
    const dataId = await engine.upload(source);
    const json = await engine.get(dataId);
    render(json, dataId);
  } catch (err) {
    renderError(err);
    process.exitCode = 1;
  }
}

/**
 * @param {unknown} json
 * @param {string} dataId
 */
function render(json, dataId) {
  const bar = "─".repeat(48);
  console.log("");
  console.log(bar);
  console.log(` XAIOP → JSON  (protocol ${PROTOCOL_VERSION})`);
  console.log(` data id: ${dataId}`);
  console.log(bar);
  console.log(JSON.stringify(json, null, 2));
  console.log(bar);
  console.log("");
}

/** @param {unknown} err */
function renderError(err) {
  const bar = "─".repeat(48);
  console.error("");
  console.error(bar);
  console.error(" Parse failed");
  console.error(bar);
  if (err instanceof XaiopSyntaxError) {
    console.error(`XaiopSyntaxError${err.line != null ? ` @ line ${err.line}` : ""}`);
    console.error(err.message);
  } else if (err instanceof Error) {
    console.error(err.message);
  } else {
    console.error(String(err));
  }
  console.error(bar);
  console.error("");
}

/** @returns {Promise<string>} */
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

/** @returns {Promise<string>} */
function readInteractive() {
  const sample = path.resolve(
    __dirname,
    "../../docs/examples/complex.xaiop",
  );

  console.log(`XAIOP Node.js demo (protocol ${PROTOCOL_VERSION})`);
  console.log("Paste XAIOP text. Finish with a line that is only: END");
  console.log(`Tip: try the fixture — node demo.js ${path.relative(process.cwd(), sample)}`);
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const lines = [];
  rl.setPrompt("> ");
  rl.prompt();

  return new Promise((resolve) => {
    rl.on("line", (line) => {
      if (line.trim() === "END") {
        rl.close();
        resolve(lines.join("\n"));
        return;
      }
      lines.push(line);
      rl.prompt();
    });
    rl.on("close", () => {
      if (lines.length) resolve(lines.join("\n"));
      else resolve("");
    });
  });
}

main();
