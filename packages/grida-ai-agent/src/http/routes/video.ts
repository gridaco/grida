/**
 * GRIDA-SEC-004 — `/video/generate` route (BYOK video generation, #908).
 *
 * Desktop-only, user-BYOK video generation — the video sibling of
 * {@link ./images.ts}. Resolves the user's connected provider for a curated
 * model id, builds the `VideoModelV3` with the key (read internally — never
 * exposed), and returns the generated video (a provider CDN URL, or base64 for
 * inline data).
 *
 * Security contract (reviewed): reads `_getKey` internally (sidecar only); the
 * response carries a URL / base64 + provider id only — never the key, never raw
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
import type { Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions } from "@ai-sdk/provider";
import type { SecretsStore } from "../../secrets";
import {
  VideoModelUnavailableError,
  resolveVideoModel,
} from "../../providers/resolve-video";
import { assertHttpsUrl } from "../../providers/fetch-helpers";
import { body, v } from "../validate";

const VIDEO_PROVIDERS = ["vercel", "fal", "openrouter"] as const;

export type VideoRoutesDeps = {
  secrets: SecretsStore;
};

export function registerVideoRoutes(app: Hono, deps: VideoRoutesDeps) {
  const { secrets } = deps;

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
        { secrets },
        d.model_id,
        d.provider ? { explicit: d.provider } : {}
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
      // Detail (which can include upstream body text — fal adapters embed
      // safeText(res) in their thrown messages) stays in the sidecar log only;
      // the renderer gets a generic message.
      const detail = e instanceof Error ? e.message : String(e);
      const upstream = (e as { responseBody?: unknown })?.responseBody;
      console.error(
        `[agent-host-video] failed provider=${resolved.provider_id} model=${d.model_id}: ${detail}${
          upstream ? ` — ${String(upstream).slice(0, 300)}` : ""
        }`
      );
      return c.json(
        {
          error: "video generation failed",
          model_id: d.model_id,
          provider_id: resolved.provider_id,
        },
        502
      );
    }

    // Normalize every result to base64 bytes. Providers return large clips as
    // CDN URLs, but the desktop renderer can't load cross-origin media under
    // the CSP — so the sidecar downloads them and hands back base64 the
    // renderer plays as a `data:` URL. (The OpenRouter adapter already
    // pre-downloads its authed content endpoint.)
    let videos;
    try {
      videos = await Promise.all(
        generation.videos.map(async (vid) => {
          if (vid.type === "base64")
            return { base64: vid.data, media_type: vid.mediaType };
          if (vid.type === "binary")
            return {
              base64: Buffer.from(vid.data).toString("base64"),
              media_type: vid.mediaType,
            };
          // type === "url": public CDN (fal/vercel) — download in the sidecar.
          // Require HTTPS here; host-level egress control is enforced by the
          // OS sandbox allowlist (sandbox/policy.ts), the primary SSRF defense.
          assertHttpsUrl(
            vid.url,
            `[agent-host-video] ${resolved.provider_id} url`
          );
          const dl = await fetch(vid.url);
          if (!dl.ok) throw new Error(`download failed (${dl.status})`);
          return {
            base64: Buffer.from(await dl.arrayBuffer()).toString("base64"),
            media_type: dl.headers.get("content-type") ?? vid.mediaType,
          };
        })
      );
    } catch (e) {
      return c.json(
        {
          error: `video fetch failed: ${e instanceof Error ? e.message : String(e)}`,
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
