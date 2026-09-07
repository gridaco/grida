/**
 * GRIDA-SEC-004 — `/video/generate` native host route.
 *
 * Resolves a curated model through the shared video operation. The operation
 * owns provider requests, result validation, and downloads; this route returns
 * base64 bytes and optional host persistence receipts, never provider URLs,
 * credentials, or raw upstream JSON. The host supplies provider HTTP authority.
 *
 * GRIDA-SEC-006 — BYOK uses the user's provider key and never enters the web
 * billing seam. The optional GG arm uses a scoped token and is gated and metered
 * by its hosted endpoint. No billing provider-option is added in this process.
 */

import type { Hono } from "hono";
import { VideoClient } from "@grida/ai";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import type { ModelCatalogStore } from "../../providers/model-catalog";
import {
  VideoModelUnavailableError,
  resolveVideoModel,
} from "../../providers/resolve-video";
import { mediaGenerationError } from "./media-generation-errors";
import { body, v } from "@grida/daemon/server";
import type { ProviderHttp } from "../../providers/http";
import type { GeneratedVideo } from "../../protocol/video";
import { GeneratedMediaPersistence } from "./generated-media-persistence";

const VIDEO_PROVIDERS = ["vercel", "fal", "openrouter", "gg"] as const;

export type VideoRoutesDeps = {
  secrets: SecretsStore;
  media?: MediaPersistence | null;
  /** Video catalogue for resolution; absent ⇒ the bundled one. */
  catalog?: ModelCatalogStore;
  // GRIDA-GG: provider — the optional hosted video arm.
  /** GRIDA-SEC-006 — hosted provider deps; absent ⇒ grida never resolves. */
  gg?: import("../../providers/gg-session").GridaGatewaySessionStore;
  gg_base_url?: string;
  provider_http?: ProviderHttp;
};

export function registerVideoRoutes(app: Hono, deps: VideoRoutesDeps) {
  const { secrets, gg, gg_base_url, provider_http, catalog } = deps;

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
        { secrets, gg, gg_base_url, provider_http, catalog },
        d.model_id,
        // The shared operation checks the selected binding's input mode before I/O.
        {
          ...(d.provider ? { explicit: d.provider } : {}),
          image: !!d.image_url,
        }
      );
    } catch (e) {
      if (e instanceof VideoModelUnavailableError) {
        return c.json({ error: e.message, model_id: e.model_id }, 400);
      }
      return c.json(
        { error: "video generation failed", model_id: d.model_id },
        502
      );
    }

    const input: VideoClient.Input = {
      prompt: d.prompt,
      aspect_ratio: d.aspect_ratio
        ? (d.aspect_ratio as `${number}:${number}`)
        : undefined,
      resolution: d.resolution
        ? (d.resolution as `${number}x${number}`)
        : undefined,
      duration: d.duration,
      fps: d.fps,
      seed: d.seed,
      image_url: d.image_url,
      signal: c.req.raw.signal,
    };

    let generation;
    try {
      generation = await resolved.generate(input);
    } catch (e) {
      if (e instanceof VideoClient.Failure) {
        if (e.code === "invalid_input") {
          return c.json({ error: "invalid video input", code: e.code }, 400);
        }
        if (e.code === "unsupported_untrusted_result_origin") {
          return c.json(
            {
              error: "video generation failed",
              code: e.code,
              model_id: d.model_id,
              provider_id: resolved.provider_id,
            },
            502
          );
        }
      }
      return mediaGenerationError(c, {
        error:
          e instanceof VideoClient.Failure
            ? e
            : new VideoClient.Failure("generation_failed"),
        scope: "agent-host-video",
        label: "video generation failed",
        model_id: d.model_id,
        provider_id: resolved.provider_id,
      });
    }

    const persistedVideos: GeneratedVideo[] = [];
    for (const [index, generated] of generation.videos.entries()) {
      const video = {
        base64: Buffer.from(generated.data).toString("base64"),
        media_type: generated.media_type,
      };
      const fileName = GeneratedMediaPersistence.fileName(
        "video",
        index,
        video.media_type
      );
      const storedMedia = fileName
        ? await GeneratedMediaPersistence.save(deps.media, {
            ...video,
            file_name: fileName,
          })
        : undefined;
      persistedVideos.push({
        ...video,
        ...(storedMedia ? { stored_media: storedMedia } : {}),
      });
    }

    return c.json({
      model_id: resolved.model_id,
      provider_id: resolved.provider_id,
      videos: persistedVideos,
    });
  });
}
