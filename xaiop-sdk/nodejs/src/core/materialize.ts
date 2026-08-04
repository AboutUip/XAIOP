// @ts-nocheck
/**
 * Materialize parser output into a JSON-facing snapshot value.
 *
 * Root fragments (`XaiopFragment`) become their `entries` object for Snapshot/Diff
 * surfaces (PROT-STREAM JSON-facing). The wire fragment notation remains available
 * via engine/static parse when not streaming.
 */

import { XaiopFragment } from "./parse.js";
import { cloneJson } from "./clone.js";

/**
 * Deep-cloned JSON snapshot (safe to retain / mutate independently of the parser).
 * @param {unknown} parsed
 * @returns {unknown}
 */
export function materializeSnapshot(parsed) {
  if (parsed instanceof XaiopFragment) {
    return cloneJson(parsed.entries);
  }
  return cloneJson(parsed);
}

/**
 * Transfer parser output into a JSON-facing value **without** cloning a plain
 * document root (ownership moves to the caller). Fragments still deep-clone
 * `entries` because the live parser may retain nested references.
 *
 * Use only when the parse result will not be reused by the parser.
 * @param {unknown} parsed
 * @returns {unknown}
 */
export function materializeOwned(parsed) {
  if (parsed instanceof XaiopFragment) {
    return cloneJson(parsed.entries);
  }
  return parsed;
}
