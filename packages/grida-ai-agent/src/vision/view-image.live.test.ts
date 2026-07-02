/**
 * LIVE end-to-end — `view_image` perception through a real openai-compatible
 * provider (gridaco/grida#923). This is the regression guard the bug slipped:
 * the unit tests only verified the media-block SHAPE, never that a real model
 * PERCEIVES the image through a real provider. On the openai-compatible wire a
 * tool-result media block is stringified to base64 text the model can't decode,
 * so it guesses. The fix hoists the image into a user-message image part (see
 * `agent/hoist-tool-result-images.ts`, docs/wg/ai/agent/ai-sdk/vision-lowering.md).
 *
 * GUESS-PROOF: a 2×2 quadrant PNG with a NON-obvious palette (purple / orange /
 * teal / pink). A model that doesn't actually see pixels falls back to the
 * canonical red/green/blue/yellow and scores 0/4; a model that sees it names all
 * four. (The same controlled test was 0/4 before the fix, 4/4 after.)
 *
 * Even an Anthropic model served via OpenRouter rides the openai-compatible
 * chat-completions wire — so this reproduces the broken path regardless of the
 * underlying model.
 *
 * Gated + excluded from CI. Run with a real BYOK key:
 *
 *   set -a; . ./.env.test.local; set +a
 *   GRIDA_LIVE_AGENT=1 pnpm exec vitest run src/vision/view-image.live.test.ts
 */
/* eslint-disable jest/no-conditional-expect, no-console */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
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
import { assistantTextFromSse } from "../testing/sse";

const LIVE = process.env.GRIDA_LIVE_AGENT === "1";
const PROVIDER_KEY =
  process.env.OPENROUTER_API_KEY ?? process.env.GRIDA_BYOK_KEY ?? "";
const PROVIDER_ID = (process.env.GRIDA_BYOK_PROVIDER ?? "openrouter") as
  | "openrouter"
  | "vercel"
  | "fal";
const MODEL_ID = process.env.GRIDA_LIVE_MODEL ?? "anthropic/claude-sonnet-4.6";
const TIMEOUT_MS = 240_000;
const liveDescribe = LIVE && PROVIDER_KEY ? describe : describe.skip;

// ── A real, perceivable 2×2 quadrant PNG (truecolor, single 0-filter scanlines).
const QUADS = {
  "top-left": {
    name: "purple",
    rgb: [128, 0, 128],
    accept: /purple|violet|magenta/,
  },
  "top-right": { name: "orange", rgb: [255, 165, 0], accept: /orange/ },
  "bottom-left": {
    name: "teal",
    rgb: [0, 128, 128],
    accept: /teal|cyan|turquoise/,
  },
  "bottom-right": {
    name: "pink",
    rgb: [255, 192, 203],
    accept: /pink|rose|salmon/,
  },
} as const;

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([len, typed, crc]);
}

function makeQuadPng(size = 256): Buffer {
  const half = size / 2;
  const raw = Buffer.alloc(size * (1 + size * 3));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const key =
        y < half
          ? x < half
            ? "top-left"
            : "top-right"
          : x < half
            ? "bottom-left"
            : "bottom-right";
      const [r, g, b] = QUADS[key].rgb;
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TASK_TEXT =
  `The file quad.png is a 2×2 grid of four solid-color quadrants. ` +
  `Call view_image on it, then tell me the color in each quadrant. ` +
  `Answer with four lines exactly: ` +
  `"top-left: <color>", "top-right: <color>", "bottom-left: <color>", "bottom-right: <color>".`;

liveDescribe("LIVE — view_image perception (guess-proof quad, #923)", () => {
  let baseDir: string;
  let workspaceDir: string;
  let registry: WorkspaceRegistry;
  let workspaceId: string;
  let runtime: AgentRuntime;
  let store: SessionsStore;
  let app: Hono;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-view-host-"));
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-view-ws-"));
    await fs.writeFile(path.join(workspaceDir, "quad.png"), makeQuadPng());
    await new SecretsStore(new AuthStore(baseDir)).set(
      PROVIDER_ID,
      PROVIDER_KEY
    );
    registry = new WorkspaceRegistry(baseDir);
    workspaceId = (await registry.open(workspaceDir)).id;
    store = new SessionsStore(openSessionsDb({ user_data_path: baseDir }));
    runtime = new AgentRuntime({
      secrets: new SecretsStore(new AuthStore(baseDir)),
      workspace_registry: registry,
      sessions_store: store,
      streams: new StreamRegistry(),
      secrets_root: baseDir,
      drain_cooldown_ms: 20,
    });
    app = new Hono();
    registerAgentRoutes(app, runtime);
  });

  afterEach(async () => {
    runtime.dispose();
    store.close();
    await fs.rm(baseDir, { recursive: true, force: true });
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it(
    "the model names all four non-obvious quadrant colors (4/4)",
    async () => {
      const res = await app.request("/agent/run", {
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
      const text = assistantTextFromSse(await res.text()).toLowerCase();

      console.log("\n══════════ view_image live run ══════════");
      console.log(text);
      console.log("══════════ end ══════════\n");

      // Score each quadrant against its accepted color names. The non-obvious
      // palette makes a guess (canonical red/green/blue/yellow) score 0/4.
      const scored = Object.entries(QUADS).map(([quad, { name, accept }]) => ({
        quad,
        name,
        ok: accept.test(text),
      }));
      const hits = scored.filter((s) => s.ok).length;
      console.log(
        "score:",
        scored.map((s) => `${s.quad}=${s.name}:${s.ok ? "✓" : "✗"}`).join(" ")
      );
      expect(hits).toBe(4);
    },
    TIMEOUT_MS
  );
});
