// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — composed-daemon pins for the hosted "included" AI
 * surface. Caught live: `createAgentDaemon` forwards tenant options
 * EXPLICITLY, so forgetting `gg_base_url` ships the whole
 * provider silently dormant — the with-URL daemon here pins the
 * forwarding, the without-URL daemon pins dormancy (no routes, no
 * capability).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAgentDaemon, type DaemonServer } from "./server";
import { AgentTransport } from "./transport";

const PASSWORD = "test-password-abc123";
const VALID_REFERER = "https://client.example/client/doc";
const VALID_ORIGIN = "https://client.example";

const authed = (): Record<string, string> => ({
  authorization: AgentTransport.buildBasicAuthHeader(PASSWORD),
  referer: VALID_REFERER,
  origin: VALID_ORIGIN,
  "content-type": "application/json",
});

function makeDaemon(baseDir: string, gridaBaseUrl?: string): DaemonServer {
  return createAgentDaemon({
    password: PASSWORD,
    user_data_path: baseDir,
    scratch_base: `${baseDir}-scratch`,
    http_access: {
      allowed_origins: [VALID_ORIGIN],
      allowed_referer_paths: ["/client"],
    },
    port: 0,
    gg_base_url: gridaBaseUrl,
  });
}

describe("composed daemon WITH gg_base_url", () => {
  let daemon: DaemonServer;
  let base: string;

  beforeAll(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gg-on-"));
    daemon = makeDaemon(dir, "https://grida.test");
    await daemon.start();
    base = `http://127.0.0.1:${daemon.port}`;
  });
  afterAll(async () => {
    await daemon.stop();
  });

  it("handshake reports gg: true (the forwarding pin)", async () => {
    const res = await fetch(`${base}/handshake`, {
      method: "POST",
      headers: authed(),
    });
    const body = (await res.json()) as {
      capabilities: Record<string, boolean>;
    };
    expect(body.capabilities.gg).toBe(true);
  });

  it("serves /auth/gg/* behind the perimeter", async () => {
    // Unauthenticated → rejected by the perimeter.
    const unauthed = await fetch(`${base}/auth/gg/status`, {
      method: "POST",
    });
    expect(unauthed.status).toBeGreaterThanOrEqual(400);

    const set = await fetch(`${base}/auth/gg/set`, {
      method: "POST",
      headers: authed(),
      body: JSON.stringify({
        access_token: "tok",
        expires_at: Date.now() + 900_000,
      }),
    });
    expect(set.status).toBe(200);
    const status = await fetch(`${base}/auth/gg/status`, {
      method: "POST",
      headers: authed(),
      body: "{}",
    });
    expect(((await status.json()) as { active: boolean }).active).toBe(true);
  });
});

describe("composed daemon WITHOUT gg_base_url (dormant)", () => {
  let daemon: DaemonServer;
  let base: string;

  beforeAll(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gg-off-"));
    daemon = makeDaemon(dir);
    await daemon.start();
    base = `http://127.0.0.1:${daemon.port}`;
  });
  afterAll(async () => {
    await daemon.stop();
  });

  it("handshake reports gg: false and the routes are absent", async () => {
    const res = await fetch(`${base}/handshake`, {
      method: "POST",
      headers: authed(),
    });
    const body = (await res.json()) as {
      capabilities: Record<string, boolean>;
    };
    expect(body.capabilities.gg).toBe(false);
    const status = await fetch(`${base}/auth/gg/status`, {
      method: "POST",
      headers: authed(),
      body: "{}",
    });
    expect(status.status).toBe(404);
  });
});
