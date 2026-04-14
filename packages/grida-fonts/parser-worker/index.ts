import type { FontFeature } from "../parse/features";
import type { FvarData } from "../parse/fvar";
import type { StatData } from "../parse/stat";

declare const __dirname: string;

/**
 * A web worker based font parser that offloads parsing to a worker thread.
 */
export class FontParserWorker {
  private worker: Worker;
  private id = 0;
  private readonly callbacks = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();

  constructor() {
    const workerUrl =
      typeof import.meta !== "undefined" &&
      (import.meta as unknown as { url?: string }).url
        ? new URL(
            "./worker.js",
            (import.meta as unknown as { url: string }).url
          )
        : new URL("./worker.js", `file://${__dirname}/`);
    this.worker = new Worker(workerUrl, { type: "module" });
    this.worker.onmessage = (
      ev: MessageEvent<{ id: number; result?: unknown; error?: unknown }>
    ) => {
      const { id, result, error } = ev.data;
      const cb = this.callbacks.get(id);
      if (!cb) return;
      this.callbacks.delete(id);
      if (error) {
        cb.reject(error);
      } else {
        cb.resolve(result);
      }
    };
  }

  /**
   * Parses a font buffer and returns the full Typr parsed result.
   * @param buffer Font data as an ArrayBuffer
   */
  async parse(buffer: ArrayBuffer): Promise<unknown> {
    return this.call("parse", buffer);
  }

  /**
   * Returns structured font details such as variation axes and features.
   * @param buffer Font data as an ArrayBuffer
   */
  async details(buffer: ArrayBuffer): Promise<{
    fvar: FvarData;
    features: FontFeature[];
    stat: StatData;
    postscriptName?: string | null;
  }> {
    return this.call("details", buffer);
  }

  /**
   * Terminates the underlying worker.
   */
  async terminate(): Promise<void> {
    this.worker.terminate();
  }

  // oxlint-disable-next-line typescript/no-explicit-any
  private call(type: string, buffer: ArrayBuffer): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, buffer }, [buffer]);
    });
  }
}
