// GRIDA-SEC-004 / GRIDA-SEC-006 — one bounded invocation across authorized request/result lanes.
// GRIDA-GG: token — cancellation prevents later submissions; accepted jobs are not recalled.
import { ProviderHttp } from "./http";

/** Internal video invocation: one deadline, including uncooperative host promises. */
export class VideoRequest {
  static readonly maxBytes = 64 * 1024 * 1024;
  static readonly maxEnvelopeBytes =
    Math.ceil(VideoRequest.maxBytes / 3) * 4 + 64 * 1024;
  readonly #http: ProviderHttp;
  readonly #controller = new AbortController();
  readonly #timer: ReturnType<typeof setTimeout>;
  readonly #cleanup = new Set<() => void>();
  readonly #source?: AbortSignal;
  readonly #deadline: number;
  #timedOut = false;
  readonly #abort = () => this.#controller.abort();

  constructor(http: ProviderHttp, signal?: AbortSignal) {
    this.#http = http;
    this.#source = signal;
    this.#deadline = performance.now() + 300_000;
    this.#timer = setTimeout(() => {
      this.#timedOut = true;
      this.#controller.abort();
    }, 300_000);
    try {
      signal?.addEventListener("abort", this.#abort, { once: true });
      if (signal?.aborted) this.#abort();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  check(): void {
    // Timers wake stalled awaits; the monotonic clock also fences continuations
    // when synchronous host work or ready microtasks delayed the timer callback.
    if (!this.signal.aborted && performance.now() >= this.#deadline) {
      this.#timedOut = true;
      this.#controller.abort();
    }
    if (this.signal.aborted)
      throw new VideoRequest.Failure(this.#timedOut ? "timeout" : "aborted");
  }

  /** Settles on deadline even when a supplied promise ignores its signal. */
  wait<T>(pending: PromiseLike<T>): Promise<T> {
    const observed = Promise.resolve(pending);
    try {
      this.check();
    } catch (error) {
      // The host may synchronously abort while returning a rejected promise.
      void observed.catch(() => undefined);
      return Promise.reject(error);
    }
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        remove();
        reject(
          new VideoRequest.Failure(this.#timedOut ? "timeout" : "aborted")
        );
      };
      const remove = () => this.signal.removeEventListener("abort", abort);
      this.signal.addEventListener("abort", abort, { once: true });
      observed.then(
        (value) => {
          remove();
          try {
            this.check();
            resolve(value);
          } catch (error) {
            reject(error);
          }
        },
        (error: unknown) => {
          remove();
          reject(error);
        }
      );
    });
  }

  /** Request bodies are streamed through a byte cap before an SDK/JSON parser sees them. */
  async request(
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
    maximum = 1024 * 1024
  ): Promise<Response> {
    this.check();
    const pending = this.#http
      .request(input, { ...init, signal: this.signal })
      .then((response) => {
        if (this.signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          this.check();
        }
        return this.#bounded(response, maximum);
      });
    return this.wait(pending);
  }

  async json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.request(url, init);
    this.check();
    if (!response.ok) throw new VideoRequest.Failure("generation_failed");
    return this.wait(response.json() as Promise<T>);
  }

  async download(url: URL, maximum: number) {
    this.check();
    return this.wait(
      this.#http.downloadProviderAsset(url, {
        signal: this.signal,
        max_bytes: maximum,
      })
    );
  }

  /** The fixed provider adapter can use existing shared GG/queue machinery. */
  transport(maximum = 1024 * 1024): ProviderHttp {
    return new ProviderHttp({
      request: (input, init) => this.request(input, init, maximum),
      download: async () => {
        throw new VideoRequest.Failure("invalid_response");
      },
    });
  }

  dispose(): void {
    clearTimeout(this.#timer);
    try {
      this.#source?.removeEventListener("abort", this.#abort);
    } catch {
      /* Host signal. */
    }
    this.#controller.abort();
    for (const cleanup of this.#cleanup) cleanup();
    this.#cleanup.clear();
  }

  #bounded(response: Response, maximum: number): Response {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maximum) {
      void response.body?.cancel().catch(() => undefined);
      throw new VideoRequest.Failure("invalid_response");
    }
    if (!response.body) return response;
    const reader = response.body.getReader();
    let total = 0;
    let closed = false;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const finish = (error?: unknown) => {
      if (closed) return;
      closed = true;
      this.signal.removeEventListener("abort", abort);
      this.#cleanup.delete(abort);
      if (error !== undefined) controller.error(error);
      // Cancellation must not let an uncooperative host delay the public result.
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    };
    const abort = () =>
      finish(new VideoRequest.Failure(this.#timedOut ? "timeout" : "aborted"));
    const stream = new ReadableStream<Uint8Array>({
      start: (value) => {
        controller = value;
      },
      pull: async () => {
        try {
          this.check();
          const item = await this.wait(reader.read());
          if (closed) return;
          if (item.done) {
            controller.close();
            finish();
            return;
          }
          total += item.value.byteLength;
          if (total > maximum)
            throw new VideoRequest.Failure("invalid_response");
          controller.enqueue(item.value);
        } catch (error) {
          finish(error);
        }
      },
      cancel: () => finish(),
    });
    this.#cleanup.add(abort);
    this.signal.addEventListener("abort", abort, { once: true });
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
}

export namespace VideoRequest {
  export class Failure extends Error {
    constructor(
      readonly code:
        | "timeout"
        | "aborted"
        | "invalid_response"
        | "generation_failed"
    ) {
      super(code);
    }
  }
}
