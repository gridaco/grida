/**
 * Contract pins — DaemonServer lifecycle + the GRIDA-SEC-004 HTTP
 * perimeter (Basic Auth / Referer / Origin), exercised against a REAL
 * loopback socket through the production middleware stack
 * (cors → referer → auth, see `http/server.ts`).
 *
 * Maps to docs/wg/ai/grida/architecture.md §Test pins:
 *   - describe("DaemonServer lifecycle")            — start / stop / idempotent
 *     + the tenant drain-before-cleanup ordering of the seam.
 *   - describe("HTTP wire — perimeter ...")         — the auth/referer/origin
 *     subset of the "HTTP wire" block. Tenant-route pins (run/stream/
 *     events/sessions) live in `@grida/agent`'s tests.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DaemonServer } from "./daemon-server";
import { DaemonTransport } from "./transport";
import type { DaemonTenant } from "./http/server";
import type { DaemonCapabilities } from "./protocol/handshake";

const PASSWORD = "test-password-abc123";
// A referer under the host-declared client path — clears the
// referer guard. The origin header alone is browser-CORS territory.
const VALID_REFERER = "https://client.example/client/doc";
const VALID_ORIGIN = "https://client.example";
const HTTP_ACCESS = {
  allowed_origins: [VALID_ORIGIN],
  allowed_referer_paths: ["/client"],
} as const;

async function makeDaemon(
  opts: {
    capabilities?: Partial<DaemonCapabilities>;
    tenants?: readonly DaemonTenant[];
  } = {}
): Promise<{ daemon: DaemonServer; base_dir: string }> {
  const baseDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-daemon-test-")
  );
  const daemon = new DaemonServer({
    password: PASSWORD,
    capabilities: opts.capabilities,
    tenants: opts.tenants,
    user_data_path: baseDir,
    http_access: HTTP_ACCESS,
    port: 0,
  });
  return { daemon, base_dir: baseDir };
}

function authedHeaders(): Record<string, string> {
  return {
    authorization: DaemonTransport.buildBasicAuthHeader(PASSWORD),
    referer: VALID_REFERER,
    origin: VALID_ORIGIN,
  };
}

describe("DaemonServer lifecycle", () => {
  let daemon: DaemonServer;
  let baseDir: string;

  beforeEach(async () => {
    ({ daemon, base_dir: baseDir } = await makeDaemon());
  });
  afterEach(async () => {
    await daemon.stop();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("start() binds HTTP and returns when ready", async () => {
    await daemon.start();
    expect(daemon.port).toBeGreaterThan(0);

    // A fully-authorized request reaches the handshake handler — proof
    // the socket is bound AND the middleware stack is wired.
    const res = await fetch(`http://127.0.0.1:${daemon.port}/handshake`, {
      method: "POST",
      headers: authedHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { protocol: number };
    expect(body.protocol).toBe(1);
  });

  it("stop() is idempotent", async () => {
    await daemon.start();
    await daemon.stop();
    await expect(daemon.stop()).resolves.toBeUndefined();
  });
});

describe("DaemonServer tenant seam", () => {
  it("stop() drains tenant work BEFORE tenant cleanup, then refuses connections", async () => {
    // Stands in for the agent tenant: `drain` aborts in-flight upstream
    // model calls; `cleanup` closes SQLite. The seam contract is the
    // ordering — a recorder reacting to the abort must still find its
    // store open (see DaemonServer.stop()).
    const order: string[] = [];
    const tenant: DaemonTenant = {
      register: (app) => {
        app.post("/tenant/ping", (c) => c.json({ ok: true }));
        return {
          capabilities: { sessions: true },
          drain: () => order.push("drain"),
          cleanup: () => order.push("cleanup"),
        };
      },
    };
    const { daemon, base_dir } = await makeDaemon({ tenants: [tenant] });
    try {
      await daemon.start();
      const base = `http://127.0.0.1:${daemon.port}`;

      // The tenant route is mounted behind the same perimeter. Valid
      // referer/origin so the request clears the referer guard and the
      // missing credential isolates the auth 401 (not a referer 403).
      const unauthed = await fetch(`${base}/tenant/ping`, {
        method: "POST",
        headers: { referer: VALID_REFERER, origin: VALID_ORIGIN },
      });
      expect(unauthed.status).toBe(401);
      const authed = await fetch(`${base}/tenant/ping`, {
        method: "POST",
        headers: authedHeaders(),
      });
      expect(authed.status).toBe(200);

      // The tenant's capability flags merge into the handshake response.
      const handshake = await fetch(`${base}/handshake`, {
        method: "POST",
        headers: authedHeaders(),
      });
      const body = (await handshake.json()) as {
        capabilities: DaemonCapabilities;
        supports: string[];
      };
      expect(body.capabilities.sessions).toBe(true);
      expect(body.capabilities.agent).toBe(false);
      expect(body.supports).toContain("sessions@1");

      const port = daemon.port;
      await daemon.stop();
      expect(order).toEqual(["drain", "cleanup"]);
      await expect(
        fetch(`http://127.0.0.1:${port}/handshake`, {
          method: "POST",
          headers: authedHeaders(),
        })
      ).rejects.toThrow("fetch failed");
    } finally {
      await daemon.stop();
      await fs.rm(base_dir, { recursive: true, force: true });
    }
  });

  it("a bare daemon (no tenants) serves only its own capabilities", async () => {
    const { daemon, base_dir } = await makeDaemon();
    try {
      await daemon.start();
      const base = `http://127.0.0.1:${daemon.port}`;
      const res = await fetch(`${base}/handshake`, {
        method: "POST",
        headers: authedHeaders(),
      });
      const body = (await res.json()) as {
        capabilities: DaemonCapabilities;
        supports: string[];
      };
      expect(body.capabilities.files).toBe(true);
      expect(body.capabilities.recent).toBe(true);
      expect(body.capabilities.workspaces).toBe(true);
      expect(body.capabilities.agent).toBe(false);
      expect(body.capabilities.sessions).toBe(false);
      expect(body.capabilities.secrets).toBe(false);
      expect(body.supports).toContain("files@1");
      expect(body.supports).not.toContain("agent@1");

      // Daemon-owned route groups answer; tenant groups are absent (404,
      // not 401 — the perimeter clears first, then no route matches).
      const workspaces = await fetch(`${base}/workspaces/list`, {
        method: "POST",
        headers: authedHeaders(),
      });
      expect(workspaces.status).toBe(200);
      const agentRun = await fetch(`${base}/agent/run`, {
        method: "POST",
        headers: authedHeaders(),
      });
      expect(agentRun.status).toBe(404);
    } finally {
      await daemon.stop();
      await fs.rm(base_dir, { recursive: true, force: true });
    }
  });
});

describe("HTTP wire — perimeter (auth/referer/origin)", () => {
  // GRIDA-SEC-004 layer 2 — the daemon HTTP perimeter, through a real
  // socket. A reviewer should be able to break any single check and
  // see exactly one of these go red.
  let daemon: DaemonServer;
  let baseDir: string;
  let base: string;

  beforeEach(async () => {
    ({ daemon, base_dir: baseDir } = await makeDaemon());
    await daemon.start();
    base = `http://127.0.0.1:${daemon.port}`;
  });
  afterEach(async () => {
    await daemon.stop();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("rejects requests without Basic Auth", async () => {
    // Valid referer so the request clears the referer guard and reaches
    // the auth guard — isolating the 401 from a 403.
    const res = await fetch(`${base}/handshake`, {
      method: "POST",
      headers: { referer: VALID_REFERER, origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("rejects requests with wrong Referer / Origin", async () => {
    // Wrong Referer path on an allowed origin → 403,
    // even with valid auth: the referer guard runs before auth.
    const wrongReferer = await fetch(`${base}/handshake`, {
      method: "POST",
      headers: {
        authorization: DaemonTransport.buildBasicAuthHeader(PASSWORD),
        referer: "https://client.example/blog/post",
        origin: VALID_ORIGIN,
      },
    });
    expect(wrongReferer.status).toBe(403);

    // Disallowed Origin: the server-side guards still pass, but CORS
    // withholds Access-Control-Allow-Origin so a browser blocks the
    // response. Pin the ACAO presence/absence — that IS the origin
    // boundary at the wire.
    const badOrigin = await fetch(`${base}/handshake`, {
      method: "POST",
      headers: {
        authorization: DaemonTransport.buildBasicAuthHeader(PASSWORD),
        referer: VALID_REFERER,
        origin: "https://evil.example.com",
      },
    });
    expect(badOrigin.headers.get("access-control-allow-origin")).toBeNull();

    const goodOrigin = await fetch(`${base}/handshake`, {
      method: "POST",
      headers: {
        authorization: DaemonTransport.buildBasicAuthHeader(PASSWORD),
        referer: VALID_REFERER,
        origin: VALID_ORIGIN,
      },
    });
    expect(goodOrigin.headers.get("access-control-allow-origin")).toBe(
      VALID_ORIGIN
    );
  });
});
