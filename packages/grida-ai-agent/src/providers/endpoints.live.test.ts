/**
 * LIVE end-to-end — endpoint providers against a REAL local Ollama
 * (issue #806). The durability bar for "no signup, no key": a host with
 * NO BYOK secret and one configured endpoint must run the agent end to
 * end — provider resolution, the run loop, session persistence, the
 * background titler, and a real server-side tool execution.
 *
 * Gated + excluded from CI (needs a local `ollama serve` + a pulled
 * model). Run explicitly:
 *
 *   GRIDA_LIVE_OLLAMA=1 \
 *     pnpm --filter @grida/agent vitest run src/providers/endpoints.live.test.ts
 *
 * Env knobs:
 *   GRIDA_LIVE_OLLAMA=1       — required, opts in.
 *   GRIDA_LIVE_OLLAMA_MODEL   — model id to use (default: first from /api/tags).
 *   GRIDA_LIVE_OLLAMA_URL     — base URL (default: the Ollama preset).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { AuthStore } from "@grida/daemon/server";
import { SecretsStore } from "@grida/daemon/server";
import { WorkspaceRegistry } from "@grida/daemon/server";
import { openSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import { OLLAMA_ENDPOINT_PRESET } from "../protocol/endpoints";
import { session_title } from "../session/title";
import { AgentRuntime } from "../runtime";
import { StreamRegistry } from "../runtime/stream-registry";
import { registerAgentRoutes } from "../http/routes/agent";
import { assistantTextFromSse, sessionIdFromSse } from "../testing/sse";
import { EndpointProvidersStore } from "./endpoints";
import { probeEndpointModels } from "./probe";
import { resolveProvider } from ".";

const LIVE = process.env.GRIDA_LIVE_OLLAMA === "1";
const BASE_URL =
  process.env.GRIDA_LIVE_OLLAMA_URL ?? OLLAMA_ENDPOINT_PRESET.base_url;
const TIMEOUT_MS = 300_000;

const liveDescribe = LIVE ? describe : describe.skip;

/** The model to test with — env override, else the first installed model. */
async function detectModelId(): Promise<string> {
  if (process.env.GRIDA_LIVE_OLLAMA_MODEL) {
    return process.env.GRIDA_LIVE_OLLAMA_MODEL;
  }
  const origin = new URL(BASE_URL).origin;
  const res = await fetch(`${origin}/api/tags`);
  const data = (await res.json()) as { models?: Array<{ name: string }> };
  const first = data.models?.[0]?.name;
  if (!first) throw new Error("no Ollama models installed — `ollama pull` one");
  return first;
}

type Host = {
  app: Hono;
  runtime: AgentRuntime;
  store: SessionsStore;
  workspaces: WorkspaceRegistry;
};

function buildHost(baseDir: string): Host {
  const auth = new AuthStore(baseDir);
  const secrets = new SecretsStore(auth);
  const endpoints = new EndpointProvidersStore(baseDir);
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
  });
  registerAgentRoutes(app, runtime);
  return { app, runtime, store, workspaces };
}

async function runTurn(
  host: Host,
  body: Record<string, unknown>
): Promise<{ status: number; text: string; session_id: string }> {
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

let MODEL_ID = "";

liveDescribe("LIVE — Ollama endpoint provider, no key (issue #806)", () => {
  let baseDir: string;
  let host: Host;

  beforeAll(async () => {
    MODEL_ID = await detectModelId();
    console.log(`[live-ollama] model=${MODEL_ID} base_url=${BASE_URL}`);
  });

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-ollama-live-"));
    // NO BYOK key is ever set — the whole point. Just the endpoint config.
    const endpoints = new EndpointProvidersStore(baseDir);
    await endpoints.set({
      ...OLLAMA_ENDPOINT_PRESET,
      base_url: BASE_URL,
      models: [{ id: MODEL_ID, contextWindow: 32_768, tool_call: true }],
    });
    host = buildHost(baseDir);
  });

  afterEach(async () => {
    // Conditional: a beforeEach failure leaves `host`/`baseDir` unset —
    // teardown must surface the setup error, not mask it by throwing.
    (host as Host | undefined)?.runtime.dispose();
    (host as Host | undefined)?.store.close();
    if (baseDir) await fs.rm(baseDir, { recursive: true, force: true });
  });

  it(
    "resolves the endpoint provider with no secret configured",
    async () => {
      const endpoints = new EndpointProvidersStore(baseDir);
      const secrets = new SecretsStore(new AuthStore(baseDir));
      const provider = await resolveProvider({ secrets, endpoints });
      expect(provider.provider_id).toBe("ollama");
      expect(provider.kind).toBe("endpoint");
    },
    TIMEOUT_MS
  );

  it(
    "probes the running Ollama and discovers the test model",
    async () => {
      const result = await probeEndpointModels(BASE_URL);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.source).toBe("ollama");
      const found = result.models.find((m) => m.id === MODEL_ID);
      expect(found).toBeDefined();
      // The live model advertises tool support via /api/tags capabilities.
      expect(found?.tool_call).toBe(true);
      // Context window comes from /api/ps (loaded allocation) or
      // /api/show (model max) — either way a real positive number.
      expect(found?.contextWindow ?? 0).toBeGreaterThan(0);
    },
    TIMEOUT_MS
  );

  it(
    "runs a keyless text turn end-to-end and persists the session",
    async () => {
      const turn = await runTurn(host, {
        messages: [
          {
            role: "user",
            content:
              "Reply with exactly the word GRIDA_OK and nothing else. No punctuation.",
          },
        ],
        model_id: MODEL_ID,
      });
      expect(turn.status).toBe(200);
      expect(turn.session_id).toBeTruthy();
      expect(turn.text).toContain("GRIDA_OK");

      const session = await host.store.get(turn.session_id!);
      expect(session?.model?.provider_id).toBe("ollama");
      expect(session?.model?.model_id).toBe(MODEL_ID);
      // Usage was recorded off the real stream.
      expect(session?.total_tokens ?? 0).toBeGreaterThan(0);

      // The background titler rides the SAME endpoint factory (its `nano`
      // tier must land on the local model). Poll for the rename.
      let titled = false;
      for (let i = 0; i < 60 && !titled; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const row = await host.store.get(turn.session_id!);
        titled = row != null && !session_title.isDefault(row.title);
      }
      expect(titled).toBe(true);
    },
    TIMEOUT_MS
  );

  it(
    "second turn continues the same session (server-authoritative view)",
    async () => {
      const first = await runTurn(host, {
        messages: [
          {
            role: "user",
            content:
              "My secret code word is ZUMBRA. Acknowledge with OK and nothing else.",
          },
        ],
        model_id: MODEL_ID,
      });
      expect(first.status).toBe(200);
      const second = await runTurn(host, {
        session_id: first.session_id,
        messages: [
          {
            role: "user",
            content:
              "Reply with exactly my secret code word from earlier and nothing else.",
          },
        ],
        model_id: MODEL_ID,
      });
      expect(second.status).toBe(200);
      expect(second.session_id).toBe(first.session_id);
      expect(second.text.toUpperCase()).toContain("ZUMBRA");
    },
    TIMEOUT_MS
  );

  it(
    "manual compaction summarizes via the endpoint model (thinking-safe cap)",
    async () => {
      const first = await runTurn(host, {
        messages: [
          {
            role: "user",
            content:
              "We are naming a project. I propose the name AURELIA-9. Acknowledge briefly.",
          },
        ],
        model_id: MODEL_ID,
      });
      expect(first.status).toBe(200);

      const res = await host.runtime.compact(first.session_id);
      const result = (await res.json()) as {
        compacted: boolean;
        reason?: string;
        summary_message_id?: string;
      };
      // A thinking model with a too-tight output cap returns an EMPTY
      // summary (`finish_reason: length` before any text) — `compacted`
      // flips false ("summarizer-failed") or persists nothing useful.
      expect(result.compacted).toBe(true);

      const messages = await host.store.listVisibleMessages(first.session_id);
      const summaryPart = messages
        .flatMap((m) => m.parts)
        .find((p) => p.type === "data-compaction");
      const summary = (
        summaryPart?.data as { data?: { summary?: string } } | null
      )?.data?.summary;
      expect(summary ?? "").toMatch(/AURELIA-9/i);
    },
    TIMEOUT_MS
  );

  it(
    "executes a REAL server-side tool call (workspace fs write)",
    async () => {
      const wsRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "grida-ollama-ws-")
      );
      try {
        const ws = await host.workspaces.open(wsRoot);
        const turn = await runTurn(host, {
          workspace_id: ws.id,
          model_id: MODEL_ID,
          // `auto` so the local run needs no supervised approval round-trip.
          mode: "auto",
          messages: [
            {
              role: "user",
              content:
                "Use your file tools to create a file named hello.txt at the workspace root containing exactly: hello from ollama — then confirm.",
            },
          ],
        });
        expect(turn.status).toBe(200);
        const written = await fs.readFile(
          path.join(ws.root, "hello.txt"),
          "utf8"
        );
        expect(written.toLowerCase()).toContain("hello from ollama");
      } finally {
        await fs.rm(wsRoot, { recursive: true, force: true });
      }
    },
    TIMEOUT_MS
  );
});
