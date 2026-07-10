/**
 * E2E repro/regression for the supervised-approval RESUME executing the
 * approved command (RFC `permission modes`, Phase 2) — through the REAL
 * runtime + REAL AI SDK stream path (`createAgentUIStreamResponse`), with
 * only the model mocked.
 *
 * Field incident (ses_f4b5f06d2000t2RfaDx7lJO13T, 2026-07-10): clicking
 * Allow on a `run_command` approval surfaced a UI "network error"; the
 * persisted part froze at `approval-responded` and the command never ran.
 * Candidate causes: a client-side double-attach race (guarded in
 * `editor/lib/agent-chat`), or a server-side AI-SDK failure in the resume
 * pipeline (upstream vercel/ai#10196 class: "No tool invocation found"
 * after approving a `needsApproval` tool). This test decides the server
 * half: if the pause → Allow → resume → execute path is clean here, the
 * server is exonerated and the incident is client-side; if it throws, we
 * have a deterministic package-level repro.
 */
import fs from "node:fs/promises";
import { sessionIdFromSse } from "./testing/sse";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import {
  AuthStore,
  SecretsStore,
  WorkspaceRegistry,
} from "@grida/daemon/server";
import type { Workspace } from "@grida/daemon/server";
import { openSessionsDb } from "./session/db";
import { SessionsStore } from "./session/store";
import { AgentRuntime } from "./runtime";
import { StreamRegistry } from "./runtime/stream-registry";
import { runAgent as realRunAgent } from "./runtime/run-agent";
import type { ResolvedProvider } from "./providers";
import { registerAgentRoutes } from "./http/routes/agent";
import { registerSessionsRoutes } from "./http/routes/sessions";

/** Mock model contract: on a prompt WITHOUT a tool result, call run_command
 * (cp src → dest inside the workspace); once a tool result is visible in the
 * prompt, finish with plain text. */
const CMD_TRIGGER = "COPY_THE_FILE";

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

let baseDir: string;
let workspaceRoot: string;
let workspace: Workspace;
let store: SessionsStore;
let streams: StreamRegistry;
let app: Hono;
let srcFile: string;
let destFile: string;

function promptHasToolResult(prompt: unknown): boolean {
  return (
    Array.isArray(prompt) &&
    prompt.some((m) => (m as { role?: string }).role === "tool")
  );
}

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

function makeMockModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "openrouter",
    modelId: "openai/gpt-5.4-nano",
    doStream: async (options) => {
      const prompt = options.prompt as unknown[];
      const wantsCommand =
        lastUserText(prompt).includes(CMD_TRIGGER) &&
        !promptHasToolResult(prompt);
      if (wantsCommand) {
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "tc_cmd",
                toolName: "run_command",
                input: JSON.stringify({
                  command: "cp",
                  args: [srcFile, destFile],
                  description: "Copy the fixture file",
                }),
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
            { type: "text-delta", id: "t", delta: "copied." },
            { type: "text-end", id: "t" },
            FINISH_USAGE,
          ],
        }),
      };
    },
  });
}

// Inject the REAL runAgent but force the mock-model provider, so the whole
// createAgent → toolset(needsApproval) → message-view → SDK stream path runs
// for real (mirrors e2e.test.ts).
const runAgentInjected: typeof realRunAgent = (_provider, req, deps) => {
  const provider: ResolvedProvider = {
    provider_id: "openrouter",
    kind: "byok",
    model_factory: (() => {
      let m: MockLanguageModelV3 | null = null;
      return () => (m ??= makeMockModel());
    })(),
  };
  return realRunAgent(provider, req, deps);
};

beforeEach(async () => {
  baseDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-agent-approval-e2e-")
  );
  const userData = path.join(baseDir, "userdata");
  workspaceRoot = await fs.realpath(
    await fs
      .mkdir(path.join(baseDir, "workspace"), { recursive: true })
      .then(() => path.join(baseDir, "workspace"))
  );
  await fs.mkdir(userData, { recursive: true });

  srcFile = path.join(workspaceRoot, "hero.png");
  destFile = path.join(workspaceRoot, "outputs", "hero.png");
  await fs.writeFile(srcFile, "png-bytes", "utf8");
  await fs.mkdir(path.join(workspaceRoot, "outputs"), { recursive: true });

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
    skill_discovery: { include_user_scoped: false, stop_at: workspaceRoot },
    // Mirror the production sidecar: the host affirmed containment, so the
    // `run_command` tool is wired (GRIDA-SEC-004 fail-closed gate).
    shell_execution_allowed: true,
  });
  registerAgentRoutes(app, runtime);
  registerSessionsRoutes(app, { store, runtime });
});

afterEach(async () => {
  streams.clear();
  store.close();
  await fs.rm(baseDir, { recursive: true, force: true });
});

async function waitFor(
  fn: () => Promise<void>,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await fn();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((r) => setTimeout(r, 15));
    }
  }
}

describe("supervised approval resume (accept-edits) — real SDK stream path", () => {
  it(
    "pause → Allow → resume EXECUTES the command and completes the part (no 'No tool invocation found')",
    { timeout: 30_000 },
    async () => {
      // ── Turn 1: the model calls run_command; accept-edits pauses it. ──
      const userMsg = {
        id: "u_cmd_1",
        role: "user",
        parts: [{ type: "text", text: `${CMD_TRIGGER} please` }],
      };
      const res1 = await app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          messages: [userMsg],
          workspace_id: workspace.id,
          mode: "accept-edits",
        }),
      });
      expect(res1.status).toBe(200);
      const sse1 = await res1.text();
      const sessionId = sessionIdFromSse(sse1);

      // The turn must end paused: part persisted at approval-requested.
      let approvalId = "";
      await waitFor(async () => {
        const part = await store.findToolPart(sessionId, "tc_cmd");
        expect(part).toBeTruthy();
        const data = part!.data as {
          state?: string;
          approval?: { id?: string };
        };
        expect(data.state).toBe("approval-requested");
        expect(typeof data.approval?.id).toBe("string");
        approvalId = data.approval!.id!;
      });
      expect(await store.hasPendingApproval(sessionId)).toBe(true);
      // Nothing executed yet.
      await expect(fs.stat(destFile)).rejects.toThrow(/ENOENT/);

      // ── Resume: the user clicks Allow (approval_answer rides the body). ──
      const res2 = await app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          // The client resends its history; the tail user message already
          // exists (same id) so persistence is idempotent — no new user turn.
          messages: [userMsg],
          session_id: sessionId,
          workspace_id: workspace.id,
          mode: "accept-edits",
          approval_answer: {
            tool_call_id: "tc_cmd",
            approval_id: approvalId,
            approved: true,
          },
        }),
      });
      expect(res2.status).toBe(200);
      const sse2 = await res2.text();

      // The decisive assertion: the resume stream must NOT carry the AI-SDK
      // stream-state error (upstream #10196 class). If it does, this test IS
      // the deterministic server-side repro of the field incident.
      expect(sse2).not.toContain("No tool invocation found");
      expect(sse2).not.toContain('"type":"error"');

      // ── The CLIENT-reducer contract (message identity across the pause) ──
      // The renderer's useChat reducer can only attach the resume's
      // `tool-output-available` to the paused tool part if the resume stream
      // re-advertises the SAME assistant message id that turn 1 streamed the
      // part under (the "message-identity fix"). A fresh id opens a NEW
      // assistant message with no tool part → the AI-SDK client throws
      // "No tool invocation found", tears the stream down, and the UI shows
      // a bogus "network error". The server can't see that crash — this id
      // equality is the wire-level contract that prevents it.
      const startIds = (sse: string): string[] =>
        [...sse.matchAll(/"type":"start","messageId":"([^"]+)"/g)].map(
          (m) => m[1]
        );
      const [turn1Id] = startIds(sse1);
      const [resumeId] = startIds(sse2);
      expect(resumeId).toBe(turn1Id);

      // The approved command actually ran: cp produced the destination file.
      await waitFor(async () => {
        const stat = await fs.stat(destFile);
        expect(stat.isFile()).toBe(true);
      });

      // The ORIGINAL part completed in place: output-available, input intact.
      await waitFor(async () => {
        const part = await store.findToolPart(sessionId, "tc_cmd");
        expect(part).toBeTruthy();
        const data = part!.data as {
          state?: string;
          input?: { command?: string };
          output?: { exit_code?: number | null };
        };
        expect(data.state).toBe("output-available");
        expect(data.input?.command).toBe("cp");
        expect(data.output?.exit_code).toBe(0);
      });
      expect(await store.hasPendingApproval(sessionId)).toBe(false);

      // And the model's continuation ("copied.") landed after the tool part.
      await waitFor(async () => {
        const msgs = await store.listMessages(sessionId);
        const hasContinuation = msgs.some(
          (m) =>
            m.role === "assistant" &&
            m.parts.some(
              (p) =>
                (p.data as { type?: string }).type === "text" &&
                (p.data as { text?: string }).text === "copied."
            )
        );
        expect(hasContinuation).toBe(true);
      });
    }
  );

  it(
    "reconnect during/after the resume serves a SELF-CONTAINED stream a dropped client rebuilds from (replay prefix)",
    { timeout: 30_000 },
    async () => {
      // ── Reach the paused state, answer Allow (same flow as above). ──
      const userMsg = {
        id: "u_cmd_2",
        role: "user",
        parts: [{ type: "text", text: `${CMD_TRIGGER} please` }],
      };
      const res1 = await app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          messages: [userMsg],
          workspace_id: workspace.id,
          mode: "accept-edits",
        }),
      });
      const sse1 = await res1.text();
      const sessionId = sessionIdFromSse(sse1);
      const turn1Id = startIdsOf(sse1)[0];
      let approvalId = "";
      await waitFor(async () => {
        const part = await store.findToolPart(sessionId, "tc_cmd");
        const data = part?.data as
          | { state?: string; approval?: { id?: string } }
          | undefined;
        expect(data?.state).toBe("approval-requested");
        approvalId = data!.approval!.id!;
      });

      const res2 = await app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          messages: [userMsg],
          session_id: sessionId,
          workspace_id: workspace.id,
          mode: "accept-edits",
          approval_answer: {
            tool_call_id: "tc_cmd",
            approval_id: approvalId,
            approved: true,
          },
        }),
      });
      expect(res2.status).toBe(200);
      const sse2 = await res2.text();

      // The POST (live) response must NOT carry the prefix — its reducer
      // continues the live message in place; a prefix would duplicate parts.
      expect(sse2).not.toContain('"type":"tool-input-available"');
      expect(sse2).not.toContain('"type":"tool-approval-request"');

      // ── Reconnect inside the finish grace window (registry entry alive). ──
      const res3 = await app.request(`/agent/stream/${sessionId}`);
      expect(res3.status).toBe(200);
      const sse3 = await res3.text();
      const chunks = chunksOf(sse3);

      // Self-containment, in order: the prefix rebuilds the continued
      // message's head (start → pending tool input → approval request), THEN
      // the buffered resume frames (its own start + the executed output).
      const types = chunks.map((c) => c.type);
      expect(types[0]).toBe("start");
      expect((chunks[0] as { messageId?: string }).messageId).toBe(turn1Id);
      const inputIdx = types.indexOf("tool-input-available");
      const approvalIdx = types.indexOf("tool-approval-request");
      const outputIdx = types.indexOf("tool-output-available");
      expect(inputIdx).toBeGreaterThan(-1);
      expect(approvalIdx).toBeGreaterThan(inputIdx);
      expect(outputIdx).toBeGreaterThan(approvalIdx);

      // ── The incident's client state: onResumeStart DROPPED the assistant.
      // Feed the reconnect stream to the REAL AI-SDK client reducer from that
      // post-drop state — it must rebuild the full message without throwing
      // ("No tool invocation found" was the crash). ──
      let rebuilt: UIMessage | undefined;
      const stream = new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const c of chunks) controller.enqueue(c as UIMessageChunk);
          controller.close();
        },
      });
      for await (const state of readUIMessageStream({ stream })) {
        rebuilt = state;
      }
      expect(rebuilt).toBeTruthy();
      expect(rebuilt!.id).toBe(turn1Id);
      const toolPart = rebuilt!.parts.find(
        (p) => p.type === "tool-run_command"
      ) as
        | {
            state?: string;
            input?: { command?: string };
            output?: { exit_code?: number };
          }
        | undefined;
      expect(toolPart).toBeTruthy();
      expect(toolPart!.state).toBe("output-available");
      expect(toolPart!.input?.command).toBe("cp");
      expect(toolPart!.output?.exit_code).toBe(0);
      const textParts = rebuilt!.parts.filter((p) => p.type === "text");
      expect(
        textParts.some((p) => (p as { text?: string }).text === "copied.")
      ).toBe(true);

      // ── And the prefix never double-persisted: exactly ONE row for tc_cmd. ──
      await waitFor(async () => {
        const msgs = await store.listMessages(sessionId);
        const toolRows = msgs
          .flatMap((m) => m.parts)
          .filter((p) => p.tool_call_id === "tc_cmd");
        expect(toolRows).toHaveLength(1);
        expect((toolRows[0]!.data as { state?: string }).state).toBe(
          "output-available"
        );
      });
    }
  );
});

/** All `start` chunk messageIds in an SSE body, in order. */
function startIdsOf(sse: string): string[] {
  return [...sse.matchAll(/"type":"start","messageId":"([^"]+)"/g)].map(
    (m) => m[1]!
  );
}

/** Parse an agent SSE body into UI-message chunk objects (skips the
 * `grida-session` continuity frame and the `[DONE]` sentinel). */
function chunksOf(sse: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const frame of sse.split("\n\n")) {
    if (frame.includes("event:")) continue;
    const data = frame
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      out.push(JSON.parse(data));
    } catch {
      // non-JSON frame — not a chunk
    }
  }
  return out;
}
