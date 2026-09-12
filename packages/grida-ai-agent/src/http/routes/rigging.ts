/**
 * GRIDA-SEC-004 — explicit mesh operations behind the existing daemon perimeter.
 * The SDK owns model/input semantics and provider execution. This adapter owns
 * wire admission, one-operation memory reservation and durable media receipts.
 */
// GRIDA-SEC-006 / GRIDA-GG: provider — explicit hosted or BYOK authority.
import type { GridaGatewaySessionStore } from "../../providers/gg-session";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ProviderHttp, RiggingClient, RiggingOperations } from "@grida/ai";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { GeneratedMediaPersistence } from "./generated-media-persistence";

export type RiggingRoutesDeps = {
  secrets: SecretsStore;
  media?: MediaPersistence | null;
  provider_http?: ProviderHttp;
  gg?: GridaGatewaySessionStore;
  gg_base_url?: string;
};

export function registerRiggingRoutes(app: Hono, deps: RiggingRoutesDeps) {
  const http = deps.provider_http ?? new ProviderHttp();
  const operations = new RiggingOperations();
  let active = false;
  // Reserve before JSON/body decoding: two large source meshes cannot be
  // buffered together by this route group, even when one is only a check.
  app.use("/rigging/*", async (c, next) => {
    if (active)
      return c.json(
        {
          error: "Another rigging operation is in progress.",
          code: "rigging_busy",
        },
        429
      );
    active = true;
    try {
      await next();
    } finally {
      active = false;
    }
  });

  for (const feature of ["rig-check", "rigging"] as const) {
    app.post(
      feature === "rig-check" ? "/rigging/check" : "/rigging/generate",
      bodyLimit({
        maxSize: Math.ceil(RiggingClient.max_mesh_bytes / 3) * 4 + 4096,
      }),
      async (c) => {
        let provider: RiggingClient.Provider = "tripo";
        try {
          const raw: unknown = await c.req.json().catch(() => null);
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid();
          const value = raw as Record<string, unknown>;
          const keys =
            feature === "rig-check"
              ? ["provider", "input"]
              : ["provider", "model_id", "input"];
          if (
            Object.keys(value).some((key) => !keys.includes(key)) ||
            (value.provider !== "tripo" && value.provider !== "gg") ||
            (feature === "rigging" && typeof value.model_id !== "string")
          )
            invalid();
          provider = value.provider;
          const parsed = operations.parseInput(
            feature === "rig-check"
              ? { feature, provider: value.provider }
              : {
                  feature,
                  provider: value.provider,
                  model_id: value.model_id as string,
                },
            value.input
          );
          const client = new RiggingClient({
            keys: { get: (provider) => deps.secrets._getKey(provider) },
            http,
            gg: deps.gg,
            gg_base_url: deps.gg_base_url,
          });
          if (parsed.feature === "rig-check") {
            const operation = await client.resolve(parsed.selection);
            const result = await operation.check({
              ...parsed.input,
              signal: c.req.raw.signal,
            });
            return c.json({
              feature: "rig-check",
              provider_id: parsed.provider_id,
              ...result,
            });
          }
          // Narrow each public model signature so its rig-type correlation is preserved.
          const result =
            parsed.model_id === "tripo/rig-v1.0"
              ? await (
                  await client.resolve(parsed.selection)
                ).generate({ ...parsed.input, signal: c.req.raw.signal })
              : await (
                  await client.resolve(parsed.selection)
                ).generate({ ...parsed.input, signal: c.req.raw.signal });
          const glb = {
            base64: Buffer.from(result.glb.data).toString("base64"),
            media_type: result.glb.media_type,
            file_name: "rigged-model.glb",
          };
          const stored = await GeneratedMediaPersistence.save(deps.media, glb);
          return c.json({
            feature: "rigging",
            provider_id: parsed.provider_id,
            model_id: parsed.model_id,
            glb,
            task: result.task,
            ...(stored ? { stored_media: stored } : {}),
          });
        } catch (error) {
          const failure =
            error instanceof RiggingClient.Failure
              ? error
              : new RiggingClient.Failure(
                  error instanceof RiggingOperations.Failure
                    ? error.code === "operation_unavailable"
                      ? "model_unavailable"
                      : "invalid_input"
                    : "generation_failed"
                );
          const response = {
            error:
              message(failure.code, provider) +
              (failure.task_id ? ` Tripo task: ${failure.task_id}.` : ""),
            code: failure.code,
            provider_id: provider,
            ...(failure.task_id ? { task_id: failure.task_id } : {}),
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
            default:
              return c.json(response, 502);
          }
        }
      }
    );
  }
}
function invalid(): never {
  throw new RiggingClient.Failure("invalid_input");
}
function message(
  code: RiggingClient.FailureCode,
  provider: RiggingClient.Provider
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
      return "Invalid mesh or rigging options.";
    case "model_unavailable":
      return "The selected rigging model is unavailable.";
    case "timeout":
      return "The rigging operation timed out. An accepted task may still complete.";
    case "aborted":
      return "The rigging operation was interrupted. An accepted task may still complete.";
    default:
      return "The rigging operation failed. An accepted task was not resubmitted.";
  }
}
