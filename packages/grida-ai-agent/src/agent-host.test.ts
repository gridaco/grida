/**
 * Contract pins — AgentHost lifecycle + the GRIDA-SEC-004 HTTP
 * perimeter (Basic Auth / Referer / Origin), exercised against a REAL
 * loopback socket through the production middleware stack
 * (cors → referer → auth, see `http/server.ts`).
 *
 * Maps to docs/wg/ai/grida/architecture.md §Test pins:
 *   - describe("AgentHost lifecycle")              — start / stop / idempotent
 *   - describe("HTTP wire — perimeter ...")        — the auth/referer/origin
 *     subset of the "HTTP wire" block. The run/stream/abort/409 its
 *     live in `http/routes/agent.test.ts` (against the bare Hono app,
 *     where pre-populating the stream registry is simpler).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentHost } from "./agent-host";
import { AgentTransport } from "./transport";
import type { AgentServerCapabilities } from "./protocol/handshake";
import type { StreamRegistry } from "./runtime/stream-registry";

const PASSWORD = "test-password-abc123";
const CAPS: AgentServerCapabilities = {
  files: true,
  recent: true,
  secrets: true,
  agent: true,
  workspaces: true,
  sessions: true,
  shell: false,
};
// A referer under the host-declared client path — clears the
// referer guard. The origin header alone is browser-CORS territory.
const VALID_REFERER = "https://client.example/client/doc";
const VALID_ORIGIN = "https://client.example";
const HTTP_ACCESS = {
  allowed_origins: [VALID_ORIGIN],
  allowed_referer_paths: ["/client"],
} as const;

type AgentHostInternals = {
  streams: StreamRegistry;
};

async function makeHost(
  capabilities: Partial<AgentServerCapabilities> = CAPS
): Promise<{ host: AgentHost; base_dir: string }> {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-host-"));
  const host = new AgentHost({
    password: PASSWORD,
    capabilities,
    user_data_path: baseDir,
    // Isolate the per-host scratch sweep onto a unique sibling so it never
    // touches the shared default (or a live dev daemon's scratch). Never
    // created here — these tests run no agent turns.
    scratch_base: `${baseDir}-scratch`,
    http_access: HTTP_ACCESS,
    port: 0,
  });
  return { host, base_dir: baseDir };
}

describe("AgentHost lifecycle", () => {
  let host: AgentHost;
  let baseDir: string;

  beforeEach(async () => {
    ({ host, base_dir: baseDir } = await makeHost());
  });
  afterEach(async () => {
    await host.stop();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("start() binds HTTP and returns when ready", async () => {
    await host.start();
    expect(host.port).toBeGreaterThan(0);

    // A fully-authorized request reaches the handshake handler — proof
    // the socket is bound AND the middleware stack is wired.
    const res = await fetch(`http://127.0.0.1:${host.port}/handshake`, {
      method: "POST",
      headers: {
        authorization: AgentTransport.buildBasicAuthHeader(PASSWORD),
        referer: VALID_REFERER,
        origin: VALID_ORIGIN,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { protocol: number };
    expect(body.protocol).toBe(1);
  });

  it("stop() drains in-flight runs then closes SQLite", async () => {
    await host.start();

    // Reserve a registry entry directly — stands in for an in-flight
    // /agent/run whose upstream model call is mid-stream.
    const internals = host as unknown as AgentHostInternals;
    const entry = internals.streams.create("ses_inflight");
    const signal = entry.model_abort.signal;
    expect(signal.aborted).toBe(false);

    await host.stop();

    // Drained: the upstream signal was aborted and the entry removed.
    expect(signal.aborted).toBe(true);
    expect(internals.streams.get("ses_inflight")).toBeUndefined();

    await expect(
      fetch(`http://127.0.0.1:${host.port}/handshake`, {
        method: "POST",
        headers: {
          authorization: AgentTransport.buildBasicAuthHeader(PASSWORD),
          referer: VALID_REFERER,
          origin: VALID_ORIGIN,
        },
      })
    ).rejects.toThrow("fetch failed");
  });

  it("stop() is idempotent", async () => {
    await host.start();
    await host.stop();
    await expect(host.stop()).resolves.toBeUndefined();
  });
});

describe("HTTP wire — perimeter (auth/referer/origin)", () => {
  // GRIDA-SEC-004 layer 2 — the agent server HTTP perimeter, through a real
  // socket. A reviewer should be able to break any single check and
  // see exactly one of these go red.
  let host: AgentHost;
  let baseDir: string;
  let base: string;

  beforeEach(async () => {
    ({ host, base_dir: baseDir } = await makeHost());
    await host.start();
    base = `http://127.0.0.1:${host.port}`;
  });
  afterEach(async () => {
    await host.stop();
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
        authorization: AgentTransport.buildBasicAuthHeader(PASSWORD),
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
        authorization: AgentTransport.buildBasicAuthHeader(PASSWORD),
        referer: VALID_REFERER,
        origin: "https://evil.example.com",
      },
    });
    expect(badOrigin.headers.get("access-control-allow-origin")).toBeNull();

    const goodOrigin = await fetch(`${base}/handshake`, {
      method: "POST",
      headers: {
        authorization: AgentTransport.buildBasicAuthHeader(PASSWORD),
        referer: VALID_REFERER,
        origin: VALID_ORIGIN,
      },
    });
    expect(goodOrigin.headers.get("access-control-allow-origin")).toBe(
      VALID_ORIGIN
    );
  });

  it("GET /events is auth-guarded, and the auth_token query carriage does NOT extend to it", async () => {
    // The lifecycle event stream (RFC `events.md`) reveals session ids and
    // activity timing — perimeter rules apply unchanged. And the SSE
    // `auth_token` query exception stays exactly the two routes SECURITY.md
    // names (`/agent/stream/:id`, `/sessions/:id/status`): every /events
    // consumer attaches via fetch with headers, so the carriage is not
    // widened (GRIDA-SEC-004, fail closed).
    const bare = await fetch(`${base}/events`, {
      headers: { referer: VALID_REFERER, origin: VALID_ORIGIN },
    });
    expect(bare.status).toBe(401);

    const queryToken = await fetch(
      `${base}/events?auth_token=${AgentTransport.buildAuthToken(PASSWORD)}`,
      { headers: { referer: VALID_REFERER, origin: VALID_ORIGIN } }
    );
    expect(queryToken.status).toBe(401);

    // Header-authed attach succeeds and is an SSE stream.
    const controller = new AbortController();
    const authed = await fetch(`${base}/events`, {
      headers: {
        authorization: AgentTransport.buildBasicAuthHeader(PASSWORD),
        referer: VALID_REFERER,
        origin: VALID_ORIGIN,
        accept: "text/event-stream",
      },
      signal: controller.signal,
    });
    expect(authed.status).toBe(200);
    expect(authed.headers.get("content-type")).toContain("text/event-stream");
    controller.abort();
    await authed.body?.cancel().catch(() => undefined);
  });
});
