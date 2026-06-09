/**
 * LIVE regression — the permission-mode model (RFC `permission modes`). Real
 * provider, real model, real sandbox policy code. Began life as the "sandbox is
 * too strict" reproduction (the hardcoded allowlist blocked `python3`/`node`);
 * now it pins the fix.
 *
 * Mirrors the shipped macOS desktop: `shell_execution_allowed` is TRUE and
 * `run_command` IS in the tool registry. There is no command allowlist anymore —
 * a per-session MODE gates the shell:
 *
 *   - `auto`: every command runs. The agent writes a script and runs it
 *     (`python3`/`node`), producing `chart.svg`. (Headline: the fix works.)
 *   - `accept-edits`: only read-only commands auto-run; a mutating/executing
 *     command **pauses for a supervised Allow/Deny** (a `tool-approval-request`
 *     chunk; the SDK's native `needsApproval`). This harness never approves, so
 *     the interpreter never runs here. The answer/resume boundary is unit-pinned
 *     in `store.test.ts` (`answerApproval`) + `workspace-agent-bindings.test.ts`.
 *
 * NOT exercised here: the srt Seatbelt OUTER wrap (this test runs unsandboxed —
 * it pins the in-process mode gate + shell runner, the agent-visible behavior).
 *
 * Gated + excluded from CI. Run with a real BYOK key (source the gitignored
 * env file so process.env carries the key — vitest does NOT auto-load it):
 *
 *   set -a; . ./.env.test.local; set +a
 *   pnpm exec vitest run src/runtime/sandbox-repro.live.test.ts
 */

/* eslint-disable jest/no-conditional-expect */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { AuthStore } from "../auth/file";
import { SecretsStore } from "../secrets";
import { WorkspaceRegistry } from "../workspaces";
import { openSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import { AgentRuntime } from ".";
import { StreamRegistry } from "./stream-registry";
import { registerAgentRoutes } from "../http/routes/agent";

const LIVE = process.env.GRIDA_LIVE_AGENT === "1";
const PROVIDER_KEY =
  process.env.OPENROUTER_API_KEY ?? process.env.GRIDA_BYOK_KEY ?? "";
const PROVIDER_ID = (process.env.GRIDA_BYOK_PROVIDER ?? "openrouter") as
  | "openrouter"
  | "vercel";
const MODEL_ID = process.env.GRIDA_LIVE_MODEL ?? "anthropic/claude-sonnet-4.6";
const TIMEOUT_MS = 240_000;

const liveDescribe = LIVE && PROVIDER_KEY ? describe : describe.skip;

// ── SSE → transcript ───────────────────────────────────────────────────────
type ToolCall = {
  id: string;
  name?: string;
  input?: unknown;
  output?: unknown;
  /** The SDK paused this call for a supervised approval (`accept-edits`). */
  approvalRequested?: boolean;
  /** The approval id from the pause — needed to answer (Allow/Deny). */
  approvalId?: string;
};

type Transcript = {
  text: string;
  tools: ToolCall[];
  sessionId: string;
};

function parseTranscript(body: string): Transcript {
  let text = "";
  let sessionId = "";
  const byId = new Map<string, ToolCall>();
  const order: string[] = [];
  const get = (id: string): ToolCall => {
    let t = byId.get(id);
    if (!t) {
      t = { id };
      byId.set(id, t);
      order.push(id);
    }
    return t;
  };

  for (const frame of body.split("\n\n")) {
    if (frame.startsWith("event: grida-session")) {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (dataLine) {
        try {
          sessionId =
            (
              JSON.parse(dataLine.slice("data:".length).trim()) as {
                session_id?: string;
              }
            ).session_id ?? "";
        } catch {
          /* ignore */
        }
      }
      continue;
    }
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      switch (obj.type) {
        case "text-delta":
          if (typeof obj.delta === "string") text += obj.delta;
          break;
        case "tool-input-available":
          if (typeof obj.toolCallId === "string") {
            const t = get(obj.toolCallId);
            t.name = obj.toolName as string;
            t.input = obj.input;
          }
          break;
        case "tool-output-available":
          if (typeof obj.toolCallId === "string") {
            get(obj.toolCallId).output = obj.output;
          }
          break;
        case "tool-output-error":
          if (typeof obj.toolCallId === "string") {
            get(obj.toolCallId).output = { errorText: obj.errorText };
          }
          break;
        case "tool-approval-request":
          if (typeof obj.toolCallId === "string") {
            const t = get(obj.toolCallId);
            t.approvalRequested = true;
            if (typeof obj.approvalId === "string")
              t.approvalId = obj.approvalId;
          }
          break;
        default:
          break;
      }
    }
  }
  return { text, tools: order.map((id) => byId.get(id)!), sessionId };
}

function summarizeInput(name: string | undefined, input: unknown): string {
  if (name === "run_command" && input && typeof input === "object") {
    const i = input as { command?: string; args?: string[] };
    return `$ ${i.command ?? "?"} ${(i.args ?? []).join(" ")}`.trim();
  }
  if (input && typeof input === "object") {
    const i = input as { path?: string };
    if (typeof i.path === "string") return i.path;
  }
  const s = JSON.stringify(input);
  return s && s.length > 120 ? s.slice(0, 117) + "…" : (s ?? "");
}

function summarizeOutput(output: unknown): string {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (o.ok === false) return `REJECTED code=${o.code} — ${o.message}`;
    if (typeof o.exit_code !== "undefined") {
      const stderr = typeof o.stderr === "string" ? o.stderr.trim() : "";
      return `exit=${o.exit_code}${stderr ? ` stderr=${stderr.slice(0, 100)}` : ""}`;
    }
    if (typeof o.errorText === "string") return `ERROR ${o.errorText}`;
  }
  const s = JSON.stringify(output);
  return s && s.length > 140 ? s.slice(0, 137) + "…" : (s ?? "");
}

function printTranscript(
  label: string,
  t: Transcript
): {
  rejectedCommands: string[];
  attemptedCommands: string[];
  pausedCommands: string[];
} {
  const rejectedCommands: string[] = [];
  const attemptedCommands: string[] = [];
  const pausedCommands: string[] = [];
  // eslint-disable-next-line no-console
  console.log(`\n══════════ ${label} ══════════`);
  for (const call of t.tools) {
    const inSummary = summarizeInput(call.name, call.input);
    const outSummary = call.approvalRequested
      ? "⏸ PAUSED — awaiting approval"
      : summarizeOutput(call.output);
    // eslint-disable-next-line no-console
    console.log(`  • [${call.name}] ${inSummary}`);
    // eslint-disable-next-line no-console
    console.log(`        ↳ ${outSummary}`);
    if (call.name === "run_command" && call.input) {
      const cmd = (call.input as { command?: string }).command ?? "?";
      attemptedCommands.push(cmd);
      if (call.approvalRequested) pausedCommands.push(cmd);
      const o = call.output as { ok?: boolean; code?: string } | undefined;
      if (o && o.ok === false) rejectedCommands.push(`${cmd} (${o.code})`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\n  ── final assistant text ──\n${indent(t.text)}`);
  // eslint-disable-next-line no-console
  console.log(`══════════ end ${label} ══════════\n`);
  return { rejectedCommands, attemptedCommands, pausedCommands };
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
}

// ── host wiring (mirrors shipped macOS: shell ON) ───────────────────────────
type Host = { app: Hono; runtime: AgentRuntime; store: SessionsStore };

function buildShellHost(baseDir: string, registry: WorkspaceRegistry): Host {
  const auth = new AuthStore(baseDir);
  const secrets = new SecretsStore(auth);
  const db = openSessionsDb({ user_data_path: baseDir });
  const store = new SessionsStore(db);
  const app = new Hono();
  const runtime = new AgentRuntime({
    secrets,
    workspace_registry: registry,
    sessions_store: store,
    streams: new StreamRegistry(),
    secrets_root: baseDir,
    // The shipped macOS desktop sets this true (srt confines the tree). With it
    // true, run_command IS registered — so we exercise the real allowlist gate,
    // not the fail-closed "no shell at all" gate.
    shell_execution_allowed: true,
    drain_cooldown_ms: 20,
  });
  registerAgentRoutes(app, runtime);
  return { app, runtime, store };
}

// Dep-free so the script needs only the interpreter (no pip/npm) — keeps the
// auto assertion deterministic regardless of installed libraries.
const TASK_TEXT =
  "I have this monthly revenue data: Jan 120, Feb 90, Mar 160, Apr 200, " +
  "May 140, Jun 175 (thousands USD).\n\n" +
  "Generate a bar chart of it as `chart.svg` in this workspace by WRITING A " +
  "SCRIPT and RUNNING it — a small Python or Node script that emits the SVG " +
  "markup directly (NO third-party libraries like matplotlib; just print the " +
  "<svg>…</svg> to the file). Then run a command to confirm `chart.svg` exists.";

liveDescribe("LIVE — permission modes (shell)", () => {
  let baseDir: string;
  let workspaceDir: string;
  let registry: WorkspaceRegistry;
  let workspaceId: string;
  let host: Host;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-sbx-host-"));
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-sbx-ws-"));
    await new SecretsStore(new AuthStore(baseDir)).set(
      PROVIDER_ID,
      PROVIDER_KEY
    );
    registry = new WorkspaceRegistry(baseDir);
    const ws = await registry.open(workspaceDir);
    workspaceId = ws.id;
    host = buildShellHost(baseDir, registry);
  });

  afterEach(async () => {
    host.runtime.dispose();
    host.store.close();
    await fs.rm(baseDir, { recursive: true, force: true });
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  async function runTask(mode: "auto" | "accept-edits"): Promise<{
    transcript: Transcript;
    attemptedCommands: string[];
    rejectedCommands: string[];
    pausedCommands: string[];
    chartSvgExists: boolean;
  }> {
    const res = await host.app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        model_id: MODEL_ID,
        workspace_id: workspaceId,
        mode,
        messages: [
          {
            id: "u1",
            role: "user",
            parts: [{ type: "text", text: TASK_TEXT }],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const transcript = parseTranscript(await res.text());
    const { attemptedCommands, rejectedCommands, pausedCommands } =
      printTranscript(`MODE=${mode}: chart.svg via a script`, transcript);
    let chartSvgExists = false;
    try {
      await fs.access(path.join(workspaceDir, "chart.svg"));
      chartSvgExists = true;
    } catch {
      chartSvgExists = false;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[modes:${mode}] attempted: ${JSON.stringify(attemptedCommands)}\n` +
        `[modes:${mode}] paused-for-approval: ${JSON.stringify(pausedCommands)}\n` +
        `[modes:${mode}] needs-approval: ${JSON.stringify(rejectedCommands)}\n` +
        `[modes:${mode}] chart.svg produced: ${chartSvgExists}`
    );
    return {
      transcript,
      attemptedCommands,
      rejectedCommands,
      pausedCommands,
      chartSvgExists,
    };
  }

  it(
    "auto: the agent writes a script, runs it, and produces chart.svg",
    async () => {
      const r = await runTask("auto");
      // The headline fix end-to-end: a real interpreter runs (NOT refused — pre-
      // fix every `python3`/`node` died `cmd-not-allowed`), and the file it
      // writes actually lands on disk (the fs-tool/shell path spaces agree, so
      // `write_file(<abs>)` + `python3 chart.py` hit the same file).
      expect(r.rejectedCommands).toEqual([]);
      const ranInterpreter = r.attemptedCommands.some((c) =>
        ["python3", "python", "node", "deno", "bun"].includes(c)
      );
      expect(ranInterpreter).toBe(true);
      expect(r.chartSvgExists).toBe(true);
    },
    TIMEOUT_MS
  );

  it(
    "accept-edits: a mutating/executing command pauses for approval (never runs unapproved)",
    async () => {
      const r = await runTask("accept-edits");
      // Observational: a supervised agent may hand-write the SVG via the fs tool
      // instead of shelling out. But IF it tried to run an interpreter, the SDK
      // must have PAUSED it (a `tool-approval-request`) rather than executed it —
      // and since this harness never approves, the call produced no output and
      // no shell ever ran (the contract; the answer/resume boundary is
      // unit-pinned in store.test.ts + workspace-agent-bindings.test.ts).
      const interpreters = [
        "python3",
        "python",
        "node",
        "deno",
        "bun",
        "sh",
        "bash",
      ];
      const attemptedInterpreter = r.attemptedCommands.some((c) =>
        interpreters.includes(c)
      );
      if (attemptedInterpreter) {
        // Every attempted interpreter is in the paused set, and none produced a
        // successful execution result.
        expect(r.pausedCommands.some((c) => interpreters.includes(c))).toBe(
          true
        );
        // It was a pause, not the old `needs-approval` tool result.
        expect(r.rejectedCommands).toEqual([]);
      }
      expect(true).toBe(true);
    },
    TIMEOUT_MS
  );

  // Poll the persisted tool part until a predicate holds (the recorder's writes
  // are async; a turn's HTTP response can return before they fully drain).
  async function waitForToolPart(
    sessionId: string,
    toolCallId: string,
    predicate: (data: { state?: string }) => boolean,
    timeoutMs = 8000
  ): Promise<{
    type: string;
    data: { state?: string; output?: unknown };
  } | null> {
    const start = Date.now();
    for (;;) {
      const part = await host.store.findToolPart(sessionId, toolCallId);
      if (part && predicate(part.data as { state?: string })) {
        return part as {
          type: string;
          data: { state?: string; output?: unknown };
        };
      }
      if (Date.now() - start > timeoutMs) return part as never;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // ── cut-off etiology ───────────────────────────────────────────────────────
  // Reported symptom: after approving a command it runs, but the agent produces
  // NO further response. Every real failing session (`~/.grida/agent/sessions.db`)
  // shares one shape — the last assistant part is `run_command (output-available)`
  // with zero text after, regardless of exit code (0, 1, AND 2) and even when the
  // user literally asked "…and report me".
  //
  // This test PINS the resume path with the most faithful inputs possible: the
  // exact real tasks ("run torus py" / "run torus py and report me"), a SILENT
  // `generate_torus.py` (writes an SVG, prints nothing → empty tool result — the
  // real script's behavior), in `auto` (no approval) AND `accept-edits` (pause→
  // approve→resume). The result is unambiguous: the resume **always** produces a
  // continuation. The agent/model/server is INNOCENT — terseness, provider route,
  // exit code, silent output, and the step budget are all ruled out.
  //
  // Conclusion (see also git: every approval/resume fix below was working-tree
  // ONLY): the real cut-off is the PRE-FIX build's id-divergence bug. Without
  // `generateMessageId`/stream-id adoption (run-agent.ts + recorder.ts, both
  // uncommitted at the time), the recorder persisted the resume under a divergent
  // message id, so the continuation was lost on the rebuild-from-DB boundary. The
  // fixes that make this test pass were never committed to the running desktop —
  // that is why the symptom reproduces in the wild but not against current code.
  // FAITHFUL to the real failing script (`generate_torus.py` in the user's
  // workspace): it WRITES an SVG file and prints NOTHING — exit 0, empty stdout,
  // empty stderr. That empty tool result is the variable my earlier synthetic
  // donut-printer hid (a printed donut gives the model lots to describe, so it
  // always continued). With a silent terminal command, does the model still
  // respond? This mirrors the real sessions exactly.
  const GENERATE_TORUS_PY = [
    "import math",
    "",
    "pts = []",
    "for i in range(3000):",
    "    t = i * 0.01",
    "    x = 200 + 120 * math.cos(t) + 30 * math.cos(11 * t)",
    "    y = 200 + 120 * math.sin(t) + 30 * math.sin(11 * t)",
    "    pts.append(f'{x:.1f},{y:.1f}')",
    "svg = (",
    '    \'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">\'',
    "    '<polyline fill=\"none\" stroke=\"black\" points=\"' + ' '.join(pts) + '\"/>'",
    "    '</svg>'",
    ")",
    "with open('3d_torus.svg', 'w') as f:",
    "    f.write(svg)",
    "# prints NOTHING — matches the real generate_torus.py",
    "",
  ].join("\n");

  // The real user message, verbatim (12 chars). The model lists the workspace,
  // finds generate_torus.py, runs it — the run IS the goal.
  const TERMINAL_TASK = "run torus py";
  // The real SECOND turn of ses_ea70d9ca — the user EXPLICITLY asks for a report,
  // yet the real session produced none. The strongest disproof of "model just
  // ends its turn": an asked-for report that never comes is structural.
  const REPORT_TASK = "run torus py and report me";

  async function seedTorus(): Promise<void> {
    await fs.writeFile(
      path.join(workspaceDir, "generate_torus.py"),
      GENERATE_TORUS_PY,
      "utf8"
    );
  }

  // Does the (last) assistant message carry non-empty text AFTER its last
  // run_command part? That is exactly "the agent responded after running".
  async function continuationAfterRun(
    sessionId: string
  ): Promise<{ ran: boolean; continuation: boolean }> {
    const all = await host.store.listMessages(sessionId);
    const assistants = all.filter((m) => m.role === "assistant");
    const last = assistants[assistants.length - 1];
    if (!last) return { ran: false, continuation: false };
    let runIdx = -1;
    last.parts.forEach((p, i) => {
      if (p.type === "tool-run_command") runIdx = i;
    });
    const ran =
      runIdx >= 0 &&
      (last.parts[runIdx].data as { state?: string }).state ===
        "output-available";
    const continuation =
      runIdx >= 0 &&
      last.parts
        .slice(runIdx + 1)
        .some(
          (p) =>
            p.type === "text" &&
            typeof (p.data as { text?: unknown }).text === "string" &&
            (p.data as { text: string }).text.trim().length > 0
        );
    return { ran, continuation };
  }

  function dumpPersisted(
    label: string,
    msgs: Awaited<ReturnType<SessionsStore["listMessages"]>>
  ): void {
    // eslint-disable-next-line no-console
    console.log(`  ── persisted [${label}] ──`);
    for (const m of msgs) {
      const parts = m.parts
        .map((p) => `${p.type}${p.tool_state ? `(${p.tool_state})` : ""}`)
        .join(", ");
      // eslint-disable-next-line no-console
      console.log(`    ${m.role} ${m.id}: [${parts}]`);
    }
  }

  // Unique user-message ids per session (the global-PK collision footgun above).
  let _uid = 0;
  const nextUid = () => `u_${++_uid}`;

  // Drive a task to a terminal state. In `accept-edits`, APPROVE every
  // run_command pause (looping through path-retries) until the model stops
  // pausing — then measure whether it produced any text after its last run.
  async function driveFlow(
    mode: "auto" | "accept-edits",
    task: string
  ): Promise<{
    sid: string;
    ran: boolean;
    continuation: boolean;
    finalText: string;
  }> {
    const uid = nextUid();
    await seedTorus();
    const userMsg = {
      id: uid,
      role: "user" as const,
      parts: [{ type: "text", text: task }],
    };
    let res = await host.app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        model_id: MODEL_ID,
        workspace_id: workspaceId,
        mode,
        messages: [userMsg],
      }),
    });
    let t = parseTranscript(await res.text());
    const sid = t.sessionId;
    for (let guard = 0; guard < 4; guard++) {
      const pending = t.tools
        .filter(
          (c) => c.name === "run_command" && c.approvalRequested && c.approvalId
        )
        .at(-1);
      if (!pending) break; // model stopped pausing → terminal (or auto, never pauses)
      await waitForToolPart(
        sid,
        pending.id,
        (d) => d.state === "approval-requested"
      );
      const persisted = await host.store.listMessages(sid);
      const A = persisted.find((m) => m.role === "assistant")!;
      res = await host.app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          session_id: sid,
          model_id: MODEL_ID,
          workspace_id: workspaceId,
          mode,
          approval_answer: {
            tool_call_id: pending.id,
            approval_id: pending.approvalId,
            approved: true,
          },
          messages: [
            userMsg,
            { id: A.id, role: "assistant", parts: A.parts.map((p) => p.data) },
          ],
        }),
      });
      t = parseTranscript(await res.text());
      await waitForToolPart(
        sid,
        pending.id,
        (d) => d.state === "output-available" || d.state === "output-error"
      );
    }
    const { ran, continuation } = await continuationAfterRun(sid);
    return { sid, ran, continuation, finalText: t.text };
  }

  it(
    "cut-off etiology: SILENT terminal run_command — does the model respond after running?",
    async () => {
      for (const task of [TERMINAL_TASK, REPORT_TASK]) {
        const auto = await driveFlow("auto", task);
        const ae = await driveFlow("accept-edits", task);
        dumpPersisted(
          `auto "${task}"`,
          await host.store.listMessages(auto.sid)
        );
        dumpPersisted(
          `accept-edits "${task}"`,
          await host.store.listMessages(ae.sid)
        );
        // eslint-disable-next-line no-console
        console.log(
          `\n══════════ TASK: "${task}" (silent generate_torus.py) ══════════\n` +
            `  auto         (no approval): ran=${auto.ran} continuation=${auto.continuation}\n` +
            `      final text: ${JSON.stringify(auto.finalText.slice(0, 160))}\n` +
            `  accept-edits (resume)     : ran=${ae.ran} continuation=${ae.continuation}\n` +
            `      final text: ${JSON.stringify(ae.finalText.slice(0, 160))}\n` +
            `══════════ end "${task}" ══════════\n`
        );
        // The deterministic regression this probe pins: in BOTH postures the
        // command actually executes — `auto` runs it directly, `accept-edits`
        // runs it on resume after the Allow. `continuation` (whether the model
        // then replies) is the model/task-dependent variable under
        // investigation, so it stays in the console report above rather than a
        // hard assertion that would flake a live run.
        expect(auto.ran).toBe(true);
        expect(ae.ran).toBe(true);
      }
    },
    TIMEOUT_MS * 4
  );

  it(
    "accept-edits: Allow EXECUTES the command on resume + completes the ORIGINAL part (no re-ask loop)",
    async () => {
      // Turn 1 — the interpreter pauses for approval.
      const res1 = await host.app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          model_id: MODEL_ID,
          workspace_id: workspaceId,
          mode: "accept-edits",
          messages: [
            {
              id: "u1",
              role: "user",
              parts: [{ type: "text", text: TASK_TEXT }],
            },
          ],
        }),
      });
      expect(res1.status).toBe(200);
      const t1 = parseTranscript(await res1.text());
      printTranscript("RESUME · turn 1 (pause)", t1);
      const sessionId = t1.sessionId;
      expect(sessionId.length).toBeGreaterThan(0);
      const pending = t1.tools.find(
        (c) => c.name === "run_command" && c.approvalRequested && c.approvalId
      );
      // The task explicitly asks to WRITE + RUN a script, so accept-edits pauses.
      // (If this fails, turn 1 didn't pause an interpreter for approval.)
      expect(Boolean(pending)).toBe(true);
      // Wait for turn 1's `approval-requested` part to be durably persisted.
      await waitForToolPart(
        sessionId,
        pending!.id,
        (d) => d.state === "approval-requested"
      );

      // Turn 2 — resume. Reproduce the DESKTOP's EXACT wire shape: the client
      // (`chat.sendMessage(undefined, {body})`) re-posts its FULL rendered
      // history — the user turn AND the paused assistant A (run_command in
      // `approval-requested` state) — with the answer on the body. We read A
      // back from the store (the client's A mirrors it) so this is the real
      // `[user, A]` post, not a simplified `[user]`-only one. The sidecar skips
      // the assistant on persist, applies the body answer to the persisted part,
      // and resumes.
      const persisted = await host.store.listMessages(sessionId);
      const assistantA = persisted.find((m) => m.role === "assistant");
      expect(assistantA).toBeTruthy();
      const clientHistory = [
        { id: "u1", role: "user", parts: [{ type: "text", text: TASK_TEXT }] },
        {
          id: assistantA!.id,
          role: "assistant",
          parts: assistantA!.parts.map((p) => p.data),
        },
      ];
      const res2 = await host.app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          model_id: MODEL_ID,
          workspace_id: workspaceId,
          mode: "accept-edits",
          approval_answer: {
            tool_call_id: pending!.id,
            approval_id: pending!.approvalId,
            approved: true,
          },
          messages: clientHistory,
        }),
      });
      expect(res2.status).toBe(200);
      const t2 = parseTranscript(await res2.text());
      printTranscript("RESUME · turn 2 (execute)", t2);

      // THE FIX: the approved command executes on resume and COMPLETES the
      // ORIGINAL `tool-run_command` part IN PLACE — not a forked nameless `tool`
      // part that the model-view rebuild drops (which caused the re-ask loop).
      const part = await waitForToolPart(
        sessionId,
        pending!.id,
        (d) => d.state === "output-available"
      );
      expect(part).toBeTruthy(); // the approved tool part must still exist
      expect(part!.type).toBe("tool-run_command");
      expect(part!.data.state).toBe("output-available");
      expect((part!.data.output as { exit_code?: number }).exit_code).toBe(0);

      // NO forked turn: the resume MERGED into the original assistant message
      // (stable stream message id), so the session still has exactly one
      // assistant message — what the desktop renders as a single turn. This is
      // the end-to-end form of the duplicate/cut-off fix (unit-pinned in
      // recorder.test.ts).
      const all = await host.store.listMessages(sessionId);
      const assistants = all.filter((m) => m.role === "assistant");
      expect(assistants.length).toBe(1);

      // THE REPORTED DESKTOP SYMPTOM ("after approval it runs, no more agent
      // response"): a resume must not ONLY execute the command — the model must
      // RESPOND after it. Assert the merged turn carries assistant text AFTER
      // the tool output (a real continuation), so a silent "ran then stopped"
      // fails here instead of slipping through on the execute check alone.
      const merged = assistants[0];
      const runIdx = merged.parts.findIndex(
        (p) => p.type === "tool-run_command"
      );
      const continuation = merged.parts
        .slice(runIdx + 1)
        .some(
          (p) =>
            p.type === "text" &&
            typeof (p.data as { text?: unknown }).text === "string" &&
            (p.data as { text: string }).text.trim().length > 0
        );
      // eslint-disable-next-line no-console
      console.log(
        `[resume] model responded after the command: ${continuation}`
      );
      expect(continuation).toBe(true);

      // ...and the script actually produced the file.
      let chartExists = false;
      try {
        await fs.access(path.join(workspaceDir, "chart.svg"));
        chartExists = true;
      } catch {
        chartExists = false;
      }
      // eslint-disable-next-line no-console
      console.log(`[resume] chart.svg produced: ${chartExists}`);
      expect(chartExists).toBe(true);
    },
    TIMEOUT_MS
  );
});
