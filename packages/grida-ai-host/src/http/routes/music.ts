import type { GGDiscoveryStore } from "@grida/ai";
/**
 * GRIDA-SEC-004 / GRIDA-SEC-006 — hosted music generation.
 *
 * This route receives only the GG session authority needed for Lyria. It does
 * not receive the BYOK secrets store used by the separate ElevenLabs Sound
 * Effects route.
 */

import type { Hono } from "hono";
import { MusicClient } from "@grida/ai";
import type { MediaPersistence } from "@grida/daemon/server";
import { body, v } from "@grida/daemon/server";
import type { GridaGatewaySessionStore } from "../../providers/gg-session";
import { ProviderHttp } from "../../providers/http";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { mediaGenerationError } from "./media-generation-errors";

export type MusicRoutesDeps = {
  media?: MediaPersistence | null;
  gg?: GridaGatewaySessionStore;
  gg_base_url?: string;
  provider_http?: ProviderHttp;
  gg_catalog?: GGDiscoveryStore;
};

export function registerMusicRoutes(app: Hono, deps: MusicRoutesDeps) {
  const providerHttp = deps.provider_http ?? new ProviderHttp();

  // GRIDA-GG: provider — hosted music generation.
  // GRIDA-SEC-006 — the shared operation reads the scoped token at submission.
  app.post("/audio/music/generate", async (c) => {
    const r = await body(c, {
      model_id: v.string,
      prompt: v.string,
      seed: v.optional(v.number),
      request_id: v.optional(
        v.matching(/^req_[A-Za-z0-9_-]{1,160}$/, "must be a GG request ID")
      ),
    });
    if (!r.ok) return r.res;
    const { model_id, prompt, seed, request_id } = r.data;
    if (!deps.gg || !deps.gg_base_url) {
      return c.json(
        { error: "hosted music generation is unavailable", provider_id: "gg" },
        400
      );
    }

    let acceptedRequestId = request_id;
    try {
      const client = new MusicClient({
        http: providerHttp,
        gg: deps.gg,
        gg_base_url: deps.gg_base_url,
        gg_catalog: deps.gg_catalog,
      });
      const result =
        request_id !== undefined
          ? await client.recover({
              model_id,
              request_id,
              signal: c.req.raw.signal,
            })
          : await (
              await client.resolve({ model_id, provider: "gg" })
            ).generate({
              prompt,
              seed,
              signal: c.req.raw.signal,
            });
      acceptedRequestId = result.request_id ?? acceptedRequestId;
      // The host owns wire encoding and filenames. Provider metadata never
      // enters a receipt; preserve the hosted route's canonical model basename.
      const audio = {
        base64: Buffer.from(result.audio.data).toString("base64"),
        media_type: result.audio.media_type,
        file_name: `${model_id.split("/").at(-1) ?? "music"}.mp3`,
      };
      const storedMedia = await GeneratedMediaPersistence.save(
        deps.media,
        audio
      );
      return c.json({
        model_id: model_id,
        provider_id: "gg",
        audio,
        ...(storedMedia ? { stored_media: storedMedia } : {}),
      });
    } catch (error) {
      if (error instanceof MusicClient.Failure) {
        if (error.code === "invalid_input") {
          return c.json(
            { error: "invalid music input", code: error.code },
            400
          );
        }
        if (error.code === "model_unavailable") {
          return c.json({ error: "music model is unavailable", model_id }, 400);
        }
      }
      return mediaGenerationError(c, {
        error:
          error instanceof MusicClient.Failure
            ? new MusicClient.Failure(
                error.code,
                error.request_id ?? acceptedRequestId
              )
            : new MusicClient.Failure("generation_failed", acceptedRequestId),
        scope: "agent-host-music",
        label: "music generation failed",
        model_id,
        provider_id: "gg",
      });
    }
  });
}
