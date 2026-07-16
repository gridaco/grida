/**
 * LIVE end-to-end — the agent-provider class (issue #813) through the REAL
 * run path. A host with NO BYOK key and NO endpoint configured picks the
 * synthetic `claude-acp` model and runs one turn on the user's own Claude
 * subscription via `@anthropic-ai/claude-agent-sdk`. Proves the full seam:
 * run-input gate → run() branch → startTurn pump → ProviderChunk→UIChunk
 * mapping → SSE → recorder persistence.
 *
 * Gated + excluded from CI (needs a logged-in `claude` and no API key). Run:
 *
 *   GRIDA_LIVE_CLAUDE=1 GRIDA_AGENT_SANDBOX_ENFORCED=1 \
 *     pnpm --filter @grida/agent vitest run src/agent-provider/run.live.test.ts
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { AuthStore } from "@grida/daemon/server";
import { SecretsStore } from "@grida/daemon/server";
import { WorkspaceRegistry } from "@grida/daemon/server";
import { openSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import { AgentRuntime } from "../runtime";
import { StreamRegistry } from "../runtime/stream-registry";
import { registerAgentRoutes } from "../http/routes/agent";
import { EndpointProvidersStore } from "../providers/endpoints";
import { assistantTextFromSse, sessionIdFromSse } from "../testing/sse";

const SANDBOX_ENFORCED = process.env.GRIDA_AGENT_SANDBOX_ENFORCED === "1";
const LIVE = process.env.GRIDA_LIVE_CLAUDE === "1" && SANDBOX_ENFORCED;
const TIMEOUT_MS = 300_000;
const liveDescribe = LIVE ? describe : describe.skip;

type Host = { app: Hono; runtime: AgentRuntime; store: SessionsStore };

function buildHost(baseDir: string): Host {
  const auth = new AuthStore(baseDir);
  const secrets = new SecretsStore(auth); // NO BYOK key is ever set
  const endpoints = new EndpointProvidersStore(baseDir); // NO endpoint configured
  const workspaces = new WorkspaceRegistry(baseDir);
  const db = openSessionsDb({ user_data_path: baseDir });
  const store = new SessionsStore(db);
  const app = new Hono();
  const runtime = new AgentRuntime({
    secrets,
    endpoints,
    workspace_registry: workspaces,
    sessions_store: store,
    streams: new StreamRegistry(),
    drain_cooldown_ms: 20,
    sandbox_enforced: SANDBOX_ENFORCED,
  });
  registerAgentRoutes(app, runtime);
  return { app, runtime, store };
}

async function runTurn(
  host: Host,
  body: Record<string, unknown>
): Promise<{ status: number; text: string; session_id: string | null }> {
  const res = await host.app.request("/agent/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const sse = await res.text();
  return {
    status: res.status,
    text: assistantTextFromSse(sse),
    session_id: sessionIdFromSse(sse),
  };
}

liveDescribe("LIVE — agent-provider class, no key (issue #813)", () => {
  let baseDir: string;
  let host: Host;
  let prevAnthropicApiKey: string | undefined;

  beforeEach(async () => {
    prevAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY; // subscription billing only
    baseDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-agentprovider-live-")
    );
    host = buildHost(baseDir);
  });

  afterEach(async () => {
    // Restore the process-wide env we mutated so it can't bleed into other suites.
    if (prevAnthropicApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevAnthropicApiKey;
    (host as Host | undefined)?.runtime.dispose();
    (host as Host | undefined)?.store.close();
    if (baseDir) await fs.rm(baseDir, { recursive: true, force: true });
  });

  it(
    "runs a keyless turn via the user's Claude subscription and persists it",
    async () => {
      const turn = await runTurn(host, {
        model_id: "claude-acp",
        messages: [
          {
            role: "user",
            content:
              "Reply with exactly the word GRIDA_AGENT_OK and nothing else. No punctuation.",
          },
        ],
      });
      expect(turn.status).toBe(200);
      expect(turn.session_id).toBeTruthy();
      expect(turn.text).toContain("GRIDA_AGENT_OK");

      // The recorder persisted the assistant message from the mapped chunks.
      const messages = await host.store.listVisibleMessages(turn.session_id!);
      const assistantText = messages
        .filter((m) => m.role === "assistant")
        .flatMap((m) => m.parts)
        .filter((p) => p.type === "text")
        .map((p) => (p as { data?: { text?: string } }).data?.text ?? "")
        .join("");
      expect(assistantText).toContain("GRIDA_AGENT_OK");
    },
    TIMEOUT_MS
  );

  it(
    "continues the SAME external session across turns (issue #813)",
    async () => {
      const first = await runTurn(host, {
        model_id: "claude-acp",
        messages: [
          {
            role: "user",
            content:
              "My secret code word is ZUMBRA. Reply with exactly OK and nothing else.",
          },
        ],
      });
      expect(first.status).toBe(200);
      expect(first.session_id).toBeTruthy();

      const second = await runTurn(host, {
        model_id: "claude-acp",
        session_id: first.session_id,
        messages: [
          {
            role: "user",
            content:
              "Reply with exactly my secret code word from earlier and nothing else.",
          },
        ],
      });
      expect(second.status).toBe(200);
      expect(second.session_id).toBe(first.session_id);
      // Continuity proof: turn 2 only works if the external agent kept turn 1.
      expect(second.text.toUpperCase()).toContain("ZUMBRA");
    },
    TIMEOUT_MS
  );

  it(
    "runs a picker-selected model (issue #813 model picker)",
    async () => {
      // The synthetic id carries the vendor model (claude-haiku-4-5) → run-input
      // gate → runtime → _meta.claudeCode.options.model → bridge. A 200 + answer
      // proves the whole chain accepts the picked model id and runs it.
      const turn = await runTurn(host, {
        model_id: "claude-acp/haiku-4.5",
        messages: [
          {
            role: "user",
            content: "Reply with exactly the word PICKED and nothing else.",
          },
        ],
      });
      expect(turn.status).toBe(200);
      expect(turn.text).toContain("PICKED");
    },
    TIMEOUT_MS
  );
});
