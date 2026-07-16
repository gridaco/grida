declare const console: {
  log(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};

declare function setTimeout(handler: () => void, timeout?: number): unknown;
declare function clearTimeout(handle: unknown): void;

/** WHATWG URL — universal (browsers + Node). Only the members the neutral
 *  surface touches (endpoint base_url validation). */
declare class URL {
  constructor(url: string, base?: string | URL);
  protocol: string;
  username: string;
  password: string;
}
