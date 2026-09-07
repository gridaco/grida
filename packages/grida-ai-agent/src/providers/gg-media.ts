// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — Grida hosted music adapter.
 *
 * The typed music adapter calls the hosted
 * `/api/v1/ai/music/generations` endpoint using Grida-native
 * request/result contracts. The daemon contacts ONLY the configured editor
 * origin for this provider; results are base64 by contract, so nothing from
 * the response body is ever followed as a URL.
 *
 * Credential: the session token, read PER CALL from the store (never
 * captured at construction). Constructed 401/402 errors and other HTTP status
 * messages are safe by construction: no upstream body text is embedded.
 * Transport and parsing failures may still carry private detail; the calling
 * route or operation must sanitize them before they reach a user or model.
 */

import type { GgTokenSource } from "@grida/ai";
import { postHosted, joinApi } from "@grida/ai/providers";
import type {
  MusicGenerateRequest,
  MusicGenerateResult,
} from "../protocol/music";
import { ProviderHttp } from "./http";

const MAX_HOSTED_MUSIC_BYTES = 32 * 1024 * 1024;
const MAX_HOSTED_MUSIC_BASE64_CHARACTERS =
  Math.ceil(MAX_HOSTED_MUSIC_BYTES / 3) * 4;
const MAX_HOSTED_MUSIC_JSON_ENVELOPE_BYTES = 4 * 1024;
const MAX_HOSTED_MUSIC_RESPONSE_BYTES =
  MAX_HOSTED_MUSIC_BASE64_CHARACTERS + MAX_HOSTED_MUSIC_JSON_ENVELOPE_BYTES;

/**
 * Hosted Lyria client. Music has no AI SDK provider interface in this package,
 * so this stays a small typed adapter over Grida's native endpoint. The hosted
 * endpoint returns MP3 bytes as base64; this adapter never follows a provider
 * result URL (GRIDA-SEC-004/006).
 */
export class GridaGatewayMusicProvider {
  constructor(
    private readonly session: GgTokenSource,
    private readonly baseUrl: string,
    private readonly providerHttp: ProviderHttp = new ProviderHttp()
  ) {}

  async generate(
    request: MusicGenerateRequest,
    abortSignal?: AbortSignal
  ): Promise<MusicGenerateResult> {
    const result = await postHosted<MusicGenerateResult>({
      session: this.session,
      url: joinApi(this.baseUrl, "/api/v1/ai/music/generations"),
      scope: "grida-music",
      abortSignal,
      provider_http: this.providerHttp,
      max_response_bytes: MAX_HOSTED_MUSIC_RESPONSE_BYTES,
      body: request,
    });
    if (
      result.model_id !== request.model_id ||
      result.provider_id !== "gg" ||
      typeof result.audio?.base64 !== "string" ||
      result.audio.base64.length === 0 ||
      result.audio.base64.length > MAX_HOSTED_MUSIC_BASE64_CHARACTERS ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audio.base64) ||
      result.audio.base64.length % 4 !== 0 ||
      decodedBase64Bytes(result.audio.base64) > MAX_HOSTED_MUSIC_BYTES ||
      result.audio.media_type !== "audio/mpeg" ||
      typeof result.audio.file_name !== "string" ||
      !/^[^/\\]{1,128}\.mp3$/i.test(result.audio.file_name)
    ) {
      throw new Error("[grida-music] hosted response was malformed");
    }
    return result;
  }
}

function decodedBase64Bytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}
