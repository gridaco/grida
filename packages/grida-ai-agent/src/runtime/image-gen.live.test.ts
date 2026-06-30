/**
 * LIVE end-to-end — `generate_image` (WG `scratch.md` S3: produced media sinks
 * to scratch). Real driving model, real image provider, real shell, real
 * scratch dir. Proves the SYSTEM works (the agent can generate an image, the
 * bytes land in the per-session scratch dir) AND that the model — told only the
 * capability — USES it as intended: generate into scratch, then PROMOTE the
 * file into the workspace to keep it. generate_image is GENERATE-ONLY: the tool
 * result is the saved path + metadata, never the image bytes (a tool result
 * can't deliver pixels on the openai-compatible wire format — see AgentGen).
 *
 * Mirrors the shipped macOS desktop: `image_gen_enabled` + `shell_execution_
 * allowed` TRUE, mode `auto`, `scratch_base` wired. The same BYOK key drives the
 * text loop AND image generation (OpenRouter serves both /chat and /v1/images).
 *
 * Gated + excluded from CI. Run with a real BYOK key (source the gitignored env
 * file so process.env carries the key — vitest does NOT auto-load it):
 *
 *   set -a; . ./.env.test.local; set +a
 *   pnpm exec vitest run src/runtime/image-gen.live.test.ts
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
import { defaultScratchBase, scratchRootFor } from "../session/scratch";

const LIVE = process.env.GRIDA_LIVE_AGENT === "1";
const PROVIDER_KEY =
  process.env.OPENROUTER_API_KEY ?? process.env.GRIDA_BYOK_KEY ?? "";
const PROVIDER_ID = (process.env.GRIDA_BYOK_PROVIDER ?? "openrouter") as
  | "openrouter"
  | "vercel"
  | "fal";
const MODEL_ID = process.env.GRIDA_LIVE_MODEL ?? "anthropic/claude-sonnet-4.6";
// The image model is HOST config (the user's selection), not an agent arg — the
// tool is prompt-only. Inject a fast, reliable one for the test (seedream) via
// the runtime's `image_model_id`, overridable per provider.
const IMAGE_MODEL_ID =
  process.env.GRIDA_LIVE_IMAGE_MODEL ?? "bytedance/seedream-4.5";
const TIMEOUT_MS = 240_000;

const liveDescribe = LIVE && PROVIDER_KEY ? describe : describe.skip;

// ── SSE → transcript (text + tool calls/outputs) ─────────────────────────────
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
    image_gen_enabled: true,
    image_model_id: IMAGE_MODEL_ID,
    drain_cooldown_ms: 20,
  });
  registerAgentRoutes(app, runtime);
  return { app, runtime, store };
}

const TASK_TEXT =
  `Generate an image of a single solid red circle on a white background.\n\n` +
  `1. The generated image goes into your SCRATCH directory automatically.\n` +
  `2. Then copy that image from scratch into the project workspace root so I can keep it.`;

liveDescribe("LIVE — generate_image (produce into scratch + promotion)", () => {
  let baseDir: string;
  let workspaceDir: string;
  let scratchBase: string;
  let registry: WorkspaceRegistry;
  let workspaceId: string;
  let host: ReturnType<typeof buildHost>;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-imggen-host-"));
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-imggen-ws-"));
    scratchBase = defaultScratchBase(baseDir);
    await new SecretsStore(new AuthStore(baseDir)).set(
      PROVIDER_ID,
      PROVIDER_KEY
    );
    registry = new WorkspaceRegistry(baseDir);
    workspaceId = (await registry.open(workspaceDir)).id;
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
    "the agent generates an image into scratch and promotes it into the workspace",
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
      const genCalls = t.tools.filter((x) => x.name === "generate_image");
      const commands = t.tools
        .filter((x) => x.name === "run_command")
        .map((x) => x.input as { command?: string; args?: string[] });

      // ── Observability: print exactly what the agent did. ──
      // eslint-disable-next-line no-console
      console.log("\n══════════ image-gen live run ══════════");
      // eslint-disable-next-line no-console
      console.log(`session: ${t.sessionId}`);
      // eslint-disable-next-line no-console
      console.log(`scratch: ${scratchRoot}`);
      for (const g of genCalls) {
        const out = g.output as { ok?: boolean; path?: string } | undefined;
        // eslint-disable-next-line no-console
        console.log(
          `  generate_image(${JSON.stringify(g.input)}) → ok=${out?.ok} path=${out?.path}`
        );
      }
      for (const c of commands) {
        // eslint-disable-next-line no-console
        console.log(`  $ ${c.command} ${(c.args ?? []).join(" ")}`);
      }
      // eslint-disable-next-line no-console
      console.log(
        `\n  ── assistant ──\n${t.text}\n══════════ end ══════════\n`
      );

      // The agent actually generated an image, and it succeeded.
      expect(genCalls.length).toBeGreaterThan(0);
      const genOut = genCalls[0].output as {
        ok?: boolean;
        path?: string;
        mime?: string;
        data?: string;
      };
      expect(genOut?.ok).toBe(true);

      // SYSTEM: produced bytes landed in THIS session's scratch dir.
      expect(typeof genOut.path).toBe("string");
      expect(genOut.path!.startsWith(scratchRoot)).toBe(true);
      const producedBytes = await fs.readFile(genOut.path!);
      expect(producedBytes.byteLength).toBeGreaterThan(0);

      // The output carries base64 `data` for the CLIENT to render the produced
      // image — but it is NOT lowered to the model (toModelOutput is text-only;
      // pinned in gen/index.test.ts). The model stays generate-only.
      expect(typeof genOut.data).toBe("string");
      expect(genOut.data!.length).toBeGreaterThan(0);

      // No command was rejected by the shell gate (scratch cwd/args allowed).
      const rejected = t.tools
        .filter((x) => x.name === "run_command")
        .filter(
          (x) => (x.output as { ok?: boolean } | undefined)?.ok === false
        );
      expect(rejected).toEqual([]);

      // INTENDED USE: the agent promoted the produced image into the workspace.
      // Find a workspace file with the same bytes (filename is the agent's call).
      const wsEntries = await fs.readdir(workspaceDir, { recursive: true });
      let promoted = false;
      for (const rel of wsEntries) {
        const abs = path.join(workspaceDir, rel as string);
        const stat = await fs.stat(abs).catch(() => null);
        if (!stat?.isFile()) continue;
        const bytes = await fs.readFile(abs);
        if (bytes.equals(producedBytes)) {
          promoted = true;
          break;
        }
      }
      expect(promoted).toBe(true);
    },
    TIMEOUT_MS
  );
});
