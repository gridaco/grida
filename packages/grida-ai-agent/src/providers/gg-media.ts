// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — Grida hosted media adapters.
 *
 * `ImageModelV3` / `VideoModelV3` and the typed music adapter call the hosted
 * `/api/v1/ai/{images,videos,audio}/generations` endpoints using Grida-native
 * request/result contracts. The daemon contacts ONLY the configured editor
 * origin for this provider; results are base64 by contract, so nothing from
 * the response body is ever followed as a URL.
 *
 * Credential: the session token, read PER CALL from the store (never
 * captured at construction). Error posture mirrors the BYOK adapters'
 * GRIDA-SEC-004 rule, stricter: thrown messages are model-safe BY
 * CONSTRUCTION (no `safeText` body embedding at all) — 401/402 map to
 * the typed code-led errors, everything else is a generic status line.
 */

import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  Experimental_VideoModelV3 as VideoModelV3,
  Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions,
} from "@ai-sdk/provider";
import type { GridaGatewaySessionStore } from "./gg-session";
import { readGgToken, throwOnGgHttpError } from "./gg";
import type { ImageGenerateResult } from "../protocol/images";
import type { VideoGenerateResult } from "../protocol/video";
import type {
  MusicGenerateRequest,
  MusicGenerateResult,
} from "../protocol/audio";
import { ProviderHttp } from "./http";

const MAX_HOSTED_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_HOSTED_AUDIO_BASE64_CHARACTERS =
  Math.ceil(MAX_HOSTED_AUDIO_BYTES / 3) * 4;
const MAX_HOSTED_AUDIO_JSON_ENVELOPE_BYTES = 4 * 1024;
const MAX_HOSTED_AUDIO_RESPONSE_BYTES =
  MAX_HOSTED_AUDIO_BASE64_CHARACTERS + MAX_HOSTED_AUDIO_JSON_ENVELOPE_BYTES;

function joinApi(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

async function postHosted<T>(args: {
  session: GridaGatewaySessionStore;
  url: string;
  body: unknown;
  scope: string;
  abortSignal?: AbortSignal;
  provider_http: ProviderHttp;
  max_response_bytes?: number;
}): Promise<T> {
  const res = await args.provider_http.request(args.url, {
    method: "POST",
    signal: args.abortSignal,
    headers: {
      authorization: `Bearer ${readGgToken(args.session)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args.body),
  });
  await throwOnGgHttpError(res);
  if (!res.ok) {
    // Model-safe by construction: status only, never the body. Drain the
    // body first so undici releases the socket.
    await res.body?.cancel().catch(() => {});
    throw new Error(`[${args.scope}] hosted request failed (${res.status})`);
  }
  if (args.max_response_bytes === undefined) {
    // Preserve the established generic image/video response behavior.
    return (await res.json()) as T;
  }
  return readHostedJsonBounded<T>(res, args.max_response_bytes, args.scope);
}

async function readHostedJsonBounded<T>(
  response: Response,
  maxBytes: number,
  scope: string
): Promise<T> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`[${scope}] hosted response was too large`);
  }
  if (!response.body) {
    throw new Error(`[${scope}] hosted response was malformed`);
  }

  const reader = response.body.getReader();
  let data = new Uint8Array();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const nextTotal = total + value.byteLength;
      if (!Number.isSafeInteger(nextTotal) || nextTotal > maxBytes) {
        throw new Error(`[${scope}] hosted response was too large`);
      }
      if (nextTotal > data.byteLength) {
        const capacity = Math.min(
          maxBytes,
          Math.max(
            nextTotal,
            data.byteLength === 0 ? 64 * 1024 : data.byteLength * 2
          )
        );
        const grown = new Uint8Array(capacity);
        grown.set(data.subarray(0, total));
        data = grown;
      }
      data.set(value, total);
      total = nextTotal;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  try {
    return JSON.parse(new TextDecoder().decode(data.subarray(0, total))) as T;
  } catch {
    throw new Error(`[${scope}] hosted response was malformed`);
  }
}

export class GridaGatewayImageModel implements ImageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "gg";
  readonly maxImagesPerCall = 4;

  constructor(
    private readonly session: GridaGatewaySessionStore,
    private readonly baseUrl: string,
    readonly modelId: string,
    private readonly providerHttp: ProviderHttp = new ProviderHttp()
  ) {}

  async doGenerate(
    options: ImageModelV3CallOptions
  ): Promise<Awaited<ReturnType<ImageModelV3["doGenerate"]>>> {
    const { prompt, n, size, aspectRatio, seed, abortSignal, providerOptions } =
      options;
    let width: number | undefined;
    let height: number | undefined;
    if (size) {
      const match = /^(\d+)x(\d+)$/.exec(size);
      if (match) {
        width = Number(match[1]);
        height = Number(match[2]);
      }
    }
    // The desktop image route sets the picker's quality tier under
    // `providerOptions.gg` (keyed by provider id); forward it so the hosted
    // endpoint bills AND delivers the requested tier rather than dropping it.
    const rawQuality = providerOptions?.gg?.quality;
    const quality = typeof rawQuality === "string" ? rawQuality : undefined;
    const result = await postHosted<ImageGenerateResult>({
      session: this.session,
      url: joinApi(this.baseUrl, "/api/v1/ai/images/generations"),
      scope: "grida-images",
      abortSignal,
      provider_http: this.providerHttp,
      body: {
        model_id: this.modelId,
        prompt,
        n,
        width,
        height,
        aspect_ratio: aspectRatio,
        quality,
        seed,
      },
    });
    return {
      images: result.images.map((image) => image.base64),
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }
}

export class GridaGatewayVideoModel implements VideoModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "gg";
  readonly maxVideosPerCall = 1;

  constructor(
    private readonly session: GridaGatewaySessionStore,
    private readonly baseUrl: string,
    readonly modelId: string,
    private readonly providerHttp: ProviderHttp = new ProviderHttp()
  ) {}

  async doGenerate(
    options: VideoModelV3CallOptions
  ): Promise<Awaited<ReturnType<VideoModelV3["doGenerate"]>>> {
    const {
      prompt,
      aspectRatio,
      resolution,
      duration,
      fps,
      seed,
      abortSignal,
    } = options;
    const result = await postHosted<VideoGenerateResult>({
      session: this.session,
      url: joinApi(this.baseUrl, "/api/v1/ai/videos/generations"),
      scope: "grida-video",
      abortSignal,
      provider_http: this.providerHttp,
      body: {
        model_id: this.modelId,
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        duration,
        fps,
        seed,
      },
    });
    return {
      videos: result.videos.map((video) => ({
        type: "base64" as const,
        data: video.base64,
        mediaType: video.media_type,
      })),
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
      providerMetadata: {},
    };
  }
}

/**
 * Hosted Lyria client. Audio has no AI SDK provider interface in this package,
 * so this stays a small typed adapter over Grida's native endpoint. The hosted
 * endpoint returns MP3 bytes as base64; this adapter never follows a provider
 * result URL (GRIDA-SEC-004/006).
 */
export class GridaGatewayMusicProvider {
  constructor(
    private readonly session: GridaGatewaySessionStore,
    private readonly baseUrl: string,
    private readonly providerHttp: ProviderHttp = new ProviderHttp()
  ) {}

  async generate(
    request: MusicGenerateRequest,
    abortSignal?: AbortSignal
  ): Promise<MusicGenerateResult> {
    const result = await postHosted<MusicGenerateResult>({
      session: this.session,
      url: joinApi(this.baseUrl, "/api/v1/ai/audio/generations"),
      scope: "grida-audio",
      abortSignal,
      provider_http: this.providerHttp,
      max_response_bytes: MAX_HOSTED_AUDIO_RESPONSE_BYTES,
      body: request,
    });
    if (
      result.model_id !== request.model_id ||
      result.provider_id !== "gg" ||
      typeof result.audio?.base64 !== "string" ||
      result.audio.base64.length === 0 ||
      result.audio.base64.length > MAX_HOSTED_AUDIO_BASE64_CHARACTERS ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audio.base64) ||
      result.audio.base64.length % 4 !== 0 ||
      decodedBase64Bytes(result.audio.base64) > MAX_HOSTED_AUDIO_BYTES ||
      result.audio.media_type !== "audio/mpeg" ||
      typeof result.audio.file_name !== "string" ||
      !/^[^/\\]{1,128}\.mp3$/i.test(result.audio.file_name)
    ) {
      throw new Error("[grida-audio] hosted response was malformed");
    }
    return result;
  }
}

function decodedBase64Bytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}
