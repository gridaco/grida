/**
 * LIVE end-to-end — real provider, real model. The durability bar for inline
 * image input: prove the agent actually SEES a pasted/dropped image, that the
 * image survives into later turns (DB rebuild), and that it survives a process
 * restart (resume).
 *
 * Gated + excluded from CI. Run explicitly with a real BYOK key:
 *
 *   GRIDA_LIVE_AGENT=1 OPENROUTER_API_KEY=sk-... \
 *     pnpm --filter @grida/agent vitest run src/runtime/runtime.live.test.ts
 *
 * Env knobs:
 *   GRIDA_LIVE_AGENT=1        — required, opts in.
 *   OPENROUTER_API_KEY / GRIDA_BYOK_KEY — the BYOK key.
 *   GRIDA_BYOK_PROVIDER       — "openrouter" (default) | "vercel".
 *   GRIDA_LIVE_MODEL          — a multimodal catalog model id (default below).
 *
 * Perception probe: a solid RED square (generated in-process, no fixture
 * binary) + "name the dominant color". A model cannot answer "red" without
 * seeing the pixels, so a correct answer is real multimodal delivery — and the
 * multi-turn / resume variants prove the image came from the DB, not the
 * request payload.
 */

import fs from "node:fs/promises";
import { assistantTextFromSse, sessionIdFromSse } from "../testing/sse";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { AuthStore } from "../auth/file";
import { SecretsStore } from "../secrets";
import { WorkspaceRegistry } from "../workspaces";
import { openSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import { AGENT_SESSION_AGENT } from "../protocol/run";
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
const TIMEOUT_MS = 90_000;

const liveDescribe = LIVE && PROVIDER_KEY ? describe : describe.skip;

// --- minimal solid-color PNG encoder (no deps; in-process fixture) ---------
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

function solidPngDataUrl(rgb: [number, number, number], size = 64): string {
  const [r, g, b] = rgb;
  const rowLen = size * 3;
  const raw = Buffer.alloc((rowLen + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (rowLen + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const p = rowStart + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

type Host = {
  app: Hono;
  runtime: AgentRuntime;
  store: SessionsStore;
};

function buildHost(baseDir: string): Host {
  const auth = new AuthStore(baseDir);
  const secrets = new SecretsStore(auth);
  const db = openSessionsDb({ user_data_path: baseDir });
  const store = new SessionsStore(db);
  const app = new Hono();
  const runtime = new AgentRuntime({
    secrets,
    workspace_registry: new WorkspaceRegistry(baseDir),
    sessions_store: store,
    streams: new StreamRegistry(),
    drain_cooldown_ms: 20,
  });
  registerAgentRoutes(app, runtime);
  return { app, runtime, store };
}

async function setKey(baseDir: string): Promise<void> {
  const secrets = new SecretsStore(new AuthStore(baseDir));
  await secrets.set(PROVIDER_ID, PROVIDER_KEY);
}

const RED: [number, number, number] = [220, 30, 30];

liveDescribe("LIVE — inline image perception + durability", () => {
  let baseDir: string;
  let host: Host;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-live-"));
    await setKey(baseDir);
    host = buildHost(baseDir);
  });

  afterEach(async () => {
    host.runtime.dispose();
    host.store.close();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it(
    "(a) single-turn perception: the model reads the actual image",
    async () => {
      const res = await host.app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          model_id: MODEL_ID,
          messages: [
            {
              id: "u1",
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "Reply with ONLY the single dominant color word of the attached image.",
                },
                {
                  type: "file",
                  mediaType: "image/png",
                  url: solidPngDataUrl(RED),
                  // Neutral filename: "red.png" would leak the answer (model
                  // could say "red" from the name, not the pixels).
                  filename: "attachment.png",
                },
              ],
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const text = assistantTextFromSse(await res.text()).toLowerCase();
      expect(text).toContain("red");
    },
    TIMEOUT_MS
  );

  it(
    "(b) multi-turn durability: a later text-only turn still sees the image",
    async () => {
      const t1 = await host.app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          model_id: MODEL_ID,
          messages: [
            {
              id: "u1",
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "Look at this image. I'll ask about it.",
                },
                {
                  type: "file",
                  mediaType: "image/png",
                  url: solidPngDataUrl(RED),
                  // Neutral filename: "red.png" would leak the answer (model
                  // could say "red" from the name, not the pixels).
                  filename: "attachment.png",
                },
              ],
            },
          ],
        }),
      });
      expect(t1.status).toBe(200);
      const sessionId = sessionIdFromSse(await t1.text());
      expect(sessionId).toBeTruthy();

      // Turn 2 — NO image in the payload; it must come from the DB.
      const t2 = await host.app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          model_id: MODEL_ID,
          session_id: sessionId,
          messages: [
            {
              id: "u2",
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "In one word, what was the dominant color of the image I sent earlier?",
                },
              ],
            },
          ],
        }),
      });
      expect(t2.status).toBe(200);
      const text = assistantTextFromSse(await t2.text()).toLowerCase();
      expect(text).toContain("red");
    },
    TIMEOUT_MS
  );

  it(
    "(c) resume durability: the image survives a process restart",
    async () => {
      const t1 = await host.app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          model_id: MODEL_ID,
          messages: [
            {
              id: "u1",
              role: "user",
              parts: [
                { type: "text", text: "Look at this image. I'll ask later." },
                {
                  type: "file",
                  mediaType: "image/png",
                  url: solidPngDataUrl(RED),
                  // Neutral filename: "red.png" would leak the answer (model
                  // could say "red" from the name, not the pixels).
                  filename: "attachment.png",
                },
              ],
            },
          ],
        }),
      });
      expect(t1.status).toBe(200);
      const sessionId = sessionIdFromSse(await t1.text());
      expect(sessionId).toBeTruthy();

      // Simulate a process restart: tear the host down, rebuild against the
      // SAME on-disk sessions.db (+ persisted secret).
      host.runtime.dispose();
      host.store.close();
      host = buildHost(baseDir);

      const t2 = await host.app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          model_id: MODEL_ID,
          session_id: sessionId,
          messages: [
            {
              id: "u2",
              role: "user",
              parts: [
                {
                  // Phrase exactly like (b) — naming the "restart" is a meta
                  // concept the model may hedge on even with the image in
                  // context; the resume mechanism is exercised by the runtime
                  // teardown/rebuild above, not by the wording.
                  type: "text",
                  text: "In one word, what was the dominant color of the image I sent earlier?",
                },
              ],
            },
          ],
        }),
      });
      expect(t2.status).toBe(200);
      // The session row carries the agent bucket; sanity that we resumed it.
      expect((await host.store.get(sessionId))?.agent).toBe(
        AGENT_SESSION_AGENT
      );
      const text = assistantTextFromSse(await t2.text()).toLowerCase();
      expect(text).toContain("red");
    },
    TIMEOUT_MS
  );
});

/**
 * Deferred image-input capabilities — NOT yet implemented (see the plan's
 * "Deferred" list and docs/wg/ai/agent/compositor.md `file-ref`). These are
 * intentional, always-visible `todo` markers (no env gate — `it.todo` never
 * runs) so the gaps aren't forgotten. When a capability lands, replace its
 * `todo` with a real gated live case that mirrors the inline cases above:
 * write a known-content image, drive `AgentRuntime.run`, assert the model
 * names it.
 *
 * The common thread: today an image only reaches the model as INLINE bytes
 * (a base64 `file` part). A path/reference does not — `file-ref` lowers to a
 * text path and there is no `read_image` tool, so the agent gets a string it
 * cannot open (`read_file` returns text, not pixels).
 */
describe("inline image — deferred capabilities (not yet implemented)", () => {
  // User references an image by PATH (@-mention / file-ref) with NO inline
  // attachment. Needs a `read_image` tool (server-execute + toModelOutput
  // returning image content) OR file-ref → provider-native image-block lowering.
  it.todo(
    "perceives a file-ref / @-mention image via read_image (no inline attachment)"
  );

  // User drops a FOLDER of images; the agent lists it and pulls individual
  // images into context by choice. Needs read_image + a read-scope for the
  // dropped directory (scratch/fs).
  it.todo("views images from a dropped folder selectively (read_image)");

  // A pasted/dropped image becomes OPERABLE ("convert this to .gif"): staged to
  // scratch → file-ref so the agent has a path + shell, not just pixels.
  it.todo("operates on a pasted image as a file (scratch-staging → file-ref)");
});
