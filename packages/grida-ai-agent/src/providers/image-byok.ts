/**
 * BYOK image-model factories — the image counterpart of {@link ./byok.ts}.
 *
 * Like the language factories, these are isolated `@ai-sdk/*` provider
 * consumers so client-safe entries never pull provider SDKs. Given the user's
 * stored key and a provider-specific binding id (from a
 * {@link models.image.ImageProviderBinding}), each returns an `ImageModelV3`
 * that `ai`'s `generateImage()` can drive.
 *
 * Only the Vercel gateway speaks an SDK-native image protocol (`@ai-sdk/gateway`
 * `.imageModel()`). The others need hand-written adapters: OpenRouter has its own
 * dedicated Unified Image API (`POST /api/v1/images`; it 404s on OpenAI's
 * `/images/generations`), and fal is queue-based REST (submit → poll → fetch).
 * See {@link OpenRouterImageModel} and {@link FalImageModel}.
 */

import { createGateway } from "@ai-sdk/gateway";
import type { ImageModelV3, ImageModelV3CallOptions } from "@ai-sdk/provider";
import type { models } from "@grida/ai-models";
import {
  assertAllowedUrl,
  falQueueOutcome,
  pollQueue,
  safeText,
} from "./fetch-helpers";

type ImageProvider = models.image.ImageProvider;

// Internal per-provider builders — the public entry is makeImageModelFor.
function makeOpenRouterImageModel(apiKey: string, id: string): ImageModelV3 {
  return new OpenRouterImageModel(apiKey, id);
}

function makeVercelImageModel(apiKey: string, id: string): ImageModelV3 {
  return createGateway({ apiKey }).imageModel(id);
}

function makeFalImageModel(apiKey: string, id: string): ImageModelV3 {
  return new FalImageModel(apiKey, id);
}

/**
 * Build the `ImageModelV3` for a resolved (provider, binding-id) pair using the
 * user's key. The single switch the image resolver calls.
 */
export function makeImageModelFor(
  provider: ImageProvider,
  apiKey: string,
  id: string
): ImageModelV3 {
  switch (provider) {
    case "openrouter":
      return makeOpenRouterImageModel(apiKey, id);
    case "vercel":
      return makeVercelImageModel(apiKey, id);
    case "fal":
      return makeFalImageModel(apiKey, id);
  }
}

// ── OpenRouter adapter ──────────────────────────────────────────────

const OPENROUTER_IMAGE_URL = "https://openrouter.ai/api/v1/images";

/**
 * `ImageModelV3` over OpenRouter's dedicated Unified Image API
 * (`POST /api/v1/images`). OpenRouter has NO OpenAI-style
 * `/images/generations` endpoint — `@ai-sdk/openai-compatible`'s `.imageModel()`
 * 404s there. The unified route normalizes `model`/`prompt`/`size`/
 * `aspect_ratio`/`seed` across all OpenRouter image models and returns base64 in
 * `data[].b64_json` (verified live 2026-06-29).
 */
export class OpenRouterImageModel implements ImageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "openrouter";
  readonly maxImagesPerCall = 4;

  constructor(
    private readonly apiKey: string,
    readonly modelId: string
  ) {}

  async doGenerate(
    options: ImageModelV3CallOptions
  ): Promise<Awaited<ReturnType<ImageModelV3["doGenerate"]>>> {
    const { prompt, n, size, aspectRatio, seed, providerOptions, abortSignal } =
      options;
    const orExtra =
      (providerOptions?.openrouter as Record<string, unknown> | undefined) ??
      {};

    const res = await fetch(OPENROUTER_IMAGE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      signal: abortSignal,
      body: JSON.stringify({
        model: this.modelId,
        prompt,
        n,
        ...(size ? { size } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(seed !== undefined ? { seed } : {}),
        ...orExtra,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `[openrouter] image request failed (${res.status}): ${await safeText(res)}`
      );
    }
    const json = (await res.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const images = (json.data ?? [])
      .map((d) => d.b64_json)
      .filter((b): b is string => typeof b === "string" && b.length > 0);
    if (images.length === 0) {
      throw new Error("[openrouter] response contained no image data");
    }
    return {
      images, // base64 strings — the AI SDK detects the media type
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
      providerMetadata: { openrouter: { images: images.map(() => ({})) } },
    };
  }
}

// ── fal adapter ─────────────────────────────────────────────────────

const FAL_QUEUE_BASE = "https://queue.fal.run";
/** Hosts fal responses may point us at (queue + media CDN). A response that
 *  redirects elsewhere must not receive the key or a sidecar fetch. */
const FAL_HOSTS = ["*.fal.run", "fal.run", "fal.media", "*.fal.media"] as const;
/** Total poll budget. fal image jobs are typically seconds; cap to stay bounded. */
const FAL_POLL_TIMEOUT_MS = 120_000;
const FAL_POLL_INTERVAL_MS = 1_000;

type FalSubmitResponse = {
  request_id: string;
  status_url: string;
  response_url: string;
};

type FalStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | (string & {});

/**
 * Minimal `ImageModelV3` over fal's queue REST API.
 *
 * `modelId` is the fal endpoint id from the catalog binding, e.g.
 * `fal-ai/flux-2-pro` or `fal-ai/bytedance/seedream/v4.5/text-to-image`.
 */
export class FalImageModel implements ImageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "fal";
  readonly maxImagesPerCall = 4;

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
    options: ImageModelV3CallOptions
  ): Promise<Awaited<ReturnType<ImageModelV3["doGenerate"]>>> {
    const { prompt, n, size, aspectRatio, seed, providerOptions, abortSignal } =
      options;

    // fal accepts `image_size` either as an enum or `{ width, height }`.
    const image_size = size ? whFromSize(size) : undefined;
    const falExtra =
      (providerOptions?.fal as Record<string, unknown> | undefined) ?? {};

    // 1. submit
    const submitRes = await fetch(`${FAL_QUEUE_BASE}/${this.modelId}`, {
      method: "POST",
      headers: this.headers(),
      signal: abortSignal,
      body: JSON.stringify({
        prompt,
        num_images: n,
        ...(image_size ? { image_size } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(seed !== undefined ? { seed } : {}),
        ...falExtra,
      }),
    });
    if (!submitRes.ok) {
      throw new Error(
        `[fal] submit failed (${submitRes.status}): ${await safeText(submitRes)}`
      );
    }
    const submit = (await submitRes.json()) as FalSubmitResponse;

    // GRIDA-SEC-004: the key-bearing poll/result fetches use URLs from the
    // response body — pin them to fal hosts so a hostile response can't exfil
    // the key or drive the sidecar to an arbitrary origin.
    assertAllowedUrl(submit.status_url, FAL_HOSTS, "[fal] status_url");
    assertAllowedUrl(submit.response_url, FAL_HOSTS, "[fal] response_url");

    // 2. poll until COMPLETED (bounded, abort-aware)
    await pollQueue<{ status: FalStatus }>(
      submit.status_url,
      {
        headers: this.headers(),
        timeoutMs: FAL_POLL_TIMEOUT_MS,
        intervalMs: FAL_POLL_INTERVAL_MS,
        label: "[fal]",
        classify: falQueueOutcome,
      },
      abortSignal
    );

    // 3. fetch the result, download each image to bytes
    const resultRes = await fetch(submit.response_url, {
      headers: this.headers(),
      signal: abortSignal,
    });
    if (!resultRes.ok) {
      throw new Error(
        `[fal] result fetch failed (${resultRes.status}): ${await safeText(resultRes)}`
      );
    }
    const result = (await resultRes.json()) as {
      images?: Array<{ url?: string; content_type?: string }>;
    };
    const entries = result.images ?? [];
    if (entries.length === 0) {
      throw new Error("[fal] response contained no image");
    }
    const images = await Promise.all(
      entries.map((img) => {
        assertAllowedUrl(img.url ?? "", FAL_HOSTS, "[fal] image url");
        return downloadToBytes(img.url, abortSignal);
      })
    );

    return {
      images,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
      providerMetadata: {
        fal: { images: entries.map((e) => ({ content_type: e.content_type })) },
      },
    };
  }
}

// ── helpers ─────────────────────────────────────────────────────────

function whFromSize(size: `${number}x${number}`): {
  width: number;
  height: number;
} {
  const [w, h] = size.split("x").map(Number);
  return { width: w, height: h };
}

async function downloadToBytes(
  url: string | undefined,
  abortSignal?: AbortSignal
): Promise<Uint8Array> {
  if (!url) throw new Error("[fal] result image has no url");
  const res = await fetch(url, { signal: abortSignal });
  if (!res.ok) {
    throw new Error(`[fal] image download failed (${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
