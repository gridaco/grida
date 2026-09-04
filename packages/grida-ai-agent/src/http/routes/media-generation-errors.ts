// GRIDA-SEC-004 — renderer-safe media-generation error mapping.
/**
 * Shared error posture for hosted and BYOK media-generation routes.
 *
 * Expected GG session/credit failures remain actionable to the renderer. Every
 * other failure logs its detail — which can embed upstream body text
 * (fal/OpenRouter adapters call `safeText(res)`) — in the sidecar ONLY and
 * returns a generic 502. Single-sourced so every media route keeps the same
 * non-leaking contract without implying that BYOK failures belong to GG.
 */

import type { Context } from "hono";

export function mediaGenerationError(
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

  // GRIDA-GG: provider — actionable hosted-session failures.
  // GRIDA-SEC-006 — preserve literal codes across contextBridge while never
  // reflecting the scoped token or hosted response body.
  if (code === "gg_token_expired") {
    return c.json(
      {
        error: "gg_token_expired: Grida session expired",
        code,
        provider_id: "gg",
      },
      401
    );
  }
  if (code === "insufficient_credits") {
    return c.json(
      {
        error: "insufficient_credits: insufficient AI credits",
        code,
        provider_id: "gg",
      },
      402
    );
  }
  if (code === "provider_access_denied") {
    return c.json(
      {
        error: "provider_access_denied: provider access denied",
        code,
        provider_id: args.provider_id,
      },
      403
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
