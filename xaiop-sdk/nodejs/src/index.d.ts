/**
 * XAIOP Node.js SDK (protocol v0.1.0 Frozen)
 */

export const PROTOCOL_VERSION: "0.1.0";

export class XaiopSyntaxError extends Error {
  line?: number;
  constructor(message: string, meta?: { line?: number });
}

export class XaiopFragment {
  entries: Record<string, unknown>;
  readonly isFragment: true;
  constructor(entries: Record<string, unknown>);
  notation(): string;
}

/** @param compatibilityMode when true, force complete root if needed + pop-and-retry */
export function parseSync(
  source: string,
  compatibilityMode?: boolean,
): unknown | XaiopFragment;
/** @param compatibilityMode when true, force complete root if needed + pop-and-retry */
export function parseAsync(
  source: string,
  compatibilityMode?: boolean,
): Promise<unknown | XaiopFragment>;

export class XaiopEngine {
  constructor(options?: { compatibilityMode?: boolean });
  /** Whether compatibility mode is enabled (default false). */
  readonly compatibilityMode: boolean;
  /** Enable/disable compatibility mode (forced root + pop-and-retry). */
  setCompatibilityMode(enabled: boolean): this;
  upload(source: string): Promise<string>;
  uploadSync(source: string): string;
  get(dataId: string): Promise<unknown>;
  getSync(dataId: string): unknown;
  has(dataId: string): boolean;
  delete(dataId: string): boolean;
  clear(): void;
  /**
   * @param compatibilityMode omitted / false = strict (default); true = forced root + pop-and-retry
   */
  static parse(source: string, compatibilityMode?: boolean): Promise<unknown>;
  /**
   * @param compatibilityMode omitted / false = strict (default); true = forced root + pop-and-retry
   */
  static parseSync(source: string, compatibilityMode?: boolean): unknown;
}
