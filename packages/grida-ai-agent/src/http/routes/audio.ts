/**
 * GRIDA-SEC-004 — Desktop audio-generation routes.
 *
 * Music is a hosted GG operation and sound effects use the user's ElevenLabs
 * key. They remain separate endpoints and normalize to MP3 bytes; neither path
 * returns a provider URL, key, or raw upstream error body.
 */

import type { Hono } from "hono";
import { models } from "@grida/ai-models";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { body, v } from "@grida/daemon/server";
import type {
  MusicGenerateRequest,
  SoundEffectGenerateRequest,
} from "../../protocol/audio";
import { ElevenLabsSoundEffectProvider } from "../../providers/audio-byok";
import { GridaGatewayMusicProvider } from "../../providers/gg-media";
import type { GridaGatewaySessionStore } from "../../providers/gg-session";
import { ProviderHttp } from "../../providers/http";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { mediaGenerationError } from "./media-generation-errors";

const MUSIC_MODEL_IDS = models.audio.music_model_ids;
const SOUND_EFFECT_MODEL_IDS = models.audio.sound_effect_model_ids;
const MAX_MUSIC_PROMPT_CHARACTERS = 4_096;
const MAX_SOUND_EFFECT_PROMPT_CHARACTERS = 450;

export type AudioRoutesDeps = {
  secrets: SecretsStore;
  media?: MediaPersistence | null;
  gg?: GridaGatewaySessionStore;
  gg_base_url?: string;
  provider_http?: ProviderHttp;
};

export function registerAudioRoutes(app: Hono, deps: AudioRoutesDeps) {
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
        scope: "agent-host-audio-music",
        label: "music generation failed",
        model_id: request.model_id,
        provider_id: "gg",
      });
    }
  });

  app.post("/audio/sound-effects/generate", async (c) => {
    const r = await body(c, {
      model_id: v.oneOf(SOUND_EFFECT_MODEL_IDS),
      prompt: v.string,
      duration_seconds: v.optional(v.number),
      loop: v.optional(v.boolean),
      prompt_influence: v.optional(v.number),
    });
    if (!r.ok) return r.res;
    const prompt = r.data.prompt.trim();
    if (!prompt) return c.json({ error: "prompt must not be blank" }, 400);
    if ([...prompt].length > MAX_SOUND_EFFECT_PROMPT_CHARACTERS) {
      return c.json(
        {
          error: `prompt must not exceed ${MAX_SOUND_EFFECT_PROMPT_CHARACTERS} characters`,
        },
        400
      );
    }
    if (
      r.data.duration_seconds !== undefined &&
      (r.data.duration_seconds < 0.5 || r.data.duration_seconds > 30)
    ) {
      return c.json(
        { error: "duration_seconds must be between 0.5 and 30" },
        400
      );
    }
    if (
      r.data.prompt_influence !== undefined &&
      (r.data.prompt_influence < 0 || r.data.prompt_influence > 1)
    ) {
      return c.json({ error: "prompt_influence must be between 0 and 1" }, 400);
    }
    const apiKey = await deps.secrets._getKey("elevenlabs");
    if (!apiKey?.trim()) {
      return c.json(
        {
          error: "no ElevenLabs key is connected",
          provider_id: "elevenlabs",
        },
        400
      );
    }

    const request: SoundEffectGenerateRequest = {
      model_id: r.data.model_id,
      prompt,
      ...(r.data.duration_seconds === undefined
        ? {}
        : { duration_seconds: r.data.duration_seconds }),
      ...(r.data.loop === undefined ? {} : { loop: r.data.loop }),
      ...(r.data.prompt_influence === undefined
        ? {}
        : { prompt_influence: r.data.prompt_influence }),
    };
    try {
      const audio = await new ElevenLabsSoundEffectProvider(
        apiKey.trim(),
        providerHttp
      ).generate(request, c.req.raw.signal);
      const storedMedia = await GeneratedMediaPersistence.save(
        deps.media,
        audio
      );
      return c.json({
        model_id: request.model_id,
        provider_id: "elevenlabs" as const,
        audio,
        ...(storedMedia ? { stored_media: storedMedia } : {}),
      });
    } catch (error) {
      return mediaGenerationError(c, {
        error,
        scope: "agent-host-audio-sound-effects",
        label: "sound-effect generation failed",
        model_id: request.model_id,
        provider_id: "elevenlabs",
      });
    }
  });
}
