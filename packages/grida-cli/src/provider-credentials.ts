// GRIDA-SEC-013 / GRIDA-SEC-014 — invocation overrides before shared provider custody.
import { ProviderCredentialStore } from "@grida/auth/providers";
import {
  ProviderCredentials as ProviderCredentialPolicy,
  type ByokProviderId,
} from "@grida/ai/providers";

/** One command's trusted key reader. Only status() is suitable for CLI output. */
export class ProviderCredentials {
  #values = new Map<ProviderCredentials.Provider, string>();
  #sources = new Map<
    ProviderCredentials.Provider,
    "environment" | "stdin" | "file"
  >();

  private constructor() {}

  /** The host supplies its process environment; no ambient lookup occurs here. */
  static async open(
    options: ProviderCredentials.Options
  ): Promise<ProviderCredentials> {
    const owner = new ProviderCredentials();
    try {
      const { env, stdin, signal, provider: selected } = options;
      if (!env || typeof env !== "object") throw invalid();
      if (selected !== undefined && !isProvider(selected)) throw invalid();
      if (signal !== undefined && !(signal instanceof AbortSignal))
        throw invalid();
      if (signal?.aborted) throw new ProviderCredentials.Failure("cancelled");
      const provider = stdin?.provider;
      const input = stdin?.input;
      if (
        stdin !== undefined &&
        (!isProvider(provider) ||
          !input ||
          (selected !== undefined && provider !== selected))
      )
        throw invalid();

      for (const id of selected === undefined ? providers : [selected]) {
        // An explicitly selected stdin key replaces this slot, even if the
        // environment contains a stale or malformed value for that provider.
        if (id === provider) continue;
        const name = environment[id];
        const value = Object.hasOwn(env, name) ? env[name] : undefined;
        if (value === undefined) continue;
        const key = normalize(id, value);
        owner.#values.set(id, key);
        owner.#sources.set(id, "environment");
      }
      if (isProvider(provider) && input) {
        const key = await readKey(provider, input, signal);
        owner.#values.set(provider, key);
        owner.#sources.set(provider, "stdin");
      }
      // Construct/open custody only after the chosen overrides have succeeded.
      // GG and pure input consumers omit this capability entirely.
      const missing = (selected === undefined ? providers : [selected]).filter(
        (id) => !owner.#values.has(id)
      );
      if (missing.length && options.store) {
        const store = await options.store();
        for (const id of missing) {
          if (signal?.aborted)
            throw new ProviderCredentials.Failure("cancelled");
          const value = await store.read(id);
          if (value === null) continue;
          owner.#values.set(id, normalize(id, value));
          owner.#sources.set(id, "file");
        }
      }
      if (signal?.aborted) throw new ProviderCredentials.Failure("cancelled");
      return owner;
    } catch (error) {
      owner.dispose();
      if (error instanceof ProviderCredentialStore.Failure) throw error;
      throw safeFailure(error);
    }
  }

  /** Trusted SDK injection only; this is never a command or output DTO. */
  get(provider: ProviderCredentials.Provider): string | null {
    if (!isProvider(provider)) throw invalid();
    return this.#values.get(provider) ?? null;
  }

  /** Uninspected provider slots are unconfigured in this invocation owner. */
  status(): readonly ProviderCredentials.Status[] {
    return Object.freeze(
      providers.map((provider) =>
        Object.freeze({
          provider,
          environment: environment[provider],
          configured: this.#values.has(provider),
          source: this.#sources.get(provider) ?? null,
        })
      )
    );
  }

  /** Drop references after the command settles. JS strings cannot be zeroized. */
  dispose(): void {
    this.#values.clear();
    this.#sources.clear();
  }
}

export namespace ProviderCredentials {
  export type Provider = ByokProviderId;
  export type Options = {
    env: Readonly<Record<string, string | undefined>>;
    /** Inspect only this provider; omission reads all slots for provider status. */
    provider?: Provider;
    /** Explicitly allocated stdin; it cannot simultaneously carry command JSON. */
    stdin?: { provider: Provider; input: AsyncIterable<Uint8Array> };
    signal?: AbortSignal;
    /** Lazy native owner supplied by the CLI host; never an ambient home lookup. */
    store?: () => ProviderCredentialStore | Promise<ProviderCredentialStore>;
  };
  export type Status = {
    readonly provider: Provider;
    readonly environment: string;
    readonly configured: boolean;
    readonly source: "environment" | "stdin" | "file" | null;
  };
  export class Failure extends Error {
    readonly name = "ProviderCredentials.Failure";
    constructor(
      readonly code:
        | "invalid_credentials"
        | "credentials_unavailable"
        | "cancelled"
    ) {
      super(
        code === "invalid_credentials"
          ? "Provider key has an invalid format or is a placeholder. Check the provider key format in grida providers --help."
          : code === "cancelled"
            ? "Provider credential input was cancelled."
            : "Provider credential input could not be read."
      );
    }
  }
}

const environment = {
  openrouter: "OPENROUTER_API_KEY",
  vercel: "AI_GATEWAY_API_KEY",
  fal: "FAL_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
} as const satisfies Record<ByokProviderId, string>;
const providers = Object.keys(environment) as ProviderCredentials.Provider[];
const maxBytes = 4096;

function isProvider(value: unknown): value is ProviderCredentials.Provider {
  return typeof value === "string" && Object.hasOwn(environment, value);
}

function invalid(): ProviderCredentials.Failure {
  return new ProviderCredentials.Failure("invalid_credentials");
}

function normalize(provider: ByokProviderId, value: unknown): string {
  try {
    // All CLI sources share first-party policy; custody itself stays opaque.
    return ProviderCredentialPolicy.normalize(provider, value);
  } catch {
    throw invalid();
  }
}

function safeFailure(error: unknown): ProviderCredentials.Failure {
  try {
    if (error instanceof ProviderCredentials.Failure) {
      const code = error.code;
      if (
        code === "invalid_credentials" ||
        code === "credentials_unavailable" ||
        code === "cancelled"
      )
        return new ProviderCredentials.Failure(code);
    }
  } catch {
    // A thrown host value is not safe diagnostic data.
  }
  return new ProviderCredentials.Failure("credentials_unavailable");
}

async function readKey(
  provider: ByokProviderId,
  input: AsyncIterable<Uint8Array>,
  signal: AbortSignal | undefined
): Promise<string> {
  const controller = new AbortController();
  const deadline = performance.now() + 30_000;
  const timer = setTimeout(() => controller.abort(), 30_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const bytes = Buffer.alloc(maxBytes);
  let iterator: AsyncIterator<Uint8Array> | undefined;
  let completed = false;
  let length = 0;
  function check() {
    if (signal?.aborted) throw new ProviderCredentials.Failure("cancelled");
    if (controller.signal.aborted || performance.now() >= deadline)
      throw new ProviderCredentials.Failure("credentials_unavailable");
  }
  function wait<T>(pending: PromiseLike<T> | T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const stop = () => {
        try {
          check();
        } catch (error) {
          reject(error);
        }
      };
      controller.signal.addEventListener("abort", stop, { once: true });
      Promise.resolve(pending).then(
        (value) => {
          controller.signal.removeEventListener("abort", stop);
          try {
            check();
            resolve(value);
          } catch (error) {
            reject(error);
          }
        },
        (error) => {
          controller.signal.removeEventListener("abort", stop);
          reject(error);
        }
      );
      // Observe the pending promise even if an injected iterator aborted while
      // creating it. No late rejection can escape the safe failure boundary.
      stop();
    });
  }
  try {
    check();
    iterator = input[Symbol.asyncIterator]();
    let chunks = 0;
    for (;;) {
      check();
      const chunk = await wait(iterator.next());
      if (chunk.done) {
        completed = true;
        return normalize(provider, bytes.toString("utf8", 0, length));
      }
      const value = chunk.value;
      if (
        !(value instanceof Uint8Array) ||
        value.byteLength > maxBytes - length
      )
        throw invalid();
      bytes.set(value, length);
      length += value.byteLength;
      // A ready/empty input stream must not starve cancellation or the timer.
      if (++chunks % 64 === 0)
        await wait(new Promise<void>((resolve) => setTimeout(resolve, 0)));
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    bytes.fill(0);
    if (!completed) {
      try {
        // Node's stdin iterator destroys its stream here. Cleanup is observed
        // but cannot hold cancellation hostage to an uncooperative input host.
        Promise.resolve(iterator?.return?.()).catch(() => {});
      } catch {
        // Never expose an input owner's cleanup error.
      }
    }
  }
}
