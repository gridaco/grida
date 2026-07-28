// GRIDA-SEC-008 — authenticated route shapes never expose credential material.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStore } from "@grida/daemon/server";
import { ChatGptCredentialManager } from "../../providers/chatgpt-credentials";
import { ProviderHttp } from "../../providers/http";
import {
  CHATGPT_AUTH_ROUTE_PATHS,
  registerChatGptAuthRoutes,
} from "./chatgpt-auth";

const REDIRECT_URI = "http://localhost:1455/auth/callback";

let baseDir: string;
let app: Hono;
let request: ReturnType<typeof vi.fn<typeof fetch>>;
let onProviderReady: ReturnType<typeof vi.fn<() => void>>;

beforeEach(async () => {
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-chatgpt-routes-"));
  request = vi.fn<typeof fetch>(async () =>
    Response.json({
      access_token: "access-secret",
      refresh_token: "refresh-secret",
      expires_in: 3600,
      account_id: "account-123",
    })
  );
  const providerHttp = new ProviderHttp({ request, download: request });
  const credentials = new ChatGptCredentialManager(
    new AuthStore(baseDir),
    providerHttp,
    {
      authorize_url: "https://auth.example.test/oauth/authorize",
      token_url: "https://auth.example.test/oauth/token",
      client_id: "grida-test-client",
      redirect_uris: [REDIRECT_URI],
      scopes: ["openid", "offline_access"],
    }
  );
  app = new Hono();
  onProviderReady = vi.fn<() => void>();
  registerChatGptAuthRoutes(app, {
    credentials,
    on_provider_ready: onProviderReady,
  });
});

afterEach(async () => {
  await fs.rm(baseDir, { recursive: true, force: true });
});

describe("/auth/chatgpt/*", () => {
  it("exposes the native-host start/complete/status/sign-out ceremony", async () => {
    const startResponse = await post(CHATGPT_AUTH_ROUTE_PATHS.start, {
      redirect_uri: REDIRECT_URI,
    });
    expect(startResponse.status).toBe(200);
    const start = (await startResponse.json()) as {
      attempt_id: string;
      state: string;
      authorization_url: string;
    };
    expect(Object.keys(start).sort()).toEqual([
      "attempt_id",
      "authorization_url",
      "state",
    ]);

    const complete = await post(CHATGPT_AUTH_ROUTE_PATHS.complete, {
      attempt_id: start.attempt_id,
      code: "authorization-code-secret",
      state: start.state,
    });
    expect(complete.status).toBe(200);
    const statusText = await complete.text();
    expect(JSON.parse(statusText)).toMatchObject({
      configured: true,
      signed_in: true,
      ready: true,
      signing_in: false,
      account: { id: "account-123" },
    });
    expect(statusText).not.toMatch(
      /access-secret|refresh-secret|authorization-code-secret/
    );
    expect(onProviderReady).toHaveBeenCalledOnce();

    const status = await post(CHATGPT_AUTH_ROUTE_PATHS.status);
    expect(await status.json()).toMatchObject({
      signed_in: true,
      ready: true,
    });

    expect((await post(CHATGPT_AUTH_ROUTE_PATHS.sign_out)).status).toBe(200);
    expect(await (await post(CHATGPT_AUTH_ROUTE_PATHS.status)).json()).toEqual({
      configured: true,
      signed_in: false,
      ready: false,
      signing_in: false,
    });
  });

  it("cancels by attempt id and returns a body-free mismatch error", async () => {
    const start = (await (
      await post(CHATGPT_AUTH_ROUTE_PATHS.start, {
        redirect_uri: REDIRECT_URI,
      })
    ).json()) as { attempt_id: string; state: string };
    expect(
      await (
        await post(CHATGPT_AUTH_ROUTE_PATHS.cancel, {
          attempt_id: start.attempt_id,
        })
      ).json()
    ).toEqual({ ok: true, cancelled: true });

    const complete = await post(CHATGPT_AUTH_ROUTE_PATHS.complete, {
      attempt_id: start.attempt_id,
      code: "code-secret",
      state: start.state,
    });
    expect(complete.status).toBe(409);
    const text = await complete.text();
    expect(text).toContain("chatgpt_oauth_attempt_invalid");
    expect(text).not.toContain("code-secret");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects an unapproved callback without creating an attempt", async () => {
    const response = await post(CHATGPT_AUTH_ROUTE_PATHS.start, {
      redirect_uri: "http://localhost:9999/auth/callback",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "chatgpt_oauth_attempt_invalid",
    });
  });
});

function post(pathname: string, value: unknown = {}): Promise<Response> {
  return Promise.resolve(
    app.request(pathname, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    })
  );
}
