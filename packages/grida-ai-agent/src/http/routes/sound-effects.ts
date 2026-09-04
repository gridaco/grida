/**
 * GRIDA-SEC-004 — ElevenLabs Sound Effects generation.
 *
 * This route receives only the BYOK secrets authority needed to resolve the
 * user's ElevenLabs key. It has no access to the hosted GG session used by the
 * separate music route.
 */

import type { Hono } from "hono";
import { models } from "@grida/ai-models";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { body, v } from "@grida/daemon/server";
import type { SoundEffectGenerateRequest } from "../../protocol/sound-effects";
import { ElevenLabsSoundEffectProvider } from "../../providers/elevenlabs-sound-effects";
import { ProviderHttp } from "../../providers/http";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { mediaGenerationError } from "./media-generation-errors";

const SOUND_EFFECT_MODEL_IDS = models.audio.sound_effects.model_ids;
const MAX_SOUND_EFFECT_PROMPT_CHARACTERS = 450;

export type SoundEffectsRoutesDeps = {
  secrets: SecretsStore;
  media?: MediaPersistence | null;
  provider_http?: ProviderHttp;
};

export function registerSoundEffectsRoutes(
  app: Hono,
  deps: SoundEffectsRoutesDeps
) {
  const providerHttp = deps.provider_http ?? new ProviderHttp();

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
          code: "provider_key_required",
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
        scope: "agent-host-sound-effects",
        label: "sound-effect generation failed",
        model_id: request.model_id,
        provider_id: "elevenlabs",
      });
    }
  });
}
