/**
 * GRIDA-SEC-004 — `POST /three-d/generate`.
 *
 * Closed-catalogue fal BYOK generation. The renderer supplies either one
 * bounded image or a prompt according to the selected model; the response is
 * the downloaded primary GLB bytes only. Provider keys, queue URLs, result
 * URLs, and upstream bodies never cross this route.
 */

import type { Hono } from "hono";
import { ProviderHttp, ThreeDClient } from "@grida/ai";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { body, v } from "@grida/daemon/server";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { mediaGenerationError } from "./media-generation-errors";

// Bound the wire allocation before decoding. The SDK independently validates
// the decoded image's exact byte ceiling and MIME type.
const MAX_IMAGE_BASE64_CHARACTERS = Math.ceil((8 * 1024 * 1024) / 3) * 4;

const optionalImage = v.optional<ThreeDClient.Image>((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "must be an image object" };
  }
  const image = raw as Record<string, unknown>;
  if (typeof image.media_type !== "string") {
    return { ok: false, error: "media_type must be a string" };
  }
  if (
    typeof image.base64 !== "string" ||
    image.base64.length > MAX_IMAGE_BASE64_CHARACTERS ||
    !validBase64(image.base64)
  ) {
    return { ok: false, error: "base64 must be valid non-empty base64" };
  }
  return {
    ok: true,
    value: {
      data: Buffer.from(image.base64, "base64"),
      // This is untrusted wire data; the public operation validates the MIME
      // value before reading a generation credential or submitting work.
      media_type: image.media_type as ThreeDClient.Image["media_type"],
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
  // One result retains the downloaded GLB, its base64 representation, and the
  // response body together. Keep that provider-shaped memory cost exclusive
  // instead of hiding it behind a generic media-generation concurrency claim.
  let generationActive = false;

  app.post("/three-d/generate", async (c) => {
    const r = await body(c, {
      model_id: v.string,
      prompt: v.optional(v.string),
      image: optionalImage,
    });
    if (!r.ok) return r.res;
    const { model_id, prompt, image } = r.data;
    let ownsGeneration = false;
    try {
      const operation = await new ThreeDClient({
        keys: { get: (provider) => deps.secrets._getKey(provider) },
        http: providerHttp,
      }).resolve({ model_id, provider: "fal" });
      const signal = c.req.raw.signal;
      let generate: () => Promise<ThreeDClient.Glb>;
      // Adapt each exact public operation to this host's existing GLB wire.
      // Structural presence checks prevent dropping incompatible input fields;
      // text normalization and decoded-image policy remain SDK-owned.
      switch (operation.model_id) {
        case "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d":
          if (prompt === undefined || image !== undefined) {
            throw new ThreeDClient.Failure("invalid_input");
          }
          generate = async () =>
            (await operation.generate({ prompt, signal })).glb;
          break;
        case "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d":
        case "fal-ai/trellis-2":
          if (image === undefined || prompt !== undefined) {
            throw new ThreeDClient.Failure("invalid_input");
          }
          generate = async () =>
            (await operation.generate({ image, signal })).glb;
          break;
        default:
          return unsupportedOperation(operation);
      }
      if (generationActive) {
        return c.json(
          {
            error: "another 3D generation is already in progress",
            code: "three_d_generation_busy",
          },
          429
        );
      }
      generationActive = true;
      ownsGeneration = true;
      const result = await generate();
      const glb = {
        base64: Buffer.from(result.data).toString("base64"),
        media_type: result.media_type,
        file_name: "model.glb",
      };
      const storedMedia = await GeneratedMediaPersistence.save(deps.media, glb);
      return c.json({
        model_id: operation.model_id,
        provider_id: operation.provider_id,
        glb,
        ...(storedMedia ? { stored_media: storedMedia } : {}),
      });
    } catch (error) {
      if (error instanceof ThreeDClient.Failure) {
        if (error.code === "provider_key_required") {
          return c.json(
            { error: "no fal key is connected", provider_id: "fal" },
            400
          );
        }
        if (error.code === "invalid_input") {
          return c.json({ error: "invalid 3D input", code: error.code }, 400);
        }
        if (error.code === "model_unavailable") {
          return c.json({ error: "3D model is unavailable", model_id }, 400);
        }
      }
      return mediaGenerationError(c, {
        error:
          error instanceof ThreeDClient.Failure
            ? error
            : new ThreeDClient.Failure("generation_failed"),
        scope: "agent-host-three-d",
        label: "3D generation failed",
        model_id,
        provider_id: "fal",
      });
    } finally {
      if (ownsGeneration) generationActive = false;
    }
  });
}

function unsupportedOperation(_operation: never): never {
  throw new ThreeDClient.Failure("generation_failed");
}

function validBase64(value: string): boolean {
  return (
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}
