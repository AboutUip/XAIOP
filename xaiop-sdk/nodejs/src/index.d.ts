/**
 * XAIOP Node.js SDK (protocol v0.1.0 Frozen)
 */

export const PROTOCOL_VERSION: "0.1.0";

export class XaiopSyntaxError extends Error {
  line?: number;
  constructor(message: string, meta?: { line?: number });
}

export function parseSync(source: string): unknown;
export function parseAsync(source: string): Promise<unknown>;

export class XaiopEngine {
  constructor();
  upload(source: string): Promise<string>;
  uploadSync(source: string): string;
  get(dataId: string): Promise<unknown>;
  getSync(dataId: string): unknown;
  has(dataId: string): boolean;
  delete(dataId: string): boolean;
  clear(): void;
  static parse(source: string): Promise<unknown>;
  static parseSync(source: string): unknown;
}
