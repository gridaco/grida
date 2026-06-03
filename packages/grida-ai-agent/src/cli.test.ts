/**
 * CLI integration — the lifecycle commands (compact / rewind / fork) and
 * run-arg parsing.
 *
 * Drives the REAL command handlers through a real `AgentTransport.Client` → a
 * served Hono app (real loopback socket) → an `AgentRuntime` with an injected
 * summarizer (so `compact` never calls a model). This is the proof of the
 * CLI-as-source-of-truth rule: the same client methods the desktop bridge
 * calls, exercised from the canonical CLI surface, end to end over HTTP — no
 * Electron shell.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { AuthStore } from "./auth/file";
import { SecretsStore } from "./secrets";
import { WorkspaceRegistry } from "./workspaces";
import { openSessionsDb } from "./session/db";
import { SessionsStore } from "./session/store";
import { AGENT_SESSION_AGENT } from "./protocol/run";
import { AgentRuntime } from "./runtime";
import { StreamRegistry } from "./runtime/stream-registry";
import { registerSessionsRoutes } from "./http/routes/sessions";
import { AgentTransport } from "./transport";
import {
  forkCommand,
  compactCommand,
  messagesCommand,
  parseRunArgs,
  rewindCommand,
  type CliWriter,
} from "./cli";

describe("CLI — session lifecycle commands (real client → HTTP → runtime)", () => {
  let baseDir: string;
  let store: SessionsStore;
  let streams: StreamRegistry;
  let server: ReturnType<typeof serve>;
  let client: AgentTransport.Client;
  let lines: string[];
  let out: CliWriter;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-cli-"));
    const auth = new AuthStore(baseDir);
    const secrets = new SecretsStore(auth);
    // A present (fake) key is enough for provider resolution; the injected
    // summarizer means the model is never actually called.
    await secrets.set("openrouter", "sk-test");
    store = new SessionsStore(openSessionsDb({ user_data_path: baseDir }));
    streams = new StreamRegistry();
    const app = new Hono();
    const runtime = new AgentRuntime({
      secrets,
      workspace_registry: new WorkspaceRegistry(baseDir),
      sessions_store: store,
      streams,
      compaction: { summarize: async () => "## Goal\nFAKE SUMMARY" },
    });
    registerSessionsRoutes(app, { store, runtime });
    const port = await new Promise<number>((resolve) => {
      server = serve(
        { fetch: app.fetch, hostname: "127.0.0.1", port: 0 },
        (info) => resolve(info.port)
      );
    });
    client = new AgentTransport.Client({
      base_url: AgentTransport.baseUrl(port),
      password: "test",
      origin: "http://127.0.0.1",
      referer: "http://127.0.0.1/cli",
    });
    lines = [];
    out = { write: (s) => lines.push(s) };
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    streams.clear();
    store.close();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  async function seed(n: number): Promise<{ id: string; userIds: string[] }> {
    const s = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: { provider_id: "openrouter", tier: "pro" },
    });
    const userIds: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const u = await store.appendMessage(s.id, { role: "user" });
      await store.upsertPart(u.id, {
        index: 0,
        type: "text",
        data: { type: "text", text: `u${i}` },
      });
      userIds.push(u.id);
      const a = await store.appendMessage(s.id, { role: "assistant" });
      await store.upsertPart(a.id, {
        index: 0,
        type: "text",
        data: { type: "text", text: `a${i}` },
      });
      await new Promise((r) => setTimeout(r, 2));
    }
    return { id: s.id, userIds };
  }

  const output = () => lines.join("").trim();

  it("compact <id> summarizes the whole conversation (manual, no verbatim tail)", async () => {
    const { id } = await seed(2);
    await compactCommand(client, [id], out);

    const result = JSON.parse(output());
    expect(result.compacted).toBe(true);
    expect(result.kept_turns).toBe(0);
    expect(result.tail_start_id).toBeNull();

    // The summary marker is appended at the bottom; nothing is hidden.
    const visible = await store.listVisibleMessages(id);
    const last = visible[visible.length - 1];
    expect(last.parts.some((p) => p.type === "data-compaction")).toBe(true);
    expect(visible.every((m) => m.hidden_at == null)).toBe(true);
  });

  it("compact <id> reports nothing-to-compact on an empty session", async () => {
    const { id } = await seed(0);
    await compactCommand(client, [id], out);

    const result = JSON.parse(output());
    expect(result.compacted).toBe(false);
    expect(result.reason).toBe("nothing-to-compact");
  });

  it("compact with no session id throws a usage error before any request", async () => {
    await expect(compactCommand(client, [], out)).rejects.toThrow(/usage/);
  });

  it("rewind <id> <messageId> soft-truncates the tail", async () => {
    const { id, userIds } = await seed(3);
    await rewindCommand(client, [id, userIds[2]], out);

    const result = JSON.parse(output());
    expect(result.hidden_count).toBeGreaterThan(0);
    const visible = await store.listVisibleMessages(id);
    expect(visible.length).toBeLessThan(6); // 3 turns = 6 messages before
  });

  it("fork <id> <messageId> forks a new, independent session", async () => {
    const { id, userIds } = await seed(2);
    await forkCommand(client, [id, userIds[1]], out);

    const newId = output().split("\t")[0];
    expect(newId).not.toBe(id);
    expect(await store.get(newId)).toBeTruthy();
  });

  it("messages <id> prints the linear transcript with the divider at the bottom", async () => {
    const { id } = await seed(2);
    await compactCommand(client, [id], out);
    lines.length = 0;
    await messagesCommand(client, [id], out);

    const printed = lines.join("").trimEnd().split("\n");
    // Full history is still listed (nothing dropped)…
    expect(printed.filter((l) => l.startsWith("[user]")).length).toBe(2);
    // …and the compaction divider is the last line (the invocation point).
    expect(printed[printed.length - 1]).toContain("compacted");
  });
});

describe("CLI — parseRunArgs", () => {
  it("threads --session and joins the rest as the message", () => {
    const r = parseRunArgs(["--session", "ses_x", "hello", "world"]);
    expect(r.session_id).toBe("ses_x");
    expect(r.message).toBe("hello world");
  });

  it("supports the -s alias", () => {
    const r = parseRunArgs(["-s", "ses_y", "hi"]);
    expect(r.session_id).toBe("ses_y");
    expect(r.message).toBe("hi");
  });

  it("leaves sessionId undefined when omitted (fresh session)", () => {
    const r = parseRunArgs(["just", "a", "message"]);
    expect(r.session_id).toBeUndefined();
    expect(r.message).toBe("just a message");
  });
});
