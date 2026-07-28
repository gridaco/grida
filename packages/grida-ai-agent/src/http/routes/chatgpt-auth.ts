/**
 * GRIDA-SEC-004 / GRIDA-SEC-008 — native ChatGPT subscription OAuth routes.
 *
 * These routes are mounted behind the daemon's CORS → Referer → Basic Auth
 * perimeter. They are intentionally absent from AgentTransport: a trusted
 * native host drives the system-browser/loopback ceremony with low-level
 * authenticated requests, while the renderer receives only the secret-free
 * status DTO through a host-defined capability.
 */

import type { Hono } from "hono";
import { body, v } from "@grida/daemon/server";
import {
  ChatGptCredentialError,
  type ChatGptCredentialManager,
} from "../../providers/chatgpt-credentials";
import { ProviderReady } from "./provider-ready";

export const CHATGPT_AUTH_ROUTE_PATHS = Object.freeze({
  start: "/auth/chatgpt/start",
  complete: "/auth/chatgpt/complete",
  cancel: "/auth/chatgpt/cancel",
  status: "/auth/chatgpt/status",
  sign_out: "/auth/chatgpt/sign-out",
} as const);

export type ChatGptAuthRoutesDeps = {
  credentials: ChatGptCredentialManager;
  on_provider_ready?: ProviderReady.Hook;
};

export function registerChatGptAuthRoutes(
  app: Hono,
  deps: ChatGptAuthRoutesDeps
): void {
  app.post(CHATGPT_AUTH_ROUTE_PATHS.start, async (c) => {
    const r = await body(c, { redirect_uri: v.string });
    if (!r.ok) return r.res;
    try {
      return c.json(await deps.credentials.start(r.data.redirect_uri));
    } catch (error) {
      return credentialErrorResponse(error, 400);
    }
  });

  app.post(CHATGPT_AUTH_ROUTE_PATHS.complete, async (c) => {
    const r = await body(c, {
      attempt_id: v.string,
      code: v.string,
      state: v.string,
    });
    if (!r.ok) return r.res;
    if (
      r.data.attempt_id.length === 0 ||
      r.data.code.length === 0 ||
      r.data.state.length === 0
    ) {
      return c.json(
        {
          error: "chatgpt_oauth_attempt_invalid",
          code: "chatgpt_oauth_attempt_invalid",
        },
        400
      );
    }
    try {
      const status = await deps.credentials.complete(r.data);
      if (status.ready) {
        ProviderReady.notify(deps.on_provider_ready);
      }
      return c.json(status);
    } catch (error) {
      return credentialErrorResponse(error, 502);
    }
  });

  app.post(CHATGPT_AUTH_ROUTE_PATHS.cancel, async (c) => {
    const r = await body(c, { attempt_id: v.string });
    if (!r.ok) return r.res;
    return c.json({
      ok: true,
      cancelled: await deps.credentials.cancel(r.data.attempt_id),
    });
  });

  app.post(CHATGPT_AUTH_ROUTE_PATHS.status, async (c) => {
    return c.json(await deps.credentials.status());
  });

  app.post(CHATGPT_AUTH_ROUTE_PATHS.sign_out, async (c) => {
    await deps.credentials.signOut();
    return c.json({ ok: true });
  });
}

function credentialErrorResponse(
  error: unknown,
  fallbackStatus: 400 | 502
): Response {
  if (!(error instanceof ChatGptCredentialError)) throw error;
  const status =
    error.code === "chatgpt_oauth_attempt_invalid"
      ? fallbackStatus === 400
        ? 400
        : 409
      : error.code === "chatgpt_oauth_exchange_failed" ||
          error.code === "chatgpt_token_refresh_failed"
        ? 502
        : fallbackStatus;
  return Response.json({ error: error.message, code: error.code }, { status });
}
