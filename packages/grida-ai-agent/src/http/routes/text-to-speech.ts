/**
 * GRIDA-SEC-004 — ElevenLabs Text to Speech generation and voice discovery.
 *
 * The route receives only the BYOK secrets authority needed to resolve the
 * user's ElevenLabs key. Provider credentials and unprojected voice metadata
 * never cross to the renderer.
 */

import type { Context, Hono } from "hono";
import { models } from "@grida/ai-models";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { body, v } from "@grida/daemon/server";
import type {
  TextToSpeechGenerateRequest,
  TextToSpeechGenerateResult,
  TextToSpeechListVoicesResult,
} from "../../protocol/text-to-speech";
import { ElevenLabsTextToSpeechProvider } from "../../providers/elevenlabs-text-to-speech";
import { ProviderHttp } from "../../providers/http";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { mediaGenerationError } from "./media-generation-errors";

const TEXT_TO_SPEECH_MODEL_IDS = models.audio.text_to_speech.model_ids;
const MAX_TEXT_CHARACTERS =
  models.audio.text_to_speech.models.eleven_v3.input.max_characters;
const MAX_VOICE_ID_CHARACTERS = 256;

export type TextToSpeechRoutesDeps = {
  secrets: SecretsStore;
  media?: MediaPersistence | null;
  provider_http?: ProviderHttp;
};

export function registerTextToSpeechRoutes(
  app: Hono,
  deps: TextToSpeechRoutesDeps
) {
  const providerHttp = deps.provider_http ?? new ProviderHttp();

  app.get("/audio/text-to-speech/voices", async (c) => {
    const apiKey = await deps.secrets._getKey("elevenlabs");
    if (!apiKey?.trim()) return providerKeyRequired(c);

    try {
      const voices = await new ElevenLabsTextToSpeechProvider(
        apiKey.trim(),
        providerHttp
      ).listVoices(c.req.raw.signal);
      const result: TextToSpeechListVoicesResult = {
        provider_id: "elevenlabs",
        voices,
      };
      return c.json(result);
    } catch (error) {
      if ((error as { code?: unknown })?.code === "provider_access_denied") {
        return c.json(
          {
            error: "provider_access_denied: provider access denied",
            code: "provider_access_denied" as const,
            provider_id: "elevenlabs" as const,
          },
          403
        );
      }
      const detail = error instanceof Error ? error.message : String(error);
      console.error(
        `[agent-host-text-to-speech] failed provider=elevenlabs operation=list-voices: ${detail}`
      );
      return c.json(
        { error: "voice listing failed", provider_id: "elevenlabs" },
        502
      );
    }
  });

  app.post("/audio/text-to-speech/generate", async (c) => {
    const r = await body(c, {
      model_id: v.oneOf(TEXT_TO_SPEECH_MODEL_IDS),
      voice_id: v.string,
      text: v.string,
    });
    if (!r.ok) return r.res;

    const voiceId = r.data.voice_id.trim();
    if (!voiceId) return c.json({ error: "voice_id must not be blank" }, 400);
    if ([...voiceId].length > MAX_VOICE_ID_CHARACTERS) {
      return c.json(
        {
          error: `voice_id must not exceed ${MAX_VOICE_ID_CHARACTERS} characters`,
        },
        400
      );
    }
    if (voiceId === "." || voiceId === "..") {
      return c.json({ error: "voice_id must not be a dot path segment" }, 400);
    }
    if (!r.data.text.trim()) {
      return c.json({ error: "text must not be blank" }, 400);
    }
    if ([...r.data.text].length > MAX_TEXT_CHARACTERS) {
      return c.json(
        { error: `text must not exceed ${MAX_TEXT_CHARACTERS} characters` },
        400
      );
    }

    const apiKey = await deps.secrets._getKey("elevenlabs");
    if (!apiKey?.trim()) return providerKeyRequired(c);

    const request: TextToSpeechGenerateRequest = {
      model_id: r.data.model_id,
      voice_id: voiceId,
      text: r.data.text,
    };
    try {
      const audio = await new ElevenLabsTextToSpeechProvider(
        apiKey.trim(),
        providerHttp
      ).generate(request, c.req.raw.signal);
      const storedMedia = await GeneratedMediaPersistence.save(
        deps.media,
        audio
      );
      const result: TextToSpeechGenerateResult = {
        model_id: request.model_id,
        provider_id: "elevenlabs",
        voice_id: request.voice_id,
        audio,
        ...(storedMedia ? { stored_media: storedMedia } : {}),
      };
      return c.json(result);
    } catch (error) {
      return mediaGenerationError(c, {
        error,
        scope: "agent-host-text-to-speech",
        label: "text-to-speech generation failed",
        model_id: request.model_id,
        provider_id: "elevenlabs",
      });
    }
  });
}

function providerKeyRequired(c: Context): Response {
  return c.json(
    {
      error: "no ElevenLabs key is connected",
      code: "provider_key_required" as const,
      provider_id: "elevenlabs" as const,
    },
    400
  );
}
