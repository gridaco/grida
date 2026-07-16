/**
 * Contract pins for the composed agent-daemon (#927): `createAgentDaemon`
 * = `@grida/daemon`'s server frame + this package's agent tenant. Wire
 * behavior must be identical to the pre-split `AgentHost` — same routes,
 * same handshake shape, same GRIDA-SEC-004 query-token carriage.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createAgentDaemon,
  agentTenantOptionsFromDaemon,
  AGENT_DAEMON_DEFAULT_CAPABILITIES,
  type DaemonServer,
} from "./server";
import { AgentTransport } from "./transport";
import { AGENT_SESSION_AGENT } from "./protocol/run";

describe("agentTenantOptionsFromDaemon — no host field is silently dropped", () => {
  // Every host-supplied tenant field must ride from the composed daemon into
  // the tenant. `skills_root` shipped disabled precisely because it was omitted
  // here → the agent discovered ZERO built-in skills on the desktop.
  it("forwards skills_root, gg_base_url, scratch_base, provider_http, and the capability flags", () => {
    const provider_http = {
      request: globalThis.fetch,
      download: globalThis.fetch,
    };
    const out = agentTenantOptionsFromDaemon(
      {
        password: "p",
        user_data_path: "/tmp/ud",
        http_access: { allowed_origins: [], allowed_referer_paths: [] },
        skills_root: "/repo/skills",
        gg_base_url: "https://grida.co",
        scratch_base: "/tmp/scratch",
        image_model_id: "img/model",
        sandbox_enforced: true,
        external_agent_execution: "disabled",
        allow_unsandboxed_shell: false,
        interactive: true,
        library: true,
        provider_http,
      },
      AGENT_DAEMON_DEFAULT_CAPABILITIES
    );
    expect(out.skills_root).toBe("/repo/skills");
    expect(out.gg_base_url).toBe("https://grida.co");
    expect(out.scratch_base).toBe("/tmp/scratch");
    expect(out.image_model_id).toBe("img/model");
    expect(out.sandbox_enforced).toBe(true);
    expect(out.external_agent_execution).toBe("disabled");
    expect(out.interactive).toBe(true);
    expect(out.library).toBe(true);
    expect(out.provider_http).toBe(provider_http);
  });
});

const PASSWORD = "test-password-abc123";
const VALID_REFERER = "https://client.example/client/doc";
const VALID_ORIGIN = "https://client.example";

let daemon: DaemonServer;
let baseDir: string;
let base: string;

const authed = (
  extra: Record<string, string> = {}
): Record<string, string> => ({
  authorization: AgentTransport.buildBasicAuthHeader(PASSWORD),
  referer: VALID_REFERER,
  origin: VALID_ORIGIN,
  ...extra,
});

beforeAll(async () => {
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-daemon-"));
  daemon = createAgentDaemon({
    password: PASSWORD,
    user_data_path: baseDir,
    scratch_base: `${baseDir}-scratch`,
    http_access: {
      allowed_origins: [VALID_ORIGIN],
      allowed_referer_paths: ["/client"],
    },
    port: 0,
  });
  await daemon.start();
  base = `http://127.0.0.1:${daemon.port}`;
});

afterAll(async () => {
  await daemon.stop();
  await fs.rm(baseDir, { recursive: true, force: true });
  await fs.rm(`${baseDir}-scratch`, { recursive: true, force: true });
});

describe("composed agent-daemon (wire parity with the pre-split host)", () => {
  it("handshake reports the full capability set, protocol 1", async () => {
    const res = await fetch(`${base}/handshake`, {
      method: "POST",
      headers: authed(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      protocol: number;
      supports: string[];
      capabilities: Record<string, boolean>;
    };
    expect(body.protocol).toBe(1);
    for (const cap of [
      "files",
      "recent",
      "workspaces",
      "secrets",
      "agent",
      "sessions",
      "providers",
      "images",
      "video",
    ]) {
      expect(body.capabilities[cap]).toBe(true);
    }
    expect(body.capabilities.shell).toBe(false);
    expect(body.supports).toContain("agent@1");
    expect(body.supports).toContain("files@1");
  });

  it("serves daemon routes and tenant routes behind ONE perimeter", async () => {
    const workspaces = await fetch(`${base}/workspaces/list`, {
      method: "POST",
      headers: authed(),
    });
    expect(workspaces.status).toBe(200);
    const sessions = await fetch(`${base}/sessions`, {
      method: "GET",
      headers: authed(),
    });
    expect(sessions.status).toBe(200);
  });

  it("GET /events is auth-guarded, and the auth_token query carriage does NOT extend to it", async () => {
    // The lifecycle event stream (RFC `events.md`) reveals session ids and
    // activity timing — perimeter rules apply unchanged. And the SSE
    // `auth_token` query exception stays exactly the two routes SECURITY.md
    // names (`/agent/stream/:id`, `/sessions/:id/status`), declared by the
    // agent tenant via `sse_query_token_paths`: every /events consumer
    // attaches via fetch with headers, so the carriage is not widened
    // (GRIDA-SEC-004, fail closed).
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
    const ok = await fetch(`${base}/events`, {
      headers: authed({ accept: "text/event-stream" }),
      signal: controller.signal,
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/event-stream");
    controller.abort();
    await ok.body?.cancel().catch(() => undefined);
  });

  it("the auth_token query DOES clear the tenant-declared session-status SSE route", async () => {
    const created = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: authed({ "content-type": "application/json" }),
      body: JSON.stringify({ agent: AGENT_SESSION_AGENT }),
    });
    expect(created.status).toBe(200);
    const row = (await created.json()) as { id: string };

    const token = encodeURIComponent(AgentTransport.buildAuthToken(PASSWORD));
    const controller = new AbortController();
    const res = await fetch(
      `${base}/sessions/${row.id}/status?auth_token=${token}`,
      {
        headers: {
          referer: VALID_REFERER,
          origin: VALID_ORIGIN,
          accept: "text/event-stream",
        },
        signal: controller.signal,
      }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    controller.abort();
    await res.body?.cancel().catch(() => undefined);
  });
});
