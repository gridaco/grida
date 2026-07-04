// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — Grida hosted image/video adapters.
 *
 * The media counterparts of `./grida.ts`: `ImageModelV3` /
 * `VideoModelV3` over the hosted `/api/v1/ai/{images,videos}/generations`
 * endpoints (Grida-native protocol — the same request/result shapes the
 * BYOK routes speak). The daemon contacts ONLY the configured editor
 * origin for this provider; results are base64 by contract, so nothing
 * from the response body is ever followed as a URL.
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

function joinApi(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

async function postHosted<T>(args: {
  session: GridaGatewaySessionStore;
  url: string;
  body: unknown;
  scope: string;
  abortSignal?: AbortSignal;
}): Promise<T> {
  const res = await fetch(args.url, {
    method: "POST",
    signal: args.abortSignal,
    headers: {
      authorization: `Bearer ${readGgToken(args.session)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args.body),
  });
  throwOnGgHttpError(res.status);
  if (!res.ok) {
    // Model-safe by construction: status only, never the body.
    throw new Error(`[${args.scope}] hosted request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export class GridaGatewayImageModel implements ImageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "gg";
  readonly maxImagesPerCall = 4;

  constructor(
    private readonly session: GridaGatewaySessionStore,
    private readonly baseUrl: string,
    readonly modelId: string
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
    readonly modelId: string
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
