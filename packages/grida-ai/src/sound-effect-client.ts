// GRIDA-SEC-004 — fixed ElevenLabs authority, bounded sound-effect execution, safe byte results.
import { models } from "@grida/ai-models";
import { InputSchema } from "./input-schema";
import { MediaInputs } from "./media-inputs";
import { MediaRoutes } from "./media-routes";
import { ProviderHttp } from "./http";
import { MediaRequest } from "./media-request";

const MODEL_ID = MediaRoutes.soundEffectId;
const ENDPOINT =
  "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";
const MAX_BYTES = MediaInputs.limits.sound_effect;

/** Existing ElevenLabs sound effects. Hosts own provider-key custody and authorized egress. */
export class SoundEffectClient {
  readonly #http: ProviderHttp;
  readonly #getKey: SoundEffectClient.Keys["get"];

  constructor(options: SoundEffectClient.Options) {
    try {
      exactKeys(options, ["keys", "http"]);
      const { keys, http } = options;
      const get = keys.get;
      if (!(http instanceof ProviderHttp) || typeof get !== "function") throw 0;
      this.#http = http;
      this.#getKey = get.bind(keys);
    } catch {
      throw new SoundEffectClient.Failure("invalid_input");
    }
  }

  async resolve(
    input: SoundEffectClient.Selection
  ): Promise<SoundEffectClient.Resolved> {
    let request: MediaRequest | undefined;
    try {
      const id = selection(input);
      if (!MediaRoutes.soundEffect(id))
        throw new SoundEffectClient.Failure("model_unavailable");
      request = new MediaRequest(this.#http);
      await this.#key(request);
      const descriptor = Object.freeze({
        model_id: id,
        binding_id: id,
        provider_id: "elevenlabs" as const,
      });
      return Object.freeze({
        ...descriptor,
        generate: (args: SoundEffectClient.Input) =>
          this.#generate(descriptor, args),
      });
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

  async #key(request: MediaRequest): Promise<string> {
    request.check();
    // Promise ownership is established by MediaRequest even if the capability
    // synchronously aborts and returns a rejected promise.
    const value = await request.wait(
      Promise.resolve(this.#getKey("elevenlabs"))
    );
    request.check();
    if (typeof value !== "string" || !value.trim())
      throw new SoundEffectClient.Failure("provider_key_required");
    return value.trim();
  }

  async #generate(
    descriptor: SoundEffectClient.Descriptor,
    input: SoundEffectClient.Input
  ): Promise<SoundEffectClient.Result> {
    let request: MediaRequest | undefined;
    try {
      const { prompt, duration_seconds, loop, prompt_influence, signal } =
        generationInput(input);
      request = new MediaRequest(this.#http, signal);
      const key = await this.#key(request);
      request.check();
      const response = await request.request(
        ENDPOINT,
        {
          method: "POST",
          headers: {
            "xi-api-key": key,
            "content-type": "application/json",
            accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: prompt,
            model_id: descriptor.binding_id,
            ...(duration_seconds === undefined ? {} : { duration_seconds }),
            ...(loop === undefined ? {} : { loop }),
            ...(prompt_influence === undefined ? {} : { prompt_influence }),
          }),
        },
        MAX_BYTES
      );
      if (!response.ok)
        throw new SoundEffectClient.Failure("generation_failed");
      const mediaType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (mediaType !== "audio/mpeg" || !response.body)
        throw new SoundEffectClient.Failure("invalid_response");
      const data = new Uint8Array(await request.wait(response.arrayBuffer()));
      request.check();
      if (!data.byteLength || data.byteLength > MAX_BYTES)
        throw new SoundEffectClient.Failure("invalid_response");
      return { audio: { data, media_type: "audio/mpeg" } };
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

export namespace SoundEffectClient {
  export type ModelId = models.audio.sound_effects.ModelId;
  export type Keys = {
    get(provider: "elevenlabs"): string | null | Promise<string | null>;
  };
  export type Options = { keys: Keys; http: ProviderHttp };
  export type Selection = { model_id: string; provider: "elevenlabs" };
  export type Descriptor = Readonly<{
    model_id: ModelId;
    binding_id: ModelId;
    provider_id: "elevenlabs";
  }>;
  export type Resolved = Descriptor & {
    readonly generate: (input: Input) => Promise<Result>;
  };
  export type Input = {
    /** Trimmed, then limited to 450 Unicode code points by the Grida operation contract. */
    prompt: string;
    /** Omit for automatic duration; otherwise a finite value from 0.5 to 30 seconds. */
    duration_seconds?: number;
    loop?: boolean;
    /** Finite value from 0 to 1. Omission preserves the provider default. */
    prompt_influence?: number;
    signal?: AbortSignal;
  };
  export type Result = {
    audio: { data: Uint8Array; media_type: "audio/mpeg" };
  };
  export type FailureCode =
    | "invalid_input"
    | "model_unavailable"
    | "provider_key_required"
    | "aborted"
    | "timeout"
    | "invalid_response"
    | "generation_failed";
  export class Failure extends Error {
    readonly code: FailureCode;
    constructor(code: FailureCode) {
      super(failureCode(code));
      this.name = "SoundEffectFailure";
      this.code = failureCode(code);
    }
    toJSON(): { code: FailureCode; message: string } {
      return { code: this.code, message: this.code };
    }
  }
}

function selection(
  value: SoundEffectClient.Selection
): SoundEffectClient.ModelId {
  let id: string;
  try {
    exactKeys(value, ["model_id", "provider"]);
    const { model_id, provider } = value;
    if (
      typeof model_id !== "string" ||
      !model_id ||
      model_id.length > 256 ||
      provider !== "elevenlabs"
    )
      throw 0;
    id = model_id;
  } catch {
    throw new SoundEffectClient.Failure("invalid_input");
  }
  if (id !== MODEL_ID) throw new SoundEffectClient.Failure("model_unavailable");
  return id;
}

function generationInput(
  value: SoundEffectClient.Input
): SoundEffectClient.Input {
  try {
    return InputSchema.native(MediaInputs.soundEffect, value);
  } catch {
    throw new SoundEffectClient.Failure("invalid_input");
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
function safeFailure(error: unknown): SoundEffectClient.Failure {
  try {
    if (
      error instanceof SoundEffectClient.Failure ||
      error instanceof MediaRequest.Failure
    )
      return new SoundEffectClient.Failure(error.code);
  } catch {
    /* Unknown host errors can have throwing accessors. */
  }
  return new SoundEffectClient.Failure("generation_failed");
}
function failureCode(value: unknown): SoundEffectClient.FailureCode {
  return typeof value === "string" &&
    [
      "invalid_input",
      "model_unavailable",
      "provider_key_required",
      "aborted",
      "timeout",
      "invalid_response",
      "generation_failed",
    ].includes(value)
    ? (value as SoundEffectClient.FailureCode)
    : "generation_failed";
}
