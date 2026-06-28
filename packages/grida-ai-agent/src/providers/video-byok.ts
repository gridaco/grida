/**
 * BYOK video-model factories — the video counterpart of {@link ./image-byok.ts}.
 *
 * Given the user's stored key and a provider-specific binding id (from a
 * {@link models.video.VideoProviderBinding}), each returns a `VideoModelV3`
 * whose `doGenerate` the `/video/generate` route drives directly (so it can
 * pass an optional input frame for image-to-video and return provider URLs).
 *
 * The Vercel gateway speaks SDK-native video (`@ai-sdk/gateway` `.videoModel()`).
 * fal and OpenRouter are async REST (submit → poll → fetch) — see
 * {@link FalVideoModel} (queue API) and {@link OpenRouterVideoModel}
 * (`/api/v1/videos` job API). OpenRouter serves Veo + Seedance (not Grok 1.5).
 */

import { createGateway } from "@ai-sdk/gateway";
import type {
  // Video is still `Experimental_`-prefixed in @ai-sdk/provider's public
  // exports (image is not). Alias to the stable internal names locally.
  Experimental_VideoModelV3 as VideoModelV3,
  Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions,
} from "@ai-sdk/provider";
import type { models } from "@grida/ai-models";
import {
  falQueueOutcome,
  pollQueue,
  safeText,
  type PollOutcome,
} from "./fetch-helpers";

type VideoProvider = models.video.VideoProvider;

// Internal per-provider builders — the public entry is makeVideoModelFor.
function makeVercelVideoModel(apiKey: string, id: string): VideoModelV3 {
  return createGateway({ apiKey }).videoModel(id);
}

function makeFalVideoModel(apiKey: string, id: string): VideoModelV3 {
  return new FalVideoModel(apiKey, id);
}

function makeOpenRouterVideoModel(apiKey: string, id: string): VideoModelV3 {
  return new OpenRouterVideoModel(apiKey, id);
}

/**
 * Build the `VideoModelV3` for a resolved (provider, binding-id) pair. The
 * single switch the video resolver calls.
 */
export function makeVideoModelFor(
  provider: VideoProvider,
  apiKey: string,
  id: string
): VideoModelV3 {
  switch (provider) {
    case "vercel":
      return makeVercelVideoModel(apiKey, id);
    case "fal":
      return makeFalVideoModel(apiKey, id);
    case "openrouter":
      return makeOpenRouterVideoModel(apiKey, id);
  }
}

// ── fal adapter ─────────────────────────────────────────────────────

const FAL_QUEUE_BASE = "https://queue.fal.run";
/** Video jobs are slower than image — allow a longer bounded poll budget. */
const FAL_POLL_TIMEOUT_MS = 300_000;
const FAL_POLL_INTERVAL_MS = 2_000;

type FalSubmitResponse = {
  request_id: string;
  status_url: string;
  response_url: string;
};

type FalStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | (string & {});

/**
 * Minimal `VideoModelV3` over fal's queue REST API. `modelId` is the fal
 * endpoint id from the catalog binding (e.g. `fal-ai/veo3.1/image-to-video`).
 * fal returns a video URL on its CDN, which we pass straight through.
 */
export class FalVideoModel implements VideoModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "fal";
  readonly maxVideosPerCall = 1;

  constructor(
    private readonly apiKey: string,
    readonly modelId: string
  ) {}

  private headers(): Record<string, string> {
    return {
      authorization: `Key ${this.apiKey}`,
      "content-type": "application/json",
    };
  }

  async doGenerate(
    options: VideoModelV3CallOptions
  ): Promise<Awaited<ReturnType<VideoModelV3["doGenerate"]>>> {
    const {
      prompt,
      aspectRatio,
      resolution,
      duration,
      seed,
      image,
      providerOptions,
      abortSignal,
    } = options;
    const falExtra =
      (providerOptions?.fal as Record<string, unknown> | undefined) ?? {};

    const submitRes = await fetch(`${FAL_QUEUE_BASE}/${this.modelId}`, {
      method: "POST",
      headers: this.headers(),
      signal: abortSignal,
      body: JSON.stringify({
        prompt,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(resolution ? { resolution } : {}),
        ...(duration !== undefined ? { duration } : {}),
        ...(seed !== undefined ? { seed } : {}),
        // image-to-video: fal takes the start frame as `image_url`.
        ...(image ? { image_url: fileToUrl(image) } : {}),
        ...falExtra,
      }),
    });
    if (!submitRes.ok) {
      throw new Error(
        `[fal] video submit failed (${submitRes.status}): ${await safeText(submitRes)}`
      );
    }
    const submit = (await submitRes.json()) as FalSubmitResponse;

    await pollQueue<{ status: FalStatus }>(
      submit.status_url,
      {
        headers: this.headers(),
        timeoutMs: FAL_POLL_TIMEOUT_MS,
        intervalMs: FAL_POLL_INTERVAL_MS,
        label: "[fal] video",
        classify: falQueueOutcome,
      },
      abortSignal
    );

    const resultRes = await fetch(submit.response_url, {
      headers: this.headers(),
      signal: abortSignal,
    });
    if (!resultRes.ok) {
      throw new Error(
        `[fal] video result fetch failed (${resultRes.status}): ${await safeText(resultRes)}`
      );
    }
    const result = (await resultRes.json()) as {
      video?: { url?: string; content_type?: string };
      videos?: Array<{ url?: string; content_type?: string }>;
    };
    const entries = result.videos ?? (result.video ? [result.video] : []);
    const videos = entries
      .filter((v) => typeof v.url === "string")
      .map((v) => ({
        type: "url" as const,
        url: v.url as string,
        mediaType: v.content_type ?? "video/mp4",
      }));
    if (videos.length === 0) {
      throw new Error("[fal] response contained no video");
    }

    return {
      videos,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
      providerMetadata: {
        fal: { videos: entries.map((e) => ({ content_type: e.content_type })) },
      },
    };
  }
}

// ── OpenRouter adapter ──────────────────────────────────────────────

const OPENROUTER_VIDEO_URL = "https://openrouter.ai/api/v1/videos";
const OR_POLL_TIMEOUT_MS = 300_000;
const OR_POLL_INTERVAL_MS = 2_000;

type OrSubmitResponse = { id: string; polling_url?: string };
type OrPollResponse = {
  status?: string;
  unsigned_urls?: string[];
  error?: string;
};

/**
 * `VideoModelV3` over OpenRouter's async Unified Video API (`POST
 * /api/v1/videos` → job id → poll `polling_url` → `unsigned_urls[0]`). The
 * `unsigned_urls` are public, so we hand the URL straight to the renderer (no
 * auth needed to play it). Verified live 2026-06-29.
 */
export class OpenRouterVideoModel implements VideoModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "openrouter";
  readonly maxVideosPerCall = 1;

  constructor(
    private readonly apiKey: string,
    readonly modelId: string
  ) {}

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.apiKey}`,
      "content-type": "application/json",
    };
  }

  async doGenerate(
    options: VideoModelV3CallOptions
  ): Promise<Awaited<ReturnType<VideoModelV3["doGenerate"]>>> {
    const {
      prompt,
      aspectRatio,
      resolution,
      duration,
      seed,
      image,
      providerOptions,
      abortSignal,
    } = options;
    const orExtra =
      (providerOptions?.openrouter as Record<string, unknown> | undefined) ??
      {};

    const submitRes = await fetch(OPENROUTER_VIDEO_URL, {
      method: "POST",
      headers: this.headers(),
      signal: abortSignal,
      body: JSON.stringify({
        model: this.modelId,
        prompt,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        // SDK `resolution` is `WxH`; OpenRouter's `size` takes that form
        // (its `resolution` field is a label like "720p").
        ...(resolution ? { size: resolution } : {}),
        ...(duration !== undefined ? { duration } : {}),
        ...(seed !== undefined ? { seed } : {}),
        ...(image?.type === "url" ? { input_references: [image.url] } : {}),
        ...orExtra,
      }),
    });
    if (!submitRes.ok) {
      throw new Error(
        `[openrouter] video submit failed (${submitRes.status}): ${await safeText(submitRes)}`
      );
    }
    const submit = (await submitRes.json()) as OrSubmitResponse;
    const pollUrl =
      submit.polling_url ?? `${OPENROUTER_VIDEO_URL}/${submit.id}`;

    const poll = await pollQueue<OrPollResponse>(
      pollUrl,
      {
        headers: this.headers(),
        timeoutMs: OR_POLL_TIMEOUT_MS,
        intervalMs: OR_POLL_INTERVAL_MS,
        label: "[openrouter] video",
        classify: orVideoOutcome,
      },
      abortSignal
    );
    const unsignedUrl = poll.unsigned_urls?.[0];
    const url =
      unsignedUrl ?? `${OPENROUTER_VIDEO_URL}/${submit.id}/content?index=0`;

    // Download in the sidecar and return bytes — the renderer can't reach the
    // content endpoint under the desktop CSP; the route turns these bytes into
    // a `data:` URL the <video> plays.
    //
    // GRIDA-SEC-004: `unsigned_urls` are pre-signed public CDN links — fetch
    // them WITHOUT the key, or the BYOK secret leaks to a third-party CDN host.
    // Only the authed `/content` fallback gets the Authorization header.
    const dl = await fetch(url, {
      headers: unsignedUrl ? {} : { authorization: `Bearer ${this.apiKey}` },
      signal: abortSignal,
    });
    if (!dl.ok) {
      throw new Error(
        `[openrouter] video download failed (${dl.status}): ${await safeText(dl)}`
      );
    }
    const data = Buffer.from(await dl.arrayBuffer()).toString("base64");

    return {
      videos: [
        {
          type: "base64",
          data,
          mediaType: dl.headers.get("content-type") ?? "video/mp4",
        },
      ],
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
      providerMetadata: { openrouter: { id: submit.id } },
    };
  }
}

// ── helpers ─────────────────────────────────────────────────────────

/** OpenRouter video job status → {@link PollOutcome}. */
function orVideoOutcome(body: OrPollResponse): PollOutcome {
  if (body.status === "completed") return "done";
  if (
    body.status === "failed" ||
    body.status === "cancelled" ||
    body.status === "expired"
  ) {
    return {
      failed: `generation ${body.status}${body.error ? `: ${body.error}` : ""}`,
    };
  }
  return "pending";
}

/** A VideoModelV3File is a url or base64/binary file; fal wants a fetchable url. */
function fileToUrl(
  image: NonNullable<VideoModelV3CallOptions["image"]>
): string {
  if (image.type === "url") return image.url;
  const data =
    typeof image.data === "string"
      ? image.data
      : Buffer.from(image.data).toString("base64");
  return `data:${image.mediaType};base64,${data}`;
}
