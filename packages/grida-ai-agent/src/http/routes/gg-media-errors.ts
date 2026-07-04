// GRIDA-GG: provider — hosted media-generation error mapping (docs/wg/platform/hosted-ai.md)
/**
 * GRIDA-SEC-004/006 — the shared renderer-safe error posture for the hosted
 * image + video generation routes.
 *
 * 401/402 are ACTIONABLE for the renderer, so the bare code is surfaced
 * (GRIDA-SEC-006); every other failure logs its detail — which can embed
 * upstream body text (fal/OpenRouter adapters call `safeText(res)`) — in the
 * sidecar ONLY and returns a generic 502. Single-sourced so both routes keep
 * the identical, non-leaking contract.
 */

import type { Context } from "hono";

export function hostedGenerationError(
  c: Context,
  args: {
    error: unknown;
    /** Log tag, e.g. `agent-host-images`. */
    scope: string;
    /** Renderer-facing generic 502 message, e.g. `image generation failed`. */
    label: string;
    model_id: string;
    provider_id: string;
  }
): Response {
  const code = (args.error as { code?: unknown })?.code;
  if (code === "gg_token_expired") {
    return c.json(
      { error: "gg session expired", code, provider_id: "gg" },
      401
    );
  }
  if (code === "insufficient_credits") {
    return c.json(
      { error: "insufficient AI credits", code, provider_id: "gg" },
      402
    );
  }
  const detail =
    args.error instanceof Error ? args.error.message : String(args.error);
  const upstream = (args.error as { responseBody?: unknown })?.responseBody;
  console.error(
    `[${args.scope}] failed provider=${args.provider_id} model=${args.model_id}: ${detail}` +
      (upstream ? ` — ${String(upstream).slice(0, 300)}` : "")
  );
  return c.json(
    {
      error: args.label,
      model_id: args.model_id,
      provider_id: args.provider_id,
    },
    502
  );
}
