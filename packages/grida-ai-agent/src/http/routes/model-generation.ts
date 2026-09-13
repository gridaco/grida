/**
 * GRIDA-SEC-004 — direct Tripo BYOK model generation behind the daemon perimeter.
 * The SDK owns the exact feature/model/input contract, uploads and job lifecycle.
 * This adapter owns wire bounds, concurrency, encoding and local persistence.
 */
// GRIDA-SEC-006 / GRIDA-GG: provider — explicit hosted or BYOK authority.
import type { GridaGatewaySessionStore } from "../../providers/gg-session";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { MediaOperations, ProviderHttp, TripoClient } from "@grida/ai";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { GeneratedMediaPersistence } from "./generated-media-persistence";

export type ModelGenerationRoutesDeps = {
  secrets: SecretsStore;
  media?: MediaPersistence | null;
  provider_http?: ProviderHttp;
  gg?: GridaGatewaySessionStore;
  gg_base_url?: string;
};

type Parsed = Extract<MediaOperations.Parsed, { feature: "model-generation" }>;

export function registerModelGenerationRoutes(
  app: Hono,
  deps: ModelGenerationRoutesDeps
) {
  const http = deps.provider_http ?? new ProviderHttp();
  const operations = new MediaOperations();
  let active = false;
  app.post(
    "/model-generation/generate",
    // Reserve before bodyLimit buffers or the SDK decodes image data. This
    // middleware belongs only to the generation POST, not the surrounding group.
    async (c, next) => {
      if (active)
        return c.json(
          {
            error: "Another model generation is in progress.",
            code: "model_generation_busy",
          },
          429
        );
      active = true;
      try {
        await next();
      } finally {
        active = false;
      }
    },
    bodyLimit({ maxSize: 48 * 1024 * 1024 }),
    async (c) => {
      let provider: TripoClient.Provider = "tripo";
      let completedTaskId: string | undefined;
      try {
        const raw: unknown = await c.req.json().catch(() => null);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid();
        const value = raw as Record<string, unknown>;
        if (
          Object.keys(value).some(
            (key) => !["model_id", "provider", "variant", "input"].includes(key)
          ) ||
          typeof value.model_id !== "string" ||
          (value.provider !== "tripo" && value.provider !== "gg") ||
          !["text", "image", "multiview"].includes(String(value.variant))
        )
          invalid();
        provider = value.provider;
        // One normative JSON parser validates and bounds decoded bytes before keys or uploads.
        const parsed = operations.parseInput(
          {
            kind: "three-d",
            feature: "model-generation",
            model_id: value.model_id,
            provider: value.provider,
            variant: value.variant as TripoClient.Variant,
          },
          value.input
        );
        if (parsed.kind !== "three-d" || parsed.provider_id === "fal")
          invalid();
        const client = new TripoClient({
          keys: { get: (provider) => deps.secrets._getKey(provider) },
          http,
          gg: deps.gg,
          gg_base_url: deps.gg_base_url,
        });
        const result = await generate(client, parsed, c.req.raw.signal);
        completedTaskId = result.task.id;
        const glb = {
          base64: Buffer.from(result.glb.data).toString("base64"),
          media_type: result.glb.media_type,
          file_name: "model.glb",
        };
        const stored = await GeneratedMediaPersistence.save(deps.media, glb);
        return c.json({
          feature: "model-generation",
          model_id: parsed.model_id,
          provider_id: parsed.provider_id,
          variant: parsed.variant,
          glb,
          task: result.task,
          ...(stored ? { stored_media: stored } : {}),
        });
      } catch (error) {
        const failure =
          error instanceof TripoClient.Failure
            ? error
            : new TripoClient.Failure(
                error instanceof MediaOperations.Failure
                  ? "invalid_input"
                  : "generation_failed"
              );
        // SDK success remains accepted even if later encoding or host persistence fails.
        const taskId = completedTaskId ?? failure.task_id;
        const response = {
          // The generic daemon error transport preserves messages, not extra
          // fields. Keep the validated task identity visible across that seam.
          error:
            message(failure.code, provider) +
            (taskId ? ` Tripo task: ${taskId}.` : ""),
          code: failure.code,
          provider_id: provider,
          ...(taskId ? { task_id: taskId } : {}),
        };
        switch (failure.code) {
          case "invalid_input":
          case "model_unavailable":
          case "provider_key_required":
            return c.json(response, 400);
          case "gg_token_expired":
          case "credential_rejected":
            return c.json(response, 401);
          case "access_denied":
            return c.json(response, 403);
          case "insufficient_credits":
            return c.json(response, 402);
          case "timeout":
            return c.json(response, 504);
          case "provider_unavailable":
            return c.json(response, 503);
          default:
            return c.json(response, 502);
        }
      }
    }
  );
}

async function generate(
  client: TripoClient,
  parsed: Parsed,
  signal: AbortSignal
): Promise<TripoClient.Result> {
  // Resolve each exact public signature; no casts merge incompatible model options.
  switch (parsed.model_id) {
    case "tripo/h3.1":
      switch (parsed.variant) {
        case "text":
          return (await client.resolve(parsed.selection)).generate({
            ...parsed.input,
            signal,
          });
        case "image":
          return (await client.resolve(parsed.selection)).generate({
            ...parsed.input,
            signal,
          });
        case "multiview":
          return (await client.resolve(parsed.selection)).generate({
            ...parsed.input,
            signal,
          });
      }
      break;
    case "tripo/p1":
      switch (parsed.variant) {
        case "text":
          return (await client.resolve(parsed.selection)).generate({
            ...parsed.input,
            signal,
          });
        case "image":
          return (await client.resolve(parsed.selection)).generate({
            ...parsed.input,
            signal,
          });
        case "multiview":
          return (await client.resolve(parsed.selection)).generate({
            ...parsed.input,
            signal,
          });
      }
      break;
    case "tripo/p2":
      switch (parsed.variant) {
        case "text":
          return (await client.resolve(parsed.selection)).generate({
            ...parsed.input,
            signal,
          });
        case "image":
          return (await client.resolve(parsed.selection)).generate({
            ...parsed.input,
            signal,
          });
        case "multiview":
          return (await client.resolve(parsed.selection)).generate({
            ...parsed.input,
            signal,
          });
      }
      break;
  }
  throw new TripoClient.Failure("invalid_input");
}
function invalid(): never {
  throw new TripoClient.Failure("invalid_input");
}
function message(
  code: TripoClient.FailureCode,
  provider: TripoClient.Provider
): string {
  switch (code) {
    case "gg_token_expired":
      return "Sign in to Grida again to use Grida credits.";
    case "provider_key_required":
      return "Connect a Tripo API key in Settings.";
    case "credential_rejected":
      return "Tripo rejected the API key. Check it in Settings.";
    case "access_denied":
      return "The Tripo API key does not have access to this operation.";
    case "insufficient_credits":
      return provider === "gg"
        ? "The Grida organization has insufficient credits."
        : "The Tripo account has insufficient API credits.";
    case "invalid_input":
      return "Invalid model-generation input.";
    case "model_unavailable":
      return "The selected Tripo model is unavailable.";
    case "provider_unavailable":
      return "The Tripo service is currently unavailable.";
    case "timeout":
      return "Tripo generation timed out. The accepted task may still complete and be charged.";
    case "aborted":
      return "Generation was interrupted. The accepted task may still complete and be charged.";
    default:
      return "Tripo generation failed. An accepted task was not resubmitted.";
  }
}
