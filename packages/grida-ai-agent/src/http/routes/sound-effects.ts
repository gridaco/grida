/**
 * GRIDA-SEC-004 — ElevenLabs Sound Effects generation.
 *
 * The route adapts the host's key and transport capabilities to the shared
 * operation, then owns wire encoding and optional persistence. GG authority is
 * absent; the operation alone owns model and input validation and execution.
 */

import type { Hono } from "hono";
import { SoundEffectClient } from "@grida/ai";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { body, v } from "@grida/daemon/server";
import { ProviderHttp } from "../../providers/http";
import { ModelCatalogStore } from "../../providers/model-catalog";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { mediaGenerationError } from "./media-generation-errors";

export type SoundEffectsRoutesDeps = {
  secrets: SecretsStore;
  media?: MediaPersistence | null;
  provider_http?: ProviderHttp;
  catalog?: ModelCatalogStore;
};

export function registerSoundEffectsRoutes(
  app: Hono,
  deps: SoundEffectsRoutesDeps
) {
  const providerHttp = deps.provider_http ?? new ProviderHttp();

  app.post("/audio/sound-effects/generate", async (c) => {
    const r = await body(c, {
      model_id: v.string,
      prompt: v.string,
      duration_seconds: v.optional(v.number),
      loop: v.optional(v.boolean),
      prompt_influence: v.optional(v.number),
    });
    if (!r.ok) return r.res;
    const { model_id, prompt, duration_seconds, loop, prompt_influence } =
      r.data;
    try {
      const operation = await new SoundEffectClient({
        catalog: deps.catalog ?? new ModelCatalogStore(),
        keys: { get: (provider) => deps.secrets._getKey(provider) },
        http: providerHttp,
      }).resolve({ model_id, provider: "elevenlabs" });
      const result = await operation.generate({
        prompt,
        duration_seconds,
        loop,
        prompt_influence,
        signal: c.req.raw.signal,
      });
      const audio = {
        base64: Buffer.from(result.audio.data).toString("base64"),
        media_type: result.audio.media_type,
        file_name: "sound-effect.mp3",
      };
      const storedMedia = await GeneratedMediaPersistence.save(
        deps.media,
        audio
      );
      return c.json({
        model_id: operation.model_id,
        provider_id: operation.provider_id,
        audio,
        ...(storedMedia ? { stored_media: storedMedia } : {}),
      });
    } catch (error) {
      if (error instanceof SoundEffectClient.Failure) {
        if (error.code === "provider_key_required") {
          return c.json(
            {
              error: "no ElevenLabs key is connected",
              code: error.code,
              provider_id: "elevenlabs",
            },
            400
          );
        }
        if (error.code === "invalid_input") {
          return c.json(
            { error: "invalid sound-effect input", code: error.code },
            400
          );
        }
        if (error.code === "model_unavailable") {
          return c.json(
            { error: "sound-effect model is unavailable", model_id },
            400
          );
        }
      }
      return mediaGenerationError(c, {
        error:
          error instanceof SoundEffectClient.Failure
            ? error
            : new SoundEffectClient.Failure("generation_failed"),
        scope: "agent-host-sound-effects",
        label: "sound-effect generation failed",
        model_id,
        provider_id: "elevenlabs",
      });
    }
  });
}
