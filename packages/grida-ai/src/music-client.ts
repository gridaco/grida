// GRIDA-SEC-004 / GRIDA-SEC-006 — bounded GG-only music, safe output, no account/BYOK authority.
// GRIDA-GG: token — live scoped credential at the single submission; no mint or persistence.
import { InputSchema } from "./input-schema";
import { MediaInputs } from "./media-inputs";

import {
  GridaGatewayAuthError,
  GridaGatewayCreditsError,
  gridaGatewayOrigin,
} from "./gg";
import type { GgTokenSource } from "./gg-session";
import { ProviderHttp } from "./http";
import { MediaRequest } from "./media-request";
import { GGOperationsClient } from "./gg-operations";
import {
  GGDiscoveryStore,
  supportsGGPromptOperation,
  type GGOperation,
} from "./gg-discovery";

const MAX_BYTES = MediaInputs.limits.music;

/** Current GG music interface. Hosts own scoped custody, egress, and persistence. */
export class MusicClient {
  readonly #http: ProviderHttp;
  readonly #gg: GgTokenSource;
  readonly #origin: string;
  readonly #catalog: GGDiscoveryStore;

  constructor(options: MusicClient.Options) {
    try {
      exactKeys(options, ["http", "gg", "gg_base_url", "gg_catalog"]);
      const { http, gg, gg_base_url } = options;
      const read = gg.getAccessToken;
      if (!(http instanceof ProviderHttp) || typeof read !== "function")
        throw 0;
      this.#http = http;
      this.#gg = { getAccessToken: read.bind(gg) };
      this.#origin = gridaGatewayOrigin(gg_base_url);
      this.#catalog =
        options.gg_catalog ?? new GGDiscoveryStore({ fetch: http.request });
    } catch {
      throw new MusicClient.Failure("invalid_input");
    }
  }

  async resolve(input: MusicClient.Selection): Promise<MusicClient.Resolved> {
    try {
      const id = selection(input);
      if (!this.#gg.getAccessToken())
        throw new MusicClient.Failure("gg_token_expired");
      const snapshot = await this.#catalog.ready();
      const operation = snapshot?.operations.find(
        (item) =>
          item.model_id === id &&
          item.kind === "music" &&
          item.variant === "generate" &&
          item.delivery === "provider_reference" &&
          supportsGGPromptOperation(item)
      );
      if (!operation) throw new MusicClient.Failure("model_unavailable");
      const descriptor = Object.freeze({
        model_id: id,
        provider_id: "gg" as const,
        binding_id: id,
      });
      return Object.freeze({
        ...descriptor,
        generate: (args: MusicClient.Input) =>
          this.#generate(descriptor, args, operation),
      });
    } catch (error) {
      throw safeFailure(error);
    }
  }

  async #generate(
    descriptor: MusicClient.Descriptor,
    input: MusicClient.Input,
    operation: GGOperation
  ): Promise<MusicClient.Result> {
    let request: MediaRequest | undefined;
    try {
      const { prompt, seed, signal } = generationInput(input);
      const properties = operation.input_schema.properties;
      if (
        seed !== undefined &&
        (!properties ||
          typeof properties !== "object" ||
          !Object.hasOwn(properties, "seed"))
      )
        throw new MusicClient.Failure("invalid_input");
      request = new MediaRequest(this.#http, signal);
      request.check();
      const client = new GGOperationsClient({
        http: this.#http,
        gg: this.#gg,
        gg_base_url: this.#origin,
        gg_catalog: this.#catalog,
      });
      const submitted = await request.wait(
        client.submit(
          operation.id,
          { prompt, ...(seed === undefined ? {} : { seed }) },
          request.signal
        )
      );
      if (
        typeof submitted.id !== "string" ||
        !/^req_[A-Za-z0-9_-]{1,160}$/.test(submitted.id)
      )
        throw new MusicClient.Failure("invalid_response");
      const job = await request.wait(client.wait(submitted.id, request.signal));
      const reference = job.result?.audio;
      if (
        !reference ||
        typeof reference !== "object" ||
        Array.isArray(reference)
      )
        throw new MusicClient.Failure("invalid_response");
      const audio = reference as Record<string, unknown>;
      if (typeof audio.url !== "string" || audio.media_type !== "audio/mpeg")
        throw new MusicClient.Failure("invalid_response");
      let url: URL;
      try {
        url = new URL(audio.url);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.hash
        )
          throw 0;
      } catch {
        throw new MusicClient.Failure("invalid_response");
      }
      const result = await request.download(url, MAX_BYTES);
      request.check();
      if (!result.data.length)
        throw new MusicClient.Failure("invalid_response");
      return { audio: { data: result.data, media_type: "audio/mpeg" } };
    } catch (error) {
      try {
        request?.check();
      } catch (abort) {
        throw safeFailure(abort);
      }
      throw safeFailure(error);
    } finally {
      request?.dispose();
    }
  }
}

export namespace MusicClient {
  export type ModelId = string;
  export type Options = {
    http: ProviderHttp;
    gg: GgTokenSource;
    gg_base_url: string;
    gg_catalog?: GGDiscoveryStore;
  };
  export type Selection = { model_id: string; provider: "gg" };
  export type Descriptor = Readonly<{
    model_id: ModelId;
    provider_id: "gg";
    binding_id: ModelId;
  }>;
  export type Resolved = Descriptor & {
    readonly generate: (input: Input) => Promise<Result>;
  };
  export type Input = {
    /** Trimmed before submission; 1–4096 UTF-16 code units, matching hosted validation. */
    prompt: string;
    seed?: number;
    signal?: AbortSignal;
  };
  export type Result = {
    audio: { data: Uint8Array; media_type: "audio/mpeg" };
  };
  export type FailureCode =
    | "invalid_input"
    | "model_unavailable"
    | "gg_token_expired"
    | "insufficient_credits"
    | "aborted"
    | "timeout"
    | "invalid_response"
    | "generation_failed";
  export class Failure extends Error {
    readonly code: FailureCode;
    constructor(code: FailureCode) {
      super(failureCode(code));
      this.name = "MusicFailure";
      this.code = failureCode(code);
    }
    toJSON(): { code: FailureCode; message: string } {
      return { code: this.code, message: this.code };
    }
  }
}

function selection(value: MusicClient.Selection): MusicClient.ModelId {
  let model_id: string;
  try {
    exactKeys(value, ["model_id", "provider"]);
    const input = { model_id: value.model_id, provider: value.provider };
    if (
      typeof input.model_id !== "string" ||
      !input.model_id ||
      input.model_id.length > 256 ||
      input.provider !== "gg"
    )
      throw 0;
    model_id = input.model_id;
  } catch {
    throw new MusicClient.Failure("invalid_input");
  }
  return model_id;
}

function generationInput(value: MusicClient.Input): MusicClient.Input {
  try {
    return InputSchema.native(MediaInputs.music, value);
  } catch {
    throw new MusicClient.Failure("invalid_input");
  }
}

function exactKeys(value: unknown, allowed: readonly string[]): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !allowed.includes(key)
    )
  )
    throw 0;
}
function safeFailure(error: unknown): MusicClient.Failure {
  try {
    if (
      error instanceof MusicClient.Failure ||
      error instanceof MediaRequest.Failure
    )
      return new MusicClient.Failure(error.code);
    if (error instanceof GridaGatewayAuthError)
      return new MusicClient.Failure("gg_token_expired");
    if (error instanceof GridaGatewayCreditsError)
      return new MusicClient.Failure("insufficient_credits");
  } catch {
    /* Unknown host errors can have throwing accessors. */
  }
  return new MusicClient.Failure("generation_failed");
}
function failureCode(value: unknown): MusicClient.FailureCode {
  return typeof value === "string" &&
    [
      "invalid_input",
      "model_unavailable",
      "gg_token_expired",
      "insufficient_credits",
      "aborted",
      "timeout",
      "invalid_response",
      "generation_failed",
    ].includes(value)
    ? (value as MusicClient.FailureCode)
    : "generation_failed";
}
