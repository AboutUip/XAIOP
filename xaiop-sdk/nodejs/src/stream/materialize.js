/**
 * Materialize parser output into a JSON-facing snapshot value.
 *
 * Root fragments (`XaiopFragment`) become their `entries` object for Snapshot/Diff
 * surfaces (PROT-STREAM JSON-facing). The wire fragment notation remains available
 * via engine/static parse when not streaming.
 */

import { XaiopFragment } from "../parse.js";
import { cloneJson } from "../clone.js";

/**
 * @param {unknown} parsed
 * @returns {unknown}
 */
export function materializeSnapshot(parsed) {
  if (parsed instanceof XaiopFragment) {
    return cloneJson(parsed.entries);
  }
  return cloneJson(parsed);
}
