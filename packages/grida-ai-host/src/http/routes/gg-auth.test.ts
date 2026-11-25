// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — /auth/gg/* routes + the secrets-boundary split.
 *
 * Pins: set→status→clear roundtrip (status never echoes the token),
 * validation 400s (empty token, past expiry), and the DELIBERATE gate
 * split — scoped grants stay in memory and standalone keys use the shared
 * provider slot on platforms that support it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerGridaAuthRoutes } from "./gg-auth";
import { registerSecretsRoutes } from "./secrets";
import { isKnownProviderId } from "../../providers/endpoints";
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
  const key = "sk-gg-v1-synthetic";
  let keys: Map<string, string>;

  beforeEach(() => {
    keys = new Map();
    registerSecretsRoutes(app, {
      store: {
        has: async (id: string) => keys.has(id),
        set: async (id: string, value: string) => void keys.set(id, value),
        delete: async (id: string) => void keys.delete(id),
      } as unknown as SecretsStore,
    });
  });

  it("rejects scoped grants in the standalone slot and standalone keys in scoped custody", async () => {
    const write = await post("/secrets/set", {
      provider_id: "gg",
      key: "synthetic.scoped.grant",
    });
    expect(write.status).toBe(400);
    expect(keys.size).toBe(0);

    const grant = await post("/auth/gg/set", {
      access_token: ` ${key} `,
      expires_at: Date.now() + 1000,
    });
    expect(grant.status).toBe(400);
    expect(store.getAccessToken()).toBeNull();
  });

  it.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
    "uses the shared standalone slot without registering a generic provider or returning the key",
    async () => {
      const selection = { provider_id: "gg" };
      expect(await isKnownProviderId(selection.provider_id)).toBe(false);
      const write = await post("/secrets/set", {
        ...selection,
        key: ` ${key} `,
      });
      expect(write.status).toBe(200);
      expect(await write.json()).toEqual({ ok: true });
      expect(keys.get("gg")).toBe(key);
      for (const invalid of [
        "sk-gg-v1-",
        "sk-gg-v1-bad key",
        "　".repeat(1366) + key,
      ]) {
        expect(
          (await post("/secrets/set", { ...selection, key: invalid })).status
        ).toBe(400);
        expect(keys.get("gg")).toBe(key);
      }
      expect(await (await post("/secrets/has", selection)).json()).toEqual({
        has: true,
      });
      expect((await post("/secrets/get", selection)).status).toBe(404);
      expect(await (await post("/secrets/delete", selection)).json()).toEqual({
        ok: true,
      });
      expect(await (await post("/secrets/has", selection)).json()).toEqual({
        has: false,
      });
      expect(store.getAccessToken()).toBeNull();
    }
  );

  it.skipIf(process.platform === "darwin" || process.platform === "linux")(
    "keeps the standalone slot unavailable without shared provider custody",
    async () => {
      expect(
        (await post("/secrets/set", { provider_id: "gg", key })).status
      ).toBe(400);
      expect(keys.size).toBe(0);
    }
  );
});
