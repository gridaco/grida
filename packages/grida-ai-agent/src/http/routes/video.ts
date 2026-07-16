// GRIDA-GG: provider — the `gg` hosted video arm (docs/wg/platform/hosted-ai.md)
/**
 * GRIDA-SEC-004 — `/video/generate` route (BYOK video generation, #908).
 *
 * Desktop-only, user-BYOK video generation — the video sibling of
 * {@link ./images.ts}. Resolves the user's connected provider for a curated
 * model id, builds the `VideoModelV3` with the key (read internally — never
 * exposed), normalizes the generated video to base64 bytes, and returns no
 * provider URL to the renderer.
 *
 * Security contract (reviewed): reads `_getKey` internally (sidecar only); the
 * response carries base64 + provider id only — never the key, never raw
 * upstream JSON. `model_id` is a closed catalog lookup and `provider` is
 * `oneOf` the fixed video providers — no user-supplied base URL, so no new
 * egress beyond the fixed provider hosts.
 *
 * Billing contract (#908): this path NEVER enters the web Grida-billed seam. It
 * calls the model directly without the grida provider-option (the field the web
 * billing middleware keys on), so the user's own key pays the provider. Do not
 * add a grida provider-option here.
 *
 * Note: `experimental_generateVideo` is text-to-video only (no image arg), so
 * the route drives the model's `doGenerate` directly — that lets it pass an
 * optional start frame for image-to-video (which fal's catalog bindings need).
 */

import type { Hono } from "hono";
import { DownloadError } from "ai";
import type { Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions } from "@ai-sdk/provider";
import type { SecretsStore } from "@grida/daemon/server";
import {
  VideoModelUnavailableError,
  resolveVideoModel,
} from "../../providers/resolve-video";
import { VERCEL_VIDEO_GATEWAY_BASE_URL } from "../../providers/video-byok";
import { hostedGenerationError } from "./gg-media-errors";
import { body, v } from "@grida/daemon/server";
import { ProviderHttp } from "../../providers/http";

const VIDEO_PROVIDERS = ["vercel", "fal", "openrouter", "gg"] as const;
const VERCEL_VIDEO_GATEWAY_ORIGIN = new URL(VERCEL_VIDEO_GATEWAY_BASE_URL)
  .origin;

class UntrustedVideoResultOriginError extends Error {
  readonly code = "unsupported_untrusted_result_origin" as const;

  constructor(providerId: string, resultUrl: string) {
    let origin = "<invalid-url>";
    try {
      origin = new URL(resultUrl).origin;
    } catch {
      // The fixed marker avoids echoing an untrusted opaque value to clients.
    }
    super(
      `[agent-host-video] ${providerId} unsupported/untrusted-result-origin: ${origin}`
    );
    this.name = "UntrustedVideoResultOriginError";
  }
}

function videoResultUrl(value: string, providerId: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    if (providerId === "vercel") {
      throw new UntrustedVideoResultOriginError(providerId, value);
    }
    throw new Error(`[agent-host-video] ${providerId} returned an invalid url`);
  }

  // Vercel Gateway's VideoModel contract permits arbitrary provider-returned
  // URLs, but package download authority never does. Inline data stays local;
  // the exact configured Gateway origin is the only network-shaped URL the
  // package can prove belongs to that provider, and a host transport must still
  // authorize the concrete request before I/O.
  if (
    providerId === "vercel" &&
    url.protocol !== "data:" &&
    url.origin !== VERCEL_VIDEO_GATEWAY_ORIGIN
  ) {
    throw new UntrustedVideoResultOriginError(providerId, value);
  }

  if (url.protocol !== "data:" && url.protocol !== "https:") {
    throw new Error(
      `[agent-host-video] ${providerId} returned a non-https url`
    );
  }
  return url;
}

function videoFetchFailureMessage(error: unknown): string {
  // DownloadError.url deliberately retains the opaque provider capability for
  // internal diagnosis. Its message is not a client contract and may come from
  // a foreign transport, so never reflect it across this renderer boundary.
  if (DownloadError.isInstance(error)) {
    return error.statusCode === undefined
      ? "provider asset download failed"
      : `provider asset download failed (HTTP ${error.statusCode})`;
  }
  return error instanceof Error ? error.message : String(error);
}

export type VideoRoutesDeps = {
  secrets: SecretsStore;
  /** GRIDA-SEC-006 — hosted provider deps; absent ⇒ grida never resolves. */
  gg?: import("../../providers/gg-session").GridaGatewaySessionStore;
  gg_base_url?: string;
  provider_http?: ProviderHttp;
};

export function registerVideoRoutes(app: Hono, deps: VideoRoutesDeps) {
  const { secrets, gg, gg_base_url } = deps;
  const providerHttp = deps.provider_http ?? new ProviderHttp();

  app.post("/video/generate", async (c) => {
    const r = await body(c, {
      model_id: v.string,
      prompt: v.string,
      provider: v.optional(v.oneOf(VIDEO_PROVIDERS)),
      // Reject malformed option strings at the boundary (400) instead of
      // letting them reach the provider and bounce back as a 502.
      aspect_ratio: v.optional(v.matching(/^\d+:\d+$/, 'must be "<w>:<h>"')),
      resolution: v.optional(v.matching(/^\d+x\d+$/, 'must be "<w>x<h>"')),
      duration: v.optional(v.number),
      fps: v.optional(v.number),
      seed: v.optional(v.number),
      image_url: v.optional(
        v.matching(/^https:\/\/.+/i, "must be an https url")
      ),
    });
    if (!r.ok) return r.res;
    const d = r.data;

    let resolved;
    try {
      resolved = await resolveVideoModel(
        { secrets, gg, gg_base_url, provider_http: providerHttp },
        d.model_id,
        // `image` skips the t2v-only hosted `gg` arm for i2v requests so the
        // start frame isn't silently dropped — falls back to a BYOK route.
        {
          ...(d.provider ? { explicit: d.provider } : {}),
          image: !!d.image_url,
        }
      );
    } catch (e) {
      if (e instanceof VideoModelUnavailableError) {
        return c.json({ error: e.message, model_id: e.model_id }, 400);
      }
      throw e;
    }

    const callOptions: VideoModelV3CallOptions = {
      prompt: d.prompt,
      n: 1,
      aspectRatio: d.aspect_ratio
        ? (d.aspect_ratio as `${number}:${number}`)
        : undefined,
      resolution: d.resolution
        ? (d.resolution as `${number}x${number}`)
        : undefined,
      duration: d.duration,
      fps: d.fps,
      seed: d.seed,
      image: d.image_url ? { type: "url", url: d.image_url } : undefined,
      providerOptions: {},
    };

    let generation;
    try {
      generation = await resolved.model.doGenerate(callOptions);
    } catch (e) {
      return hostedGenerationError(c, {
        error: e,
        scope: "agent-host-video",
        label: "video generation failed",
        model_id: d.model_id,
        provider_id: resolved.provider_id,
      });
    }

    // Normalize every result to base64 bytes. The renderer receives no provider
    // URL. OpenRouter already uses its fixed authenticated content endpoint;
    // URL-shaped outputs from other adapters are lowered through the bounded
    // ProviderHttp download path after provider-specific trust checks.
    let videos;
    try {
      const urls: URL[] = [];
      const pending = generation.videos.map((vid) => {
        if (vid.type === "base64") {
          return {
            kind: "ready" as const,
            video: { base64: vid.data, media_type: vid.mediaType },
          };
        }
        if (vid.type === "binary") {
          return {
            kind: "ready" as const,
            video: {
              base64: Buffer.from(vid.data).toString("base64"),
              media_type: vid.mediaType,
            },
          };
        }
        const index = urls.length;
        urls.push(videoResultUrl(vid.url, resolved.provider_id));
        return {
          kind: "download" as const,
          index,
          media_type: vid.mediaType,
        };
      });
      const downloaded = await providerHttp.downloadProviderAssets(urls);
      videos = pending.map((item) => {
        if (item.kind === "ready") return item.video;
        const result = downloaded[item.index];
        if (!result) throw new Error("video result was not downloaded");
        return {
          base64: Buffer.from(result.data).toString("base64"),
          media_type: result.mediaType ?? item.media_type,
        };
      });
    } catch (e) {
      return c.json(
        {
          error: `video fetch failed: ${videoFetchFailureMessage(e)}`,
          ...(e instanceof UntrustedVideoResultOriginError
            ? { code: e.code }
            : {}),
          model_id: d.model_id,
          provider_id: resolved.provider_id,
        },
        502
      );
    }

    return c.json({
      model_id: resolved.model_id,
      provider_id: resolved.provider_id,
      videos,
    });
  });
}
