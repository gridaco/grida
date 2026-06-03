/**
 * End-to-end verification over a real on-disk fixture workspace.
 *
 * Drives the REAL runtime — provider resolution, persistence, the
 * server-authoritative message view, skill discovery + the `skill` tool,
 * project instructions, rewind, fork, and compaction — with a captured
 * mock model (no network). The mock records the exact prompt each turn so
 * we can assert what the model actually saw.
 *
 * This is the capstone for the three RFC features:
 *   - skills      → discovery + index in the prompt + `skill` tool loads a body
 *   - rewind      → a hidden turn vanishes from the model's view
 *   - fork        → an independent session sharing history up to the fork point
 *   - compaction  → the head is summarized + folded into the next user turn
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { AuthStore } from "./auth/file";
import { SecretsStore } from "./secrets";
import { WorkspaceRegistry, type Workspace } from "./workspaces";
import { openSessionsDb } from "./session/db";
import { SessionsStore } from "./session/store";
import { AgentRuntime } from "./runtime";
import { StreamRegistry } from "./runtime/stream-registry";
import { runAgent as realRunAgent } from "./runtime/run-agent";
import type { ResolvedProvider } from "./providers";
import { registerAgentRoutes } from "./http/routes/agent";
import { registerSessionsRoutes } from "./http/routes/sessions";

type CapturedTurn = { system: string; messages: unknown[] };

let baseDir: string;
let workspaceRoot: string;
let workspace: Workspace;
let store: SessionsStore;
let streams: StreamRegistry;
let app: Hono;
let captured: CapturedTurn[];
/** When the incoming prompt's last user text contains this, the mock
 *  emits a `skill` tool call instead of plain text. */
const SKILL_TRIGGER = "USE_ALPHA_SKILL";

const FINISH_USAGE = {
  type: "finish" as const,
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage: {
    inputTokens: {
      total: 10,
      noCache: 10,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 5, text: 5, reasoning: undefined },
  },
};

function lastUserText(prompt: unknown): string {
  if (!Array.isArray(prompt)) return "";
  for (let i = prompt.length - 1; i >= 0; i -= 1) {
    const m = prompt[i] as { role?: string; content?: unknown };
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .map((p) => (p as { text?: string }).text ?? "")
        .join(" ");
    }
  }
  return "";
}

function systemText(prompt: unknown): string {
  if (!Array.isArray(prompt)) return "";
  return prompt
    .filter((m) => (m as { role?: string }).role === "system")
    .map((m) => {
      const c = (m as { content?: unknown }).content;
      return typeof c === "string" ? c : "";
    })
    .join("\n");
}

function makeMockModel(): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    provider: "openrouter",
    modelId: "openai/gpt-5.4-nano",
    doStream: async (options) => {
      call += 1;
      const prompt = options.prompt as unknown[];
      captured.push({
        system: systemText(prompt),
        messages: prompt.filter(
          (m) => (m as { role?: string }).role !== "system"
        ),
      });
      const wantsSkill =
        lastUserText(prompt).includes(SKILL_TRIGGER) && call === 1;
      if (wantsSkill) {
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "tc_skill",
                toolName: "skill",
                input: JSON.stringify({ name: "alpha" }),
              },
              FINISH_USAGE,
            ],
          }),
        };
      }
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "done" },
            { type: "text-end", id: "t" },
            FINISH_USAGE,
          ],
        }),
      };
    },
  });
}

const fakeProvider: ResolvedProvider = {
  provider_id: "openrouter",
  kind: "byok",
  // Fresh capturing model per run so multi-step tool loops share it.
  model_factory: (() => {
    let model: MockLanguageModelV3 | null = null;
    return () => (model ??= makeMockModel());
  })(),
};

// Inject the REAL runAgent but force the fake (mock-model) provider so the
// whole createAgent → tools → message-view → stream path runs for real.
const runAgentInjected: typeof realRunAgent = (_provider, req, deps) => {
  // A fresh model per turn (so the per-turn capture + tool loop is clean).
  const provider: ResolvedProvider = {
    ...fakeProvider,
    model_factory: (() => {
      let m: MockLanguageModelV3 | null = null;
      return () => (m ??= makeMockModel());
    })(),
  };
  return realRunAgent(provider, req, deps);
};

beforeEach(async () => {
  captured = [];
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-e2e-"));
  const userData = path.join(baseDir, "userdata");
  workspaceRoot = await fs.realpath(
    await fs
      .mkdir(path.join(baseDir, "workspace"), { recursive: true })
      .then(() => path.join(baseDir, "workspace"))
  );
  await fs.mkdir(userData, { recursive: true });

  // ── fixture workspace contents ──────────────────────────────────────
  await fs.writeFile(
    path.join(workspaceRoot, "README.md"),
    "# Fixture project\n",
    "utf8"
  );
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, "src/app.ts"),
    "export const x = 1;\n",
    "utf8"
  );
  // Project instructions (eager).
  await fs.writeFile(
    path.join(workspaceRoot, "AGENTS.md"),
    "# Fixture rules\nUse pnpm, never npm. The test command is `just test`.\n",
    "utf8"
  );
  // Two skills (lazy, advertise-then-load).
  await writeFixtureSkill(
    "alpha",
    "name: alpha\ndescription: >-\n  Author alpha widgets. Use when the user mentions alpha.",
    "# Alpha skill\n\nStep 1: do alpha. Step 2: verify alpha."
  );
  await writeFixtureSkill(
    "beta",
    "name: beta\ndescription: Configure beta pipelines.",
    "# Beta skill\n\nbeta instructions."
  );

  const auth = new AuthStore(userData);
  const secrets = new SecretsStore(auth);
  await secrets.set("openrouter", "sk-test");
  const registry = new WorkspaceRegistry(userData);
  workspace = await registry.open(workspaceRoot);

  store = new SessionsStore(openSessionsDb({ user_data_path: userData }));
  streams = new StreamRegistry();
  app = new Hono();
  const runtime = new AgentRuntime({
    secrets,
    workspace_registry: registry,
    sessions_store: store,
    streams,
    run_agent: runAgentInjected,
    // Fake summarizer so compaction never hits the network.
    compaction: {
      summarize: async () => "## Goal\nFIXTURE SUMMARY of earlier work.",
    },
    // Hermetic discovery: only the fixture workspace, no real ~/.agents skills.
    skill_discovery: { include_user_scoped: false, stop_at: workspaceRoot },
  });
  registerAgentRoutes(app, runtime);
  registerSessionsRoutes(app, { store, runtime });
});

afterEach(async () => {
  streams.clear();
  store.close();
  await fs.rm(baseDir, { recursive: true, force: true });
});

async function writeFixtureSkill(
  name: string,
  frontmatter: string,
  body: string
): Promise<void> {
  const dir = path.join(workspaceRoot, ".agents/skills", name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    `---\n${frontmatter}\n---\n\n${body}\n`,
    "utf8"
  );
}

/** Drive one /agent/run turn to completion; return the session id. */
async function runTurn(opts: {
  text: string;
  session_id?: string;
}): Promise<string> {
  const body: Record<string, unknown> = {
    messages: [
      {
        id: `m_${Math.random().toString(36).slice(2)}`,
        role: "user",
        parts: [{ type: "text", text: opts.text }],
      },
    ],
    workspace_id: workspace.id,
  };
  if (opts.session_id) body.session_id = opts.session_id;
  const res = await app.request("/agent/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
  // The session id rides the in-band `grida-session` SSE frame (the sole
  // continuity channel), so we drain the body and pull it from there.
  const sessionId = sessionIdFromSse(await res.text());
  // Let the recorder's async write chain settle.
  await waitFor(async () => {
    const msgs = await store.listMessages(sessionId);
    expect(msgs.some((m) => m.role === "assistant")).toBe(true);
  });
  return sessionId;
}

/** Pull the session id out of a drained SSE body's `grida-session` frame. */
function sessionIdFromSse(body: string): string {
  for (const frame of body.split("\n\n")) {
    if (!frame.startsWith("event: grida-session")) continue;
    const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) continue;
    try {
      const parsed = JSON.parse(dataLine.slice("data:".length).trim()) as {
        session_id?: string;
      };
      return parsed.session_id ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

async function waitFor(
  fn: () => Promise<void>,
  timeoutMs = 2000
): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await fn();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

describe("agent system e2e (skills · rewind · fork · compaction)", () => {
  it("injects the skill index + project instructions into the model's system prompt", async () => {
    await runTurn({ text: "hello" });
    const sys = captured[0].system;
    // Skill index (descriptions only, both skills).
    expect(sys).toContain("<skills>");
    expect(sys).toContain("alpha: Author alpha widgets");
    expect(sys).toContain("beta: Configure beta pipelines.");
    // Bodies are NOT eagerly injected.
    expect(sys).not.toContain("Step 1: do alpha");
    // Project instructions (eager).
    expect(sys).toContain("<project_instructions>");
    expect(sys).toContain("Use pnpm, never npm");
  });

  it("loads a skill body via the `skill` tool and records the wrapped output", async () => {
    const sessionId = await runTurn({ text: `please ${SKILL_TRIGGER} now` });
    // The model called skill(alpha) → tool executed → body recorded.
    const messages = await store.listMessages(sessionId);
    const toolParts = messages
      .flatMap((m) => m.parts)
      .filter((p) => p.type.startsWith("tool-") || p.type === "dynamic-tool");
    expect(toolParts.length).toBeGreaterThan(0);
    const skillOut = toolParts.find((p) => {
      const out = (p.data as { output?: { content?: string } }).output;
      return typeof out?.content === "string" && out.content.includes("alpha");
    });
    expect(skillOut).toBeTruthy();
    const content = (skillOut!.data as { output: { content: string } }).output
      .content;
    expect(content).toContain('<skill_content name="alpha">');
    expect(content).toContain("Step 1: do alpha");
  });

  it("is server-authoritative: turn 2 sees turn 1 from the DB, not the client array", async () => {
    const sessionId = await runTurn({ text: "first question" });
    captured = [];
    // Send ONLY the new user message — the server rebuilds full history.
    await runTurn({ text: "second question", session_id: sessionId });
    const view = captured[0].messages as Array<{ role: string }>;
    // The model saw: user(first), assistant(done), user(second).
    expect(view.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("rewind hides a turn from the model's next view", async () => {
    const sessionId = await runTurn({ text: "keep this" });
    await runTurn({ text: "throw this away", session_id: sessionId });
    const msgs = await store.listMessages(sessionId);
    const firstUser = msgs.find((m) => m.role === "user")!;

    // Rewind to the first user message — everything after is hidden.
    const rw = await app.request(`/sessions/${sessionId}/rewind`, {
      method: "POST",
      body: JSON.stringify({ from_message_id: firstUser.id }),
    });
    expect(rw.status).toBe(200);

    captured = [];
    await runTurn({ text: "fresh continuation", session_id: sessionId });
    const view = captured[0].messages as Array<{
      role: string;
      content: unknown;
    }>;
    // Only the kept first user turn + the fresh one survive; the thrown-away
    // turn is gone.
    const allText = JSON.stringify(view);
    expect(allText).toContain("keep this");
    expect(allText).toContain("fresh continuation");
    expect(allText).not.toContain("throw this away");
  });

  it("fork creates an independent session sharing history up to the fork point", async () => {
    const sessionId = await runTurn({ text: "shared turn" });
    await runTurn({ text: "parent-only turn", session_id: sessionId });
    const msgs = await store.listMessages(sessionId);
    const firstAssistant = msgs.find((m) => m.role === "assistant")!;

    const res = await app.request(`/sessions/${sessionId}/fork`, {
      method: "POST",
      body: JSON.stringify({ from_message_id: firstAssistant.id }),
    });
    expect(res.status).toBe(200);
    const fork = (await res.json()) as { id: string; parent_id: string };
    expect(fork.parent_id).toBe(sessionId);

    // The fork has the shared prefix (user + assistant), not the parent-only turn.
    const forkMsgs = await store.listMessages(fork.id);
    expect(forkMsgs.length).toBe(2);
    expect(JSON.stringify(forkMsgs)).toContain("shared turn");
    expect(JSON.stringify(forkMsgs)).not.toContain("parent-only turn");

    // A new turn on the fork doesn't touch the parent.
    captured = [];
    await runTurn({ text: "fork continuation", session_id: fork.id });
    expect((await store.listMessages(sessionId)).length).toBe(4); // parent unchanged
  });

  it("auto-fires compaction in the run path when over the usable threshold", async () => {
    const sessionId = await runTurn({ text: "turn A" });
    await runTurn({ text: "turn B", session_id: sessionId });
    await runTurn({ text: "turn C", session_id: sessionId });
    // No compaction yet.
    expect(
      (await store.listVisibleMessages(sessionId)).some((m) =>
        m.parts.some((p) => p.type === "data-compaction")
      )
    ).toBe(false);

    // Force the session over its usable context (usable = contextWindow −
    // reserve; seed above any catalog model's window so it fires regardless
    // of which model the `pro` tier resolves to).
    await store.setUsage(sessionId, { total_tokens: 5_000_000 });

    // The next run auto-fires compaction before the model call.
    await runTurn({
      text: "turn D triggers compaction",
      session_id: sessionId,
    });
    const visible = await store.listVisibleMessages(sessionId);
    expect(
      visible.some((m) => m.parts.some((p) => p.type === "data-compaction"))
    ).toBe(true);
    // Nothing is hidden — the summarized head stays in the linear log; the
    // model boundary is read-time. The rollup reflects the freed context.
    const all = await store.listMessages(sessionId);
    expect(all.every((m) => m.hidden_at === null)).toBe(true);
    expect((await store.get(sessionId))!.total_tokens).toBeLessThan(5_000_000);
  });

  it("compaction summarizes the head and folds it into the next user turn", async () => {
    const sessionId = await runTurn({ text: "turn one content" });
    await runTurn({ text: "turn two content", session_id: sessionId });
    await runTurn({ text: "turn three content", session_id: sessionId });

    // Manual compaction summarizes everything — the marker lands at the bottom.
    const res = await app.request(`/sessions/${sessionId}/compact`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const result = (await res.json()) as { compacted: boolean };
    expect(result.compacted).toBe(true);

    // The summary lives on a synthetic assistant message, appended last.
    const visible = await store.listVisibleMessages(sessionId);
    const summary = visible[visible.length - 1].parts.find(
      (p) => p.type === "data-compaction"
    );
    expect(summary).toBeTruthy();

    // Next turn: the model sees the summary folded into a user message, and
    // the view is user-led (no assistant-first).
    captured = [];
    await runTurn({ text: "after compaction", session_id: sessionId });
    const view = captured[0].messages as Array<{ role: string }>;
    expect(view[0].role).toBe("user");
    expect(JSON.stringify(view)).toContain("FIXTURE SUMMARY");
    expect(JSON.stringify(view)).toContain("after compaction");
  });
});
