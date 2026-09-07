// GRIDA-SEC-004 / GRIDA-SEC-006 — bounded GG-only music, safe output, no account/BYOK authority.
// GRIDA-GG: token — live scoped credential at the single submission; no mint or persistence.
import { models } from "@grida/ai-models";
import { InputSchema } from "./input-schema";
import { MediaInputs } from "./media-inputs";
import { MediaRoutes } from "./media-routes";
import {
  GridaGatewayAuthError,
  GridaGatewayCreditsError,
  postHosted,
} from "./gg";
import type { GgTokenSource } from "./gg-session";
import { ProviderHttp } from "./http";
import { MediaRequest } from "./media-request";

const MAX_BYTES = MediaInputs.limits.music;
const MAX_BASE64_CHARACTERS = Math.ceil(MAX_BYTES / 3) * 4;
const MAX_RESPONSE_BYTES = MAX_BASE64_CHARACTERS + 4 * 1024;

/** Existing hosted Lyria operation. Hosts own scoped custody, egress, and persistence. */
export class MusicClient {
  readonly #http: ProviderHttp;
  readonly #gg: GgTokenSource;
  readonly #origin: string;

  constructor(options: MusicClient.Options) {
    try {
      exactKeys(options, ["http", "gg", "gg_base_url"]);
      const { http, gg, gg_base_url } = options;
      const read = gg.getAccessToken;
      if (!(http instanceof ProviderHttp) || typeof read !== "function")
        throw 0;
      const url = new URL(gg_base_url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw 0;
      this.#http = http;
      this.#gg = { getAccessToken: read.bind(gg) };
      this.#origin = url.origin;
    } catch {
      throw new MusicClient.Failure("invalid_input");
    }
  }

  async resolve(input: MusicClient.Selection): Promise<MusicClient.Resolved> {
    try {
      const id = selection(input);
      if (!MediaRoutes.music(id))
        throw new MusicClient.Failure("model_unavailable");
      if (!this.#gg.getAccessToken())
        throw new MusicClient.Failure("gg_token_expired");
      const descriptor = Object.freeze({
        model_id: id,
        provider_id: "gg" as const,
        binding_id: id,
      });
      return Object.freeze({
        ...descriptor,
        generate: (args: MusicClient.Input) => this.#generate(descriptor, args),
      });
    } catch (error) {
      throw safeFailure(error);
    }
  }

  async #generate(
    descriptor: MusicClient.Descriptor,
    input: MusicClient.Input
  ): Promise<MusicClient.Result> {
    let request: MediaRequest | undefined;
    try {
      const { prompt, seed, signal } = generationInput(input);
      request = new MediaRequest(this.#http, signal);
      request.check();
      const result = await request.wait(
        postHosted<unknown>({
          session: this.#gg,
          url: new URL("/api/v1/ai/music/generations", this.#origin).toString(),
          body: {
            model_id: descriptor.model_id,
            prompt,
            ...(seed === undefined ? {} : { seed }),
          },
          scope: "music",
          abortSignal: request.signal,
          provider_http: request.transport(MAX_RESPONSE_BYTES),
          max_response_bytes: MAX_RESPONSE_BYTES,
        })
      );
      request.check();
      const audio = parseAudio(result, descriptor.model_id);
      request.check();
      return { audio };
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
  export type ModelId = models.audio.music.ModelId;
  export type Options = {
    http: ProviderHttp;
    gg: GgTokenSource;
    gg_base_url: string;
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
  if (!models.audio.music.is_model_id(model_id))
    throw new MusicClient.Failure("model_unavailable");
  return model_id;
}

function generationInput(value: MusicClient.Input): MusicClient.Input {
  try {
    return InputSchema.native(MediaInputs.music, value);
  } catch {
    throw new MusicClient.Failure("invalid_input");
  }
}

/** Preserve existing hosted wire checks; only decoded audio leaves this operation. */

function parseAudio(
  value: unknown,
  id: MusicClient.ModelId
): MusicClient.Result["audio"] {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw 0;
    const result = value as Record<string, unknown>;
    if (
      result.model_id !== id ||
      result.provider_id !== "gg" ||
      !result.audio ||
      typeof result.audio !== "object" ||
      Array.isArray(result.audio)
    )
      throw 0;
    const audio = result.audio as Record<string, unknown>;
    const { base64, media_type, file_name } = audio;
    if (
      typeof base64 !== "string" ||
      !base64.length ||
      base64.length > MAX_BASE64_CHARACTERS ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
      base64.length % 4 !== 0 ||
      media_type !== "audio/mpeg" ||
      typeof file_name !== "string" ||
      !/^[^/\\]{1,128}\.mp3$/i.test(file_name)
    )
      throw 0;
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    if ((base64.length / 4) * 3 - padding > MAX_BYTES) throw 0;
    const decoded = atob(base64);
    if (!decoded.length || decoded.length > MAX_BYTES) throw 0;
    return {
      data: Uint8Array.from(decoded, (character) => character.charCodeAt(0)),
      media_type: "audio/mpeg",
    };
  } catch {
    throw new MusicClient.Failure("invalid_response");
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
