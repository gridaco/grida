/**
 * GRIDA-SEC-004 — `POST /three-d/generate`.
 *
 * Closed-catalogue fal BYOK generation. The renderer supplies either one
 * bounded image or a prompt according to the selected model; the response is
 * the downloaded primary GLB bytes only. Provider keys, queue URLs, result
 * URLs, and upstream bodies never cross this route.
 */

import type { Hono } from "hono";
import { models } from "@grida/ai-models";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { body, v } from "@grida/daemon/server";
import type {
  ThreeDGenerateRequest,
  ThreeDInputImage,
} from "../../protocol/three-d";
import { FalThreeDProvider } from "../../providers/fal-three-d";
import { ProviderHttp } from "../../providers/http";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { mediaGenerationError } from "./media-generation-errors";

const THREE_D_MODEL_IDS = models.three_d.three_d_model_ids;
const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BASE64_CHARACTERS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

const optionalImage = v.optional<ThreeDInputImage>((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "must be an image object" };
  }
  const image = raw as Record<string, unknown>;
  if (
    typeof image.media_type !== "string" ||
    !(IMAGE_MEDIA_TYPES as readonly string[]).includes(image.media_type)
  ) {
    return {
      ok: false,
      error: `media_type must be one of: ${IMAGE_MEDIA_TYPES.join(", ")}`,
    };
  }
  if (
    typeof image.base64 !== "string" ||
    image.base64.length > MAX_IMAGE_BASE64_CHARACTERS ||
    !validBase64(image.base64)
  ) {
    return { ok: false, error: "base64 must be valid non-empty base64" };
  }
  const bytes = Buffer.from(image.base64, "base64");
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, error: "must not exceed 8 MiB" };
  }
  return {
    ok: true,
    value: {
      base64: image.base64,
      media_type: image.media_type as ThreeDInputImage["media_type"],
    },
  };
});

export type ThreeDRoutesDeps = {
  secrets: SecretsStore;
  media?: MediaPersistence | null;
  provider_http?: ProviderHttp;
};

export function registerThreeDRoutes(app: Hono, deps: ThreeDRoutesDeps) {
  const providerHttp = deps.provider_http ?? new ProviderHttp();

  app.post("/three-d/generate", async (c) => {
    const r = await body(c, {
      model_id: v.oneOf(THREE_D_MODEL_IDS),
      prompt: v.optional(v.string),
      image: optionalImage,
    });
    if (!r.ok) return r.res;
    const modelId = r.data.model_id;
    const prompt = r.data.prompt?.trim();
    let request: ThreeDGenerateRequest;

    if (models.three_d.is_text_to_three_d_model_id(modelId)) {
      const textInput = models.three_d.models[modelId].input;
      if (!prompt || r.data.image) {
        return c.json(
          { error: "text-to-3D requires prompt and does not accept image" },
          400
        );
      }
      if ([...prompt].length > textInput.max_utf8_characters) {
        return c.json(
          {
            error: `prompt must not exceed ${textInput.max_utf8_characters} characters`,
          },
          400
        );
      }
      request = { model_id: modelId, prompt };
    } else {
      const image = r.data.image;
      if (!image || prompt) {
        return c.json(
          {
            error: "image-to-3D requires one image and does not accept prompt",
          },
          400
        );
      }
      request = { model_id: modelId, image };
    }

    const apiKey = await deps.secrets._getKey("fal");
    if (!apiKey?.trim()) {
      return c.json(
        { error: "no fal key is connected", provider_id: "fal" },
        400
      );
    }

    try {
      const glb = await new FalThreeDProvider(
        apiKey.trim(),
        providerHttp
      ).generate(request, c.req.raw.signal);
      const storedMedia = await GeneratedMediaPersistence.save(deps.media, glb);
      return c.json({
        model_id: request.model_id,
        provider_id: "fal" as const,
        glb,
        ...(storedMedia ? { stored_media: storedMedia } : {}),
      });
    } catch (error) {
      return mediaGenerationError(c, {
        error,
        scope: "agent-host-three-d",
        label: "3D generation failed",
        model_id: request.model_id,
        provider_id: "fal",
      });
    }
  });
}

function validBase64(value: string): boolean {
  return (
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}
