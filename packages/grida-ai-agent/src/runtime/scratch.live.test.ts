/**
 * LIVE end-to-end — session scratch (WG `docs/wg/ai/agent/scratch.md`). Real
 * provider, real model, real shell, real scratch dir. Proves the SYSTEM works
 * (the agent can reach + write the per-session scratch area through the shell)
 * AND that the model, told only the scratch capability, USES it as intended:
 * extract an archive into scratch (not the project), inspect it, then PROMOTE
 * the wanted file out into the workspace.
 *
 * Mirrors the shipped macOS desktop: `shell_execution_allowed` is TRUE, mode is
 * `auto` (commands run without a supervised pause), and `scratch_base` is wired
 * (the runtime derives + creates the per-session dir and tells the agent).
 *
 * Gated + excluded from CI. Run with a real BYOK key (source the gitignored env
 * file so process.env carries the key — vitest does NOT auto-load it):
 *
 *   set -a; . ./.env.test.local; set +a
 *   pnpm exec vitest run src/runtime/scratch.live.test.ts
 */
/* eslint-disable jest/no-conditional-expect */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
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
import { defaultScratchBase, scratchRootFor } from "../session/scratch";

const execFileAsync = promisify(execFile);

const LIVE = process.env.GRIDA_LIVE_AGENT === "1";
const PROVIDER_KEY =
  process.env.OPENROUTER_API_KEY ?? process.env.GRIDA_BYOK_KEY ?? "";
const PROVIDER_ID = (process.env.GRIDA_BYOK_PROVIDER ?? "openrouter") as
  | "openrouter"
  | "vercel";
const MODEL_ID = process.env.GRIDA_LIVE_MODEL ?? "anthropic/claude-sonnet-4.6";
const TIMEOUT_MS = 240_000;

const liveDescribe = LIVE && PROVIDER_KEY ? describe : describe.skip;

const ENTRY_NAME = "inside.txt";
const ENTRY_CONTENT = "hello from inside the archive — keep me!";

// ── SSE → transcript (run_command focus) ─────────────────────────────────────
type ToolCall = {
  id: string;
  name?: string;
  input?: unknown;
  output?: unknown;
};
type Transcript = { text: string; tools: ToolCall[]; sessionId: string };

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
            (JSON.parse(dataLine.slice(5).trim()) as { session_id?: string })
              .session_id ?? "";
        } catch {
          /* ignore */
        }
      }
      continue;
    }
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (obj.type === "text-delta" && typeof obj.delta === "string") {
        text += obj.delta;
      } else if (
        obj.type === "tool-input-available" &&
        typeof obj.toolCallId === "string"
      ) {
        const t = get(obj.toolCallId);
        t.name = obj.toolName as string;
        t.input = obj.input;
      } else if (
        obj.type === "tool-output-available" &&
        typeof obj.toolCallId === "string"
      ) {
        get(obj.toolCallId).output = obj.output;
      }
    }
  }
  return { text, tools: order.map((id) => byId.get(id)!), sessionId };
}

function buildHost(
  baseDir: string,
  registry: WorkspaceRegistry,
  scratchBase: string
): { app: Hono; runtime: AgentRuntime; store: SessionsStore } {
  const secrets = new SecretsStore(new AuthStore(baseDir));
  const store = new SessionsStore(openSessionsDb({ user_data_path: baseDir }));
  const app = new Hono();
  const runtime = new AgentRuntime({
    secrets,
    workspace_registry: registry,
    sessions_store: store,
    streams: new StreamRegistry(),
    secrets_root: baseDir,
    scratch_base: scratchBase,
    shell_execution_allowed: true,
    drain_cooldown_ms: 20,
  });
  registerAgentRoutes(app, runtime);
  return { app, runtime, store };
}

const TASK_TEXT =
  `There is an \`archive.zip\` in this workspace; it contains a single text file.\n\n` +
  `1. Extract it into your SCRATCH directory — do NOT extract into the project workspace.\n` +
  `2. Tell me the name and the exact contents of the file inside.\n` +
  `3. Then copy that extracted file from scratch into the project workspace root, so I can keep it.`;

liveDescribe("LIVE — session scratch (zip extraction + promotion)", () => {
  let baseDir: string;
  let workspaceDir: string;
  let scratchBase: string;
  let registry: WorkspaceRegistry;
  let workspaceId: string;
  let host: ReturnType<typeof buildHost>;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-scratch-host-"));
    workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-scratch-ws-")
    );
    scratchBase = defaultScratchBase(baseDir);
    await new SecretsStore(new AuthStore(baseDir)).set(
      PROVIDER_ID,
      PROVIDER_KEY
    );
    registry = new WorkspaceRegistry(baseDir);
    workspaceId = (await registry.open(workspaceDir)).id;

    // Build the fixture `archive.zip` (entry = ENTRY_NAME) with the system `zip`,
    // leaving ONLY the zip in the workspace.
    const srcDir = path.join(workspaceDir, "_src");
    await fs.mkdir(srcDir);
    await fs.writeFile(path.join(srcDir, ENTRY_NAME), ENTRY_CONTENT);
    await execFileAsync("zip", [
      "-j",
      path.join(workspaceDir, "archive.zip"),
      path.join(srcDir, ENTRY_NAME),
    ]);
    await fs.rm(srcDir, { recursive: true, force: true });

    host = buildHost(baseDir, registry, scratchBase);
  });

  afterEach(async () => {
    host.runtime.dispose();
    host.store.close();
    await fs.rm(baseDir, { recursive: true, force: true });
    await fs.rm(workspaceDir, { recursive: true, force: true });
    await fs.rm(scratchBase, { recursive: true, force: true });
  });

  it(
    "the agent extracts into scratch, inspects it, and promotes the file into the workspace",
    async () => {
      const res = await host.app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          model_id: MODEL_ID,
          workspace_id: workspaceId,
          mode: "auto",
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
      const t = parseTranscript(await res.text());
      expect(t.sessionId).not.toBe("");

      const scratchRoot = scratchRootFor(scratchBase, t.sessionId);
      const commands = t.tools
        .filter((x) => x.name === "run_command")
        .map((x) => x.input as { command?: string; args?: string[] });

      // ── Observability: print exactly what the agent did. ──
      // eslint-disable-next-line no-console
      console.log("\n══════════ scratch live run ══════════");
      // eslint-disable-next-line no-console
      console.log(`session: ${t.sessionId}`);
      // eslint-disable-next-line no-console
      console.log(`scratch: ${scratchRoot}`);
      for (const c of commands) {
        // eslint-disable-next-line no-console
        console.log(`  $ ${c.command} ${(c.args ?? []).join(" ")}`);
      }
      // eslint-disable-next-line no-console
      console.log(
        `\n  ── assistant ──\n${t.text}\n══════════ end ══════════\n`
      );

      // No command was rejected by the shell gate (scratch cwd/args allowed).
      const rejected = t.tools
        .filter((x) => x.name === "run_command")
        .filter(
          (x) => (x.output as { ok?: boolean } | undefined)?.ok === false
        );
      expect(rejected).toEqual([]);

      // The agent reached scratch on purpose: at least one command names the
      // real scratch path (in a workdir or an arg).
      const referencedScratch = t.tools.some(
        (x) =>
          x.name === "run_command" &&
          JSON.stringify(x.input).includes(scratchRoot)
      );
      expect(referencedScratch).toBe(true);

      // SYSTEM: the extracted file actually landed in scratch.
      const scratchListing = await fs.readdir(scratchRoot, { recursive: true });
      expect(scratchListing).toContain(ENTRY_NAME);

      // INTENDED USE: the agent promoted the file into the workspace, and its
      // contents survived the round-trip.
      const promoted = path.join(workspaceDir, ENTRY_NAME);
      expect(await fs.readFile(promoted, "utf8")).toBe(ENTRY_CONTENT);

      // It read/echoed the contents back to the user (inspected scratch).
      expect(t.text.toLowerCase()).toContain("inside the archive");
    },
    TIMEOUT_MS
  );
});
