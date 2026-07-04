// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — /auth/gg/* routes + the secrets-boundary split.
 *
 * Pins: set→status→clear roundtrip (status never echoes the token),
 * validation 400s (empty token, past expiry), and the DELIBERATE gate
 * split — the run-input accepts `grida` as a provider pick while
 * `/secrets/set` keeps REJECTING it (nobody may store a key under the
 * hosted provider's id).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerGridaAuthRoutes } from "./gg-auth";
import { registerSecretsRoutes } from "./secrets";
import { GridaGatewaySessionStore } from "../../providers/gg-session";
import type { SecretsStore } from "@grida/daemon/server";

let app: Hono;
let store: GridaGatewaySessionStore;

function post(path: string, body?: unknown): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
  );
}

beforeEach(() => {
  app = new Hono();
  store = new GridaGatewaySessionStore();
  registerGridaAuthRoutes(app, { store });
});

describe("/auth/gg/*", () => {
  it("set → status → clear roundtrip; status never echoes the token", async () => {
    const expires_at = Date.now() + 900_000;
    const set = await post("/auth/gg/set", {
      access_token: "jwt-abc",
      expires_at,
      organization: { id: 7, name: "acme" },
    });
    expect(set.status).toBe(200);

    const status = await post("/auth/gg/status");
    const body = (await status.json()) as Record<string, unknown>;
    expect(body).toEqual({
      active: true,
      expires_at,
      organization: { id: 7, name: "acme" },
    });
    expect(JSON.stringify(body)).not.toContain("jwt-abc");
    expect(store.getAccessToken()).toBe("jwt-abc");

    const clear = await post("/auth/gg/clear");
    expect(clear.status).toBe(200);
    expect(store.getAccessToken()).toBeNull();
    expect(
      ((await (await post("/auth/gg/status")).json()) as { active: boolean })
        .active
    ).toBe(false);
  });

  it("validation: empty token and past expiry are 400s", async () => {
    expect(
      (
        await post("/auth/gg/set", {
          access_token: "   ",
          expires_at: Date.now() + 1000,
        })
      ).status
    ).toBe(400);
    expect(
      (
        await post("/auth/gg/set", {
          access_token: "jwt",
          expires_at: Date.now() - 1000,
        })
      ).status
    ).toBe(400);
    expect(store.getAccessToken()).toBeNull();
  });

  it("malformed organization is dropped, not fatal", async () => {
    const res = await post("/auth/gg/set", {
      access_token: "jwt",
      expires_at: Date.now() + 900_000,
      organization: { id: "not-a-number" },
    });
    expect(res.status).toBe(200);
    expect(store.status().organization).toBeUndefined();
  });
});

describe("secrets boundary split (GRIDA-SEC-006)", () => {
  it("/secrets/set keeps rejecting the grida id", async () => {
    const secretsApp = new Hono();
    registerSecretsRoutes(secretsApp, {
      store: {
        has: async () => false,
        set: async () => {},
      } as unknown as SecretsStore,
    });
    const res = await secretsApp.request("/secrets/set", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider_id: "gg", key: "sneaky" }),
    });
    expect(res.status).toBe(400);
  });
});
