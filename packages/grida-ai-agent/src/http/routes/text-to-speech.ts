/**
 * GRIDA-SEC-004 — ElevenLabs speech generation and voice discovery.
 *
 * The public operation owns model/input validation, credential selection, and
 * provider execution. This host route owns HTTP shape, renderer wire values,
 * and optional persistence; it receives no GG authority.
 */

import type { Context, Hono } from "hono";
import { TextToSpeechClient } from "@grida/ai";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { body, v } from "@grida/daemon/server";
import type { TextToSpeechListVoicesResult } from "../../protocol/text-to-speech";
import { ProviderHttp } from "../../providers/http";
import { ModelCatalogStore } from "../../providers/model-catalog";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { mediaGenerationError } from "./media-generation-errors";

export type TextToSpeechRoutesDeps = {
  secrets: SecretsStore;
  media?: MediaPersistence | null;
  provider_http?: ProviderHttp;
  catalog?: ModelCatalogStore;
};

export function registerTextToSpeechRoutes(
  app: Hono,
  deps: TextToSpeechRoutesDeps
) {
  const speech = new TextToSpeechClient({
    catalog: deps.catalog ?? new ModelCatalogStore(),
    keys: { get: (provider) => deps.secrets._getKey(provider) },
    http: deps.provider_http ?? new ProviderHttp(),
  });

  app.get("/audio/text-to-speech/voices", async (c) => {
    try {
      const voices = await speech.listVoices({
        provider: "elevenlabs",
        signal: c.req.raw.signal,
      });
      const result: TextToSpeechListVoicesResult = {
        provider_id: "elevenlabs",
        voices: voices.map(({ voice_id, name }) => ({ voice_id, name })),
      };
      return c.json(result);
    } catch (error) {
      const accessError = providerAccessError(c, error);
      if (accessError) return accessError;
      const failure =
        error instanceof TextToSpeechClient.Failure
          ? error
          : new TextToSpeechClient.Failure("generation_failed");
      console.error(
        `[agent-host-text-to-speech] failed provider=elevenlabs operation=list-voices: ${failure.code}`
      );
      return c.json(
        { error: "voice listing failed", provider_id: "elevenlabs" },
        502
      );
    }
  });

  app.post("/audio/text-to-speech/generate", async (c) => {
    const r = await body(c, {
      model_id: v.string,
      voice_id: v.string,
      text: v.string,
    });
    if (!r.ok) return r.res;
    const { model_id, voice_id, text } = r.data;
    try {
      const operation = await speech.resolve({
        model_id,
        provider: "elevenlabs",
        voice_id,
      });
      const result = await operation.generate({
        text,
        signal: c.req.raw.signal,
      });
      const audio = {
        base64: Buffer.from(result.audio.data).toString("base64"),
        media_type: result.audio.media_type,
        file_name: "speech.mp3",
      };
      const storedMedia = await GeneratedMediaPersistence.save(
        deps.media,
        audio
      );
      return c.json({
        model_id: operation.model_id,
        provider_id: operation.provider_id,
        voice_id: operation.voice_id,
        audio,
        ...(storedMedia ? { stored_media: storedMedia } : {}),
      });
    } catch (error) {
      const accessError = providerAccessError(c, error);
      if (accessError) return accessError;
      if (error instanceof TextToSpeechClient.Failure) {
        if (error.code === "invalid_input") {
          return c.json(
            { error: "invalid text-to-speech input", code: error.code },
            400
          );
        }
        if (error.code === "model_unavailable") {
          return c.json(
            { error: "text-to-speech model is unavailable", model_id },
            400
          );
        }
      }
      return mediaGenerationError(c, {
        error:
          error instanceof TextToSpeechClient.Failure
            ? error
            : new TextToSpeechClient.Failure("generation_failed"),
        scope: "agent-host-text-to-speech",
        label: "text-to-speech generation failed",
        model_id,
        provider_id: "elevenlabs",
      });
    }
  });
}

function providerAccessError(c: Context, error: unknown): Response | null {
  if (!(error instanceof TextToSpeechClient.Failure)) return null;
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
  if (error.code === "provider_access_denied") {
    return c.json(
      {
        error: "provider_access_denied: provider access denied",
        code: error.code,
        provider_id: "elevenlabs",
      },
      403
    );
  }
  return null;
}
