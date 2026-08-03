/**
 * GRIDA-SEC-004 / GRIDA-SEC-006 — hosted music generation.
 *
 * This route receives only the GG session authority needed for Lyria. It does
 * not receive the BYOK secrets store used by the separate ElevenLabs Sound
 * Effects route.
 */

import type { Hono } from "hono";
import { models } from "@grida/ai-models";
import type { MediaPersistence } from "@grida/daemon/server";
import { body, v } from "@grida/daemon/server";
import type { MusicGenerateRequest } from "../../protocol/music";
import { GridaGatewayMusicProvider } from "../../providers/gg-media";
import type { GridaGatewaySessionStore } from "../../providers/gg-session";
import { ProviderHttp } from "../../providers/http";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { mediaGenerationError } from "./media-generation-errors";

const MUSIC_MODEL_IDS = models.audio.music.model_ids;
const MAX_MUSIC_PROMPT_CHARACTERS = 4_096;

export type MusicRoutesDeps = {
  media?: MediaPersistence | null;
  gg?: GridaGatewaySessionStore;
  gg_base_url?: string;
  provider_http?: ProviderHttp;
};

export function registerMusicRoutes(app: Hono, deps: MusicRoutesDeps) {
  const providerHttp = deps.provider_http ?? new ProviderHttp();

  // GRIDA-GG: provider — hosted music generation.
  // GRIDA-SEC-006 — the session token is read per call by the GG adapter.
  app.post("/audio/music/generate", async (c) => {
    const r = await body(c, {
      model_id: v.oneOf(MUSIC_MODEL_IDS),
      prompt: v.string,
      seed: v.optional(v.number),
    });
    if (!r.ok) return r.res;
    const prompt = r.data.prompt.trim();
    if (!prompt) return c.json({ error: "prompt must not be blank" }, 400);
    if ([...prompt].length > MAX_MUSIC_PROMPT_CHARACTERS) {
      return c.json(
        {
          error: `prompt must not exceed ${MAX_MUSIC_PROMPT_CHARACTERS} characters`,
        },
        400
      );
    }
    if (r.data.seed !== undefined && !Number.isSafeInteger(r.data.seed)) {
      return c.json({ error: "seed must be a safe integer" }, 400);
    }
    if (!deps.gg || !deps.gg_base_url) {
      return c.json(
        { error: "hosted music generation is unavailable", provider_id: "gg" },
        400
      );
    }

    const request: MusicGenerateRequest = {
      model_id: r.data.model_id,
      prompt,
      ...(r.data.seed === undefined ? {} : { seed: r.data.seed }),
    };
    try {
      const result = await new GridaGatewayMusicProvider(
        deps.gg,
        deps.gg_base_url,
        providerHttp
      ).generate(request, c.req.raw.signal);
      const storedMedia = await GeneratedMediaPersistence.save(
        deps.media,
        result.audio
      );
      return c.json({
        model_id: result.model_id,
        provider_id: result.provider_id,
        audio: result.audio,
        ...(storedMedia ? { stored_media: storedMedia } : {}),
      });
    } catch (error) {
      return mediaGenerationError(c, {
        error,
        scope: "agent-host-music",
        label: "music generation failed",
        model_id: request.model_id,
        provider_id: "gg",
      });
    }
  });
}
