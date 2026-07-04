// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * OpenAI-wire error envelope for the hosted `/api/v1/ai/*` chat/models
 * routes: `{ error: { message, type, code } }`.
 *
 * Mapping discipline mirrors `editor/lib/ai/error.ts`: the billing
 * "blocked" message is the only failure a client sees verbatim (it is
 * curated for end users); everything unexpected collapses to a
 * sanitized `internal` with the raw error logged server-side only.
 */
import "server-only";

import { z } from "zod";
import { GgTokenError } from "@/lib/auth/gg-token";
import { WireDecodeError } from "./codec";

const NO_STORE = { "cache-control": "no-store" } as const;

export type OpenAIErrorCode =
  | "token_expired"
  | "invalid_token"
  | "not_configured"
  | "insufficient_credits"
  | "model_not_found"
  | "invalid_request_error"
  | "rate_limit_exceeded"
  | "internal";

export function openaiError(
  status: number,
  body: { code: OpenAIErrorCode; type: string; message: string },
  headers?: Record<string, string>
): Response {
  return Response.json(
    { error: body },
    { status, headers: { ...NO_STORE, ...headers } }
  );
}

export function modelNotFound(modelId: string): Response {
  return openaiError(404, {
    code: "model_not_found",
    type: "invalid_request_error",
    message: `The model \`${modelId}\` does not exist or is not available.`,
  });
}

export function invalidRequest(message: string): Response {
  return openaiError(400, {
    code: "invalid_request_error",
    type: "invalid_request_error",
    message,
  });
}

/**
 * Read + validate a JSON request body against a zod schema — the single
 * body-parse path shared by the POST gateway routes. On failure returns a
 * ready `invalidRequest` Response (non-JSON body, or the first schema issue
 * formatted `path: message`); on success returns the parsed data.
 */
export async function parseJsonRequest<S extends z.ZodType>(
  request: Request,
  schema: S
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: Response }> {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return { ok: false, res: invalidRequest("request body must be JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      res: invalidRequest(
        issue
          ? `${issue.path.join(".") || "body"}: ${issue.message}`
          : "invalid request"
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

export function rateLimited(retryAfterSeconds?: number): Response {
  return openaiError(
    429,
    {
      code: "rate_limit_exceeded",
      type: "rate_limit_error",
      message: "Rate limit exceeded. Please retry later.",
    },
    retryAfterSeconds !== undefined
      ? { "retry-after": String(Math.max(1, Math.ceil(retryAfterSeconds))) }
      : undefined
  );
}

/**
 * Terminal catch for the hosted chat/models routes. Never leaks
 * Metronome/Postgres/provider internals.
 */
export function fromUnknownError(err: unknown, scope: string): Response {
  if (err instanceof GgTokenError) {
    switch (err.code) {
      case "token_expired":
        return openaiError(401, {
          code: "token_expired",
          type: "authentication_error",
          message: "The access token has expired. Mint a new one.",
        });
      case "invalid_token":
        return openaiError(401, {
          code: "invalid_token",
          type: "authentication_error",
          message: "Invalid access token.",
        });
      case "not_configured":
        return openaiError(503, {
          code: "not_configured",
          type: "server_error",
          message: "Hosted AI is not configured on this deployment.",
        });
      default: {
        // Compile-time guard: a new GgTokenError code must be handled here
        // rather than silently collapsing to the generic 500 below.
        const _exhaustive: never = err.code;
        return _exhaustive;
      }
    }
  }
  if (err instanceof WireDecodeError) {
    return invalidRequest(err.message);
  }
  // Seam request-shape failures (`InvalidAiRequestError` — duck-typed):
  // the message describes the request, never internals.
  if (
    err instanceof Error &&
    (err as { code?: unknown }).code === "invalid_request"
  ) {
    return invalidRequest(err.message);
  }
  // Billing gate — `BillingMetronomeError` code "blocked" (duck-typed to
  // keep this module's import surface minimal). The message is curated
  // for end-user display; pass it through.
  if (err instanceof Error && (err as { code?: unknown }).code === "blocked") {
    return openaiError(402, {
      code: "insufficient_credits",
      type: "insufficient_quota",
      message: err.message,
    });
  }
  console.error(`[${scope}]`, err);
  return openaiError(500, {
    code: "internal",
    type: "server_error",
    message: "Something went wrong. Please try again.",
  });
}
