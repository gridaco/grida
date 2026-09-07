// GRIDA-SEC-004 — fixed ElevenLabs voice/speech authority, safe projections, bounded execution.
import { models } from "@grida/ai-models";
import { InputSchema } from "./input-schema";
import { MediaInputs } from "./media-inputs";
import { MediaRoutes } from "./media-routes";
import { ProviderHttp } from "./http";
import { MediaRequest } from "./media-request";

const MODEL_ID = MediaRoutes.speechId;
const VOICES_URL = "https://api.elevenlabs.io/v2/voices";
const SPEECH_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const MAX_AUDIO_BYTES = MediaInputs.limits.speech;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

/** Bounded ElevenLabs voice discovery and the existing v3 speech operation. */
export class TextToSpeechClient {
  readonly #http: ProviderHttp;
  readonly #getKey: TextToSpeechClient.Keys["get"];

  constructor(options: TextToSpeechClient.Options) {
    try {
      exactKeys(options, ["keys", "http"]);
      const { keys, http } = options;
      const get = keys.get;
      if (!(http instanceof ProviderHttp) || typeof get !== "function") throw 0;
      this.#http = http;
      this.#getKey = get.bind(keys);
    } catch {
      throw new TextToSpeechClient.Failure("invalid_input");
    }
  }

  async listVoices(
    input: TextToSpeechClient.VoiceSelection
  ): Promise<readonly TextToSpeechClient.Voice[]> {
    let request: MediaRequest | undefined;
    try {
      const signal = voiceSelection(input);
      request = new MediaRequest(this.#http, signal);
      // Keep one account's key through every page; the next invocation reads anew.
      const key = await this.#key(request);
      const voices = new Map<string, TextToSpeechClient.Voice>();
      const seen = new Set<string>();
      let cursor: string | undefined;
      for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
        request.check();
        const url = new URL(VOICES_URL);
        url.searchParams.set("page_size", "100");
        if (cursor !== undefined)
          url.searchParams.set("next_page_token", cursor);
        const response = await request.request(
          url.toString(),
          {
            method: "GET",
            headers: { "xi-api-key": key, accept: "application/json" },
          },
          MAX_PAGE_BYTES
        );
        assertStatus(response);
        if (mediaType(response) !== "application/json" || !response.body)
          throw new TextToSpeechClient.Failure("invalid_response");
        const page = parsePage(await request.wait(response.text()));
        request.check();
        if (page.has_more) {
          if (!page.cursor || seen.has(page.cursor))
            throw new TextToSpeechClient.Failure("invalid_response");
          seen.add(page.cursor);
        }
        for (const voice of page.voices) {
          if (!voices.has(voice.voice_id)) voices.set(voice.voice_id, voice);
          if (voices.size === 2000) break;
        }
        if (voices.size === 2000 || !page.has_more) break;
        cursor = page.cursor;
      }
      // This bounded picker aid intentionally does not claim exhaustive discovery.
      const result = sortedVoices(voices);
      request.check();
      return result;
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

  async resolve(
    input: TextToSpeechClient.Selection
  ): Promise<TextToSpeechClient.Resolved> {
    let request: MediaRequest | undefined;
    try {
      const { model_id, voice_id } = selection(input);
      if (!MediaRoutes.speech(model_id))
        throw new TextToSpeechClient.Failure("model_unavailable");
      request = new MediaRequest(this.#http);
      await this.#key(request);
      const descriptor = Object.freeze({
        model_id,
        binding_id: model_id,
        provider_id: "elevenlabs" as const,
        voice_id,
      });
      return Object.freeze({
        ...descriptor,
        generate: (args: TextToSpeechClient.Input) =>
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
    const value = await request.wait(
      Promise.resolve(this.#getKey("elevenlabs"))
    );
    request.check();
    if (typeof value !== "string" || !value.trim())
      throw new TextToSpeechClient.Failure("provider_key_required");
    return value.trim();
  }

  async #generate(
    descriptor: TextToSpeechClient.Descriptor,
    input: TextToSpeechClient.Input
  ): Promise<TextToSpeechClient.Result> {
    let request: MediaRequest | undefined;
    try {
      const { text, signal } = generationInput(input);
      request = new MediaRequest(this.#http, signal);
      const key = await this.#key(request);
      request.check();
      const response = await request.request(
        `${SPEECH_URL}/${encodeURIComponent(descriptor.voice_id)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": key,
            "content-type": "application/json",
            accept: "audio/mpeg",
          },
          body: JSON.stringify({ text, model_id: descriptor.binding_id }),
        },
        MAX_AUDIO_BYTES
      );
      assertStatus(response);
      if (mediaType(response) !== "audio/mpeg" || !response.body)
        throw new TextToSpeechClient.Failure("invalid_response");
      const data = new Uint8Array(await request.wait(response.arrayBuffer()));
      request.check();
      if (!data.byteLength || data.byteLength > MAX_AUDIO_BYTES)
        throw new TextToSpeechClient.Failure("invalid_response");
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

export namespace TextToSpeechClient {
  export type ModelId = models.audio.text_to_speech.ModelId;
  export type Keys = {
    get(provider: "elevenlabs"): string | null | Promise<string | null>;
  };
  export type Options = { keys: Keys; http: ProviderHttp };
  export type VoiceSelection = { provider: "elevenlabs"; signal?: AbortSignal };
  export type Voice = Readonly<{ voice_id: string; name: string }>;
  export type Selection = {
    model_id: string;
    provider: "elevenlabs";
    voice_id: string;
  };
  export type Descriptor = Readonly<{
    model_id: ModelId;
    binding_id: ModelId;
    provider_id: "elevenlabs";
    voice_id: string;
  }>;
  export type Resolved = Descriptor & {
    readonly generate: (input: Input) => Promise<Result>;
  };
  export type Input = {
    /** Original whitespace/tags are preserved; nonblank, within the bundled codepoint limit. */
    text: string;
    signal?: AbortSignal;
  };
  export type Result = {
    audio: { data: Uint8Array; media_type: "audio/mpeg" };
  };
  export type FailureCode =
    | "invalid_input"
    | "model_unavailable"
    | "provider_key_required"
    | "provider_access_denied"
    | "aborted"
    | "timeout"
    | "invalid_response"
    | "generation_failed";
  export class Failure extends Error {
    readonly code: FailureCode;
    constructor(code: FailureCode) {
      super(failureCode(code));
      this.name = "TextToSpeechFailure";
      this.code = failureCode(code);
    }
    toJSON(): { code: FailureCode; message: string } {
      return { code: this.code, message: this.code };
    }
  }
}

function selection(value: TextToSpeechClient.Selection): {
  model_id: TextToSpeechClient.ModelId;
  voice_id: string;
} {
  let id: string;
  let voice: string;
  try {
    exactKeys(value, ["model_id", "provider", "voice_id"]);
    const { model_id, provider, voice_id } = value;
    if (
      typeof model_id !== "string" ||
      !model_id ||
      model_id.length > 256 ||
      provider !== "elevenlabs"
    )
      throw 0;
    id = model_id;
    voice = MediaInputs.voice.parse(voice_id);
  } catch {
    throw new TextToSpeechClient.Failure("invalid_input");
  }
  if (id !== MODEL_ID)
    throw new TextToSpeechClient.Failure("model_unavailable");
  return { model_id: id, voice_id: voice };
}

function voiceSelection(
  value: TextToSpeechClient.VoiceSelection
): AbortSignal | undefined {
  try {
    exactKeys(value, ["provider", "signal"]);
    const { provider, signal } = value;
    if (
      provider !== "elevenlabs" ||
      (signal !== undefined && !(signal instanceof AbortSignal))
    )
      throw 0;
    return signal;
  } catch {
    throw new TextToSpeechClient.Failure("invalid_input");
  }
}

function generationInput(
  value: TextToSpeechClient.Input
): TextToSpeechClient.Input {
  try {
    return InputSchema.native(MediaInputs.speech, value);
  } catch {
    throw new TextToSpeechClient.Failure("invalid_input");
  }
}

function parsePage(text: string): {
  voices: TextToSpeechClient.Voice[];
  has_more: boolean;
  cursor?: string;
} {
  try {
    const value: unknown = JSON.parse(text);
    if (
      !isRecord(value) ||
      !Array.isArray(value.voices) ||
      typeof value.has_more !== "boolean"
    )
      throw 0;
    // ElevenLabs may return more than page_size default voices on the first page.
    const voices = value.voices.map((entry) => {
      if (!isRecord(entry)) throw 0;
      return {
        voice_id: boundedText(entry.voice_id, 256),
        name: boundedText(entry.name, 256),
      };
    });
    let cursor: string | undefined;
    if (value.next_page_token !== undefined && value.next_page_token !== null) {
      // Preserve the existing trimmed local cursor policy; impose no token alphabet.
      cursor = boundedText(value.next_page_token, 1024);
      // Keep URI validation observable after bundling, as for voice selection.
      if (!encodeURIComponent(cursor)) throw 0;
    }
    if (value.has_more && !cursor) throw 0;
    return { voices, has_more: value.has_more, cursor };
  } catch {
    throw new TextToSpeechClient.Failure("invalid_response");
  }
}

function sortedVoices(
  voices: ReadonlyMap<string, TextToSpeechClient.Voice>
): readonly TextToSpeechClient.Voice[] {
  return [...voices.values()].sort((a, b) =>
    a.name !== b.name
      ? a.name < b.name
        ? -1
        : 1
      : a.voice_id === b.voice_id
        ? 0
        : a.voice_id < b.voice_id
          ? -1
          : 1
  );
}
function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== "string") throw 0;
  const text = value.trim();
  if (!text || !withinCodepoints(text, maximum)) throw 0;
  return text;
}
function withinCodepoints(value: string, maximum: number): boolean {
  let count = 0;
  for (const _character of value) if (++count > maximum) return false;
  return true;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: unknown, allowed: readonly string[]): void {
  if (
    !isRecord(value) ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !allowed.includes(key)
    )
  )
    throw 0;
}
function mediaType(response: Response): string | undefined {
  return response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
}
function assertStatus(response: Response): void {
  if (response.status === 401 || response.status === 403)
    throw new TextToSpeechClient.Failure("provider_access_denied");
  if (!response.ok) throw new TextToSpeechClient.Failure("generation_failed");
}
function safeFailure(error: unknown): TextToSpeechClient.Failure {
  try {
    if (
      error instanceof TextToSpeechClient.Failure ||
      error instanceof MediaRequest.Failure
    )
      return new TextToSpeechClient.Failure(error.code);
  } catch {
    /* Unknown host errors can have throwing accessors. */
  }
  return new TextToSpeechClient.Failure("generation_failed");
}
function failureCode(value: unknown): TextToSpeechClient.FailureCode {
  return typeof value === "string" &&
    [
      "invalid_input",
      "model_unavailable",
      "provider_key_required",
      "provider_access_denied",
      "aborted",
      "timeout",
      "invalid_response",
      "generation_failed",
    ].includes(value)
    ? (value as TextToSpeechClient.FailureCode)
    : "generation_failed";
}
