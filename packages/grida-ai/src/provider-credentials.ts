// GRIDA-SEC-004 — explicit first-party credential checks over host-authorized HTTP.
import type { ProviderHttp } from "./http";
import { isByokProviderId, type ByokProviderId } from "./provider-ids";

const MAX_KEY_BYTES = 4096;
const MAX_RESPONSE_BYTES = 64 * 1024;
const CHECK_TIMEOUT_MS = 10_000;
const FAL_ENDPOINT = "fal-ai/flux/dev";

/**
 * First-party BYOK admission policy; never a credential store.
 * Construction and normalization perform no I/O. Only an explicit check sends
 * its supplied key, once, to that provider's fixed read-only endpoint.
 */
export class ProviderCredentials {
  readonly #http: ProviderHttp;

  constructor({ http }: { http: ProviderHttp }) {
    this.#http = http;
  }

  /** Returns the normalized secret to its caller; never log this return value. */
  static normalize(provider: ByokProviderId, input: unknown): string {
    if (
      !isByokProviderId(provider) ||
      typeof input !== "string" ||
      input.length > MAX_KEY_BYTES ||
      new TextEncoder().encode(input).byteLength > MAX_KEY_BYTES
    ) {
      throw new ProviderCredentials.Failure("invalid_input");
    }
    const key = input.trim();
    if (!/^[\x21-\x7e]+$/.test(key) || /^PASTE_.*_KEY_HERE$/i.test(key)) {
      throw new ProviderCredentials.Failure("invalid_input");
    }

    // These identities name first-party connections. An OpenAI-compatible
    // custom base URL cannot inherit their format rules or check endpoints.
    switch (provider) {
      case "openrouter":
        if (!key.startsWith("sk-or-") || key.length === "sk-or-".length)
          throw new ProviderCredentials.Failure("invalid_input");
        break;
      case "vercel":
        // vck_ is the current format. Official docs do not retire older opaque
        // keys, so an absent prefix is not evidence that the key is invalid.
        if (key === "vck_")
          throw new ProviderCredentials.Failure("invalid_input");
        break;
      case "fal": {
        const parts = key.split(":");
        if (parts.length !== 2 || !parts[0] || !parts[1])
          throw new ProviderCredentials.Failure("invalid_input");
        break;
      }
      case "tripo":
      case "elevenlabs":
        // Opaque by documented contract; no inferred prefix or suffix grammar.
        break;
      default:
        provider satisfies never;
        throw new ProviderCredentials.Failure("invalid_input");
    }
    return key;
  }

  /** Acceptance is transient and proves neither model access nor affordability. */
  async check({
    provider,
    key: input,
    signal,
  }: {
    provider: ByokProviderId;
    key: string;
    signal?: AbortSignal;
  }): Promise<ProviderCredentials.CheckResult> {
    const key = ProviderCredentials.normalize(provider, input);
    if (signal?.aborted) throw new ProviderCredentials.Failure("aborted");
    // User Read is an extra ElevenLabs permission; public models prove nothing.
    if (provider === "elevenlabs")
      return Object.freeze({ status: "not_supported" });

    // Exhaustive and private: adding a provider cannot inherit another one's
    // authenticated destination merely by extending the identity vocabulary.
    const urls = {
      tripo: "https://openapi.tripo3d.ai/v3/account/balance",
      openrouter: "https://openrouter.ai/api/v1/key",
      vercel: "https://ai-gateway.vercel.sh/v1/credits",
      fal: `https://api.fal.ai/v1/models/pricing?endpoint_id=${FAL_ENDPOINT}`,
    } satisfies Record<Exclude<ByokProviderId, "elevenlabs">, string>;
    const url = urls[provider];
    const controller = new AbortController();
    const deadline = performance.now() + CHECK_TIMEOUT_MS;
    let timedOut = false;
    const abort = () => controller.abort();
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, CHECK_TIMEOUT_MS);
    const check = () => {
      if (!controller.signal.aborted && performance.now() >= deadline) {
        timedOut = true;
        abort();
      }
      if (controller.signal.aborted)
        throw new CheckFailure(timedOut ? "timeout" : "aborted");
    };
    // Every pending host operation has its own removable abort subscription;
    // neither transport nor stream cancellation may hold public completion.
    const wait = <T>(pending: PromiseLike<T>): Promise<T> =>
      new Promise((resolve, reject) => {
        const interrupted = () => {
          remove();
          reject(new CheckFailure(timedOut ? "timeout" : "aborted"));
        };
        const remove = () =>
          controller.signal.removeEventListener("abort", interrupted);
        controller.signal.addEventListener("abort", interrupted, {
          once: true,
        });
        Promise.resolve(pending).then(
          (value) => {
            remove();
            try {
              check();
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
        if (controller.signal.aborted) interrupted();
      });
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      check();
      const pending = this.#http
        .request(url, {
          method: "GET",
          headers: {
            Authorization: `${provider === "fal" ? "Key" : "Bearer"} ${key}`,
            Accept: "application/json",
          },
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        })
        .then((value) => {
          // A late response must release its stream after the public operation
          // has already timed out or been cancelled.
          try {
            check();
          } catch (error) {
            void value.body?.cancel().catch(() => undefined);
            throw error;
          }
          return value;
        });
      response = await wait(pending);
      check();
      if (
        response.redirected ||
        response.type === "opaqueredirect" ||
        (response.status >= 300 && response.status < 400) ||
        (response.url !== "" && response.url !== url)
      )
        throw new CheckFailure("invalid_response");
      if (response.status === 401)
        throw new CheckFailure("credential_rejected");
      if (response.status === 403) throw new CheckFailure("access_denied");
      if (response.status !== 200) throw new CheckFailure("unavailable");
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES)
        throw new CheckFailure("invalid_response");
      if (!response.body) throw new CheckFailure("invalid_response");

      reader = response.body.getReader();
      const bytes = new Uint8Array(MAX_RESPONSE_BYTES);
      let size = 0;
      let reads = 0;
      for (;;) {
        // Repeated immediately-ready empty chunks must let deadline timers run.
        if (reads++ > 0 && reads % 64 === 0)
          await wait(new Promise<void>((resolve) => setTimeout(resolve, 0)));
        check();
        const { done, value } = await wait(reader.read());
        if (done) break;
        if (value.byteLength > MAX_RESPONSE_BYTES - size)
          throw new CheckFailure("invalid_response");
        bytes.set(value, size);
        size += value.byteLength;
      }
      let data: unknown;
      try {
        data = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(0, size)
          )
        );
      } catch {
        throw new CheckFailure("invalid_response");
      }
      check();
      ProviderCredentials.#accept(provider, data);
      return Object.freeze({ status: "accepted" });
    } catch (error) {
      // Host/provider errors never pass through, even if they impersonate a
      // public Failure. Only private locally-created failures retain a code.
      const code = controller.signal.aborted
        ? timedOut
          ? "timeout"
          : "aborted"
        : (CheckFailure.code(error) ?? "unavailable");
      throw new ProviderCredentials.Failure(code);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      abort();
      if (reader) {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      } else {
        void response?.body?.cancel().catch(() => undefined);
      }
    }
  }

  static #accept(
    provider: Exclude<ByokProviderId, "elevenlabs">,
    data: unknown
  ) {
    if (!isObject(data)) throw new CheckFailure("invalid_response");
    switch (provider) {
      case "tripo":
        if (data.code === 1000 || data.code === 1001)
          throw new CheckFailure("credential_rejected");
        if (
          data.code !== 0 ||
          !isObject(data.data) ||
          ![data.data.balance, data.data.frozen].every(
            (value) =>
              typeof value === "number" && Number.isFinite(value) && value >= 0
          )
        )
          throw new CheckFailure("invalid_response");
        return;
      case "openrouter":
        if (
          !isObject(data.data) ||
          typeof data.data.is_management_key !== "boolean"
        )
          throw new CheckFailure("invalid_response");
        if (data.data.is_management_key)
          throw new CheckFailure("credential_rejected");
        return;
      case "vercel":
        if (!numericString(data.balance) || !numericString(data.total_used))
          throw new CheckFailure("invalid_response");
        return;
      case "fal":
        if (
          !Array.isArray(data.prices) ||
          !data.prices.some(
            (price: unknown) =>
              isObject(price) &&
              price.endpoint_id === FAL_ENDPOINT &&
              typeof price.unit_price === "number" &&
              Number.isFinite(price.unit_price) &&
              typeof price.unit === "string" &&
              price.unit.trim() !== "" &&
              typeof price.currency === "string" &&
              price.currency.trim() !== ""
          )
        )
          throw new CheckFailure("invalid_response");
        return;
      default:
        provider satisfies never;
        throw new CheckFailure("invalid_input");
    }
  }
}

export namespace ProviderCredentials {
  export type CheckResult = Readonly<{ status: "accepted" | "not_supported" }>;
  export type FailureCode =
    | "invalid_input"
    | "credential_rejected"
    | "access_denied"
    | "unavailable"
    | "invalid_response"
    | "aborted"
    | "timeout";

  /** Code-only failure; no input, provider response, metadata, or raw cause. */
  export class Failure extends Error {
    constructor(readonly code: FailureCode) {
      super(code);
    }
  }
}

/** Internal marker: caller-thrown public failures cannot cross the safe boundary. */
class CheckFailure extends Error {
  static readonly #codes = new WeakMap<
    object,
    ProviderCredentials.FailureCode
  >();

  constructor(code: ProviderCredentials.FailureCode) {
    super(code);
    CheckFailure.#codes.set(this, code);
  }

  static code(error: unknown): ProviderCredentials.FailureCode | undefined {
    // Host rejection values may be proxies with throwing prototype/property
    // traps. Identity lookup neither invokes those traps nor trusts a code field.
    return typeof error === "object" && error !== null
      ? CheckFailure.#codes.get(error)
      : undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numericString(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) &&
    Number.isFinite(Number(value))
  );
}
