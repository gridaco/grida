/**
 * Live BYOK smoke for the sessions store.
 *
 * Boots the agent server in a tempdir, seeds an OpenRouter key from
 * `BYOK_OPENROUTER_API_KEY` (or `editor/.env.local`), POSTs
 * `/agent/run` with a deterministic prompt, drains the SSE
 * stream, then opens the underlying `sessions.db` and prints every
 * row that landed. Exits non-zero on any assertion failure.
 *
 * **Not** a vitest test — runs as a one-shot script so CI environments
 * without the key skip cleanly (no failed test files).
 *
 * Run:
 *   `pnpm --filter @grida/agent smoke:sessions:live`
 *
 * Skips with a clear warning if no key is available.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AgentHost } from "../agent-host";
import { AgentTransport } from "../transport";
import type { ChatMessageWithParts, ChatSessionRow } from "./rows";

const KEY_ENV = "BYOK_OPENROUTER_API_KEY";
const SMOKE_ORIGIN = "https://agent-smoke.local";
const SMOKE_REFERER_PATH = "/smoke";

async function loadByokKey(): Promise<string | null> {
  const fromEnv = process.env[KEY_ENV]?.trim();
  if (fromEnv) return fromEnv;
  // Fall back to editor/.env.local — colocated with the rest of the
  // repo's BYOK env wiring.
  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const candidates = [
    path.join(repoRoot, "editor", ".env.local"),
    path.join(repoRoot, ".env.local"),
  ];
  for (const file of candidates) {
    try {
      const text = await fs.readFile(file, "utf8");
      const m = text.match(/^BYOK_OPENROUTER_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m);
      if (m && m[1]?.trim()) return m[1].trim();
    } catch {
      // file missing — try next
    }
  }
  return null;
}

async function setBYOKAuth(userDataPath: string, key: string): Promise<void> {
  // Mirror `auth/file.ts` schema: openrouter → ApiKeyEntry.
  // Permission discipline is enforced by the agent host on read; we open
  // chmod 0o600 here so the agent host won't bail.
  const payload = JSON.stringify({ openrouter: { type: "api", key } });
  const filePath = path.join(userDataPath, "auth.json");
  await fs.writeFile(filePath, payload, { mode: 0o600 });
}

function reqHeaders(password: string): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "text/event-stream",
    authorization: AgentTransport.buildBasicAuthHeader(password),
    referer: `${SMOKE_ORIGIN}${SMOKE_REFERER_PATH}`,
    origin: SMOKE_ORIGIN,
  };
}

async function agentGetJson<T>(
  base: string,
  password: string,
  route: string
): Promise<T> {
  const res = await fetch(`${base}${route}`, {
    method: "GET",
    headers: reqHeaders(password),
  });
  return await AgentTransport.parseJson<T>(res, route);
}

async function getSession(
  base: string,
  password: string,
  sessionId: string
): Promise<ChatSessionRow> {
  return await agentGetJson<ChatSessionRow>(
    base,
    password,
    `/sessions/${encodeURIComponent(sessionId)}`
  );
}

async function listSessionMessages(
  base: string,
  password: string,
  sessionId: string
): Promise<ChatMessageWithParts[]> {
  return await agentGetJson<ChatMessageWithParts[]>(
    base,
    password,
    `/sessions/${encodeURIComponent(sessionId)}/messages`
  );
}

async function main(): Promise<void> {
  const key = await loadByokKey();
  if (!key) {
    console.warn(
      `[smoke] ${KEY_ENV} not set and no editor/.env.local key found — skipping live smoke.`
    );
    process.exit(0);
  }

  const runId = crypto.randomBytes(4).toString("hex");
  const baseDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `grida-smoke-${runId}-`)
  );
  const userDataPath = path.join(baseDir, "userdata");
  await fs.mkdir(userDataPath, { recursive: true });

  console.log(`[smoke] userDataPath=${userDataPath}`);

  await setBYOKAuth(userDataPath, key);

  const password = crypto.randomBytes(32).toString("base64url");
  const host = new AgentHost({
    password,
    user_data_path: userDataPath,
    http_access: {
      allowed_origins: [SMOKE_ORIGIN],
      allowed_referer_paths: [SMOKE_REFERER_PATH],
    },
  });
  await host.start();
  const base = `http://127.0.0.1:${host.port}`;

  // ── Turn 1: simple text-only round-trip ─────────────────────────────
  console.log("[smoke] POST /agent/run (turn 1)");
  const res1 = await fetch(`${base}/agent/run`, {
    method: "POST",
    headers: reqHeaders(password),
    body: JSON.stringify({
      tier: "nano",
      provider_id: "openrouter",
      feature: "smoke/sessions",
      messages: [
        {
          id: "u-1",
          role: "user",
          parts: [
            {
              type: "text",
              text: "Reply with exactly this single phrase, no punctuation: sessions smoke ok",
            },
          ],
        },
      ],
    }),
  });

  if (!res1.ok) {
    const text = await res1.text();
    fail(
      `[smoke] turn 1 failed: ${res1.status} ${res1.statusText} body=${text}`
    );
  }
  const body1 = await drainSse(res1);
  const sessionId = body1.session_id;
  if (!sessionId) fail("[smoke] turn 1 missing in-band grida-session frame");
  console.log(`[smoke] sessionId=${sessionId}`);
  console.log(
    `[smoke] turn 1 chunks=${body1.chunkCount} firstType=${body1.firstType ?? "<none>"} lastType=${body1.lastType ?? "<none>"}`
  );

  // Give the recorder's write chain a moment to flush after the stream
  // finishes — drainSse waits for `[DONE]`, but the in-memory promise
  // chain in the accumulator flushes async behind that.
  await delay(100);

  // ── Inspect via the bundled SessionsStore ───────────────────────────
  const messages = await listSessionMessages(base, password, sessionId!);
  console.log(`[smoke] session has ${messages.length} message(s)`);
  let assistantParts = 0;
  for (const m of messages) {
    console.log(`  [${m.role}] id=${m.id} parts=${m.parts.length}`);
    for (const p of m.parts) {
      const preview = JSON.stringify(p.data).slice(0, 80);
      console.log(
        `    - type=${p.type} state=${p.tool_state ?? "-"} data=${preview}`
      );
      if (m.role === "assistant") assistantParts += 1;
    }
  }
  const session = await getSession(base, password, sessionId!);
  console.log(
    `[smoke] session row: title=${JSON.stringify(session?.title)} tokens=${session?.total_tokens} cost=${session?.cost_usd}`
  );

  // The titler runs fire-and-forget in parallel with the chat stream.
  // By the time turn 1 finishes the title is *usually* already written,
  // but on slow networks it may still be in flight. Poll for up to 15s
  // so the assertion isn't flaky.
  const titled = await pollUntil(
    async () => {
      const s = await getSession(base, password, sessionId!);
      if (!s) return null;
      return s.title !== "New Chat" ? s.title : null;
    },
    { timeout_ms: 15_000, intervalMs: 200 }
  );
  if (!titled) {
    fail("[smoke] session title was not generated within 15s (still default)");
  }
  console.log(`[smoke] generated title=${JSON.stringify(titled)}`);

  // Assertions.
  if (messages.length < 2)
    fail("[smoke] expected ≥ 2 messages (user + assistant)");
  const user = messages.find((m) => m.role === "user");
  const assistant = messages.find((m) => m.role === "assistant");
  if (!user) fail("[smoke] user message missing");
  if (!assistant) fail("[smoke] assistant message missing");
  if (assistantParts === 0) fail("[smoke] assistant has no parts");
  const assistantText = assistant!.parts
    .filter((p) => p.type === "text")
    .map((p) => (p.data as { text?: string }).text ?? "")
    .join("");
  if (assistantText.trim().length === 0) {
    fail("[smoke] assistant text part is empty");
  }
  if (!session || session.total_tokens <= 0) {
    fail(`[smoke] session totalTokens not positive: ${session?.total_tokens}`);
  }
  // Cost is intentionally not asserted: BYOK pays the upstream provider
  // directly; pricing-aware cost rollup lives in the editor's hosted
  // route, not in the agent host recorder. `cost_usd` stays at 0 for BYOK.

  // ── Open the DB directly to prove the file is inspectable ───────────
  const dbPath = path.join(userDataPath, "sessions.db");
  const direct = new DatabaseSync(dbPath, { readOnly: true });
  const sessionsRows = direct
    .prepare("SELECT id, title, agent, total_tokens FROM chat_sessions")
    .all() as Array<Record<string, unknown>>;
  const messagesRows = direct
    .prepare(
      "SELECT id, session_id, role FROM chat_messages WHERE session_id = ?"
    )
    .all(sessionId!) as Array<Record<string, unknown>>;
  const partsRows = direct
    .prepare(
      'SELECT id, message_id, type, tool_state FROM chat_parts WHERE session_id = ? ORDER BY "index"'
    )
    .all(sessionId!) as Array<Record<string, unknown>>;
  console.log(
    `[smoke] direct DB read: ${sessionsRows.length} sessions, ${messagesRows.length} messages, ${partsRows.length} parts`
  );
  direct.close();

  // ── Turn 2: follow-up on the same session id, with prior history ───
  console.log("[smoke] POST /agent/run (turn 2, sessionId reuse)");
  const res2 = await fetch(`${base}/agent/run`, {
    method: "POST",
    headers: reqHeaders(password),
    body: JSON.stringify({
      tier: "nano",
      provider_id: "openrouter",
      feature: "smoke/sessions",
      session_id: sessionId,
      messages: [
        ...messages.map((m) => ({
          id: m.id,
          role: m.role,
          parts: m.parts.map((p) => p.data),
        })),
        {
          id: "u-2",
          role: "user",
          parts: [
            {
              type: "text",
              text: "Reply with just: ack",
            },
          ],
        },
      ],
    }),
  });
  if (!res2.ok) {
    const text = await res2.text();
    fail(
      `[smoke] turn 2 failed: ${res2.status} ${res2.statusText} body=${text}`
    );
  }
  const body2 = await drainSse(res2);
  if (body2.session_id !== sessionId) {
    fail(
      `[smoke] turn 2 changed session id: ${body2.session_id} != ${sessionId}`
    );
  }
  console.log(`[smoke] turn 2 chunks=${body2.chunkCount}`);
  await delay(100);

  const messages2 = await listSessionMessages(base, password, sessionId!);
  console.log(`[smoke] after turn 2: ${messages2.length} message(s)`);
  if (messages2.length < 4) {
    fail(
      `[smoke] expected ≥ 4 messages after turn 2 (got ${messages2.length})`
    );
  }

  // ── Turn 3: mid-stream disconnect + reconnect via /stream/:id ─────
  //
  // Proves stream-survives-refresh: a client that gets killed mid-
  // stream (TCP close) can reattach to the agent host's still-running model
  // call via `GET /agent/stream/:sessionId`. The two halves of
  // the stream together must reconstruct the full assistant output.
  console.log("[smoke] POST /agent/run (turn 3, will disconnect mid-stream)");
  const res3 = await fetch(`${base}/agent/run`, {
    method: "POST",
    headers: reqHeaders(password),
    body: JSON.stringify({
      tier: "nano",
      provider_id: "openrouter",
      feature: "smoke/sessions",
      session_id: sessionId,
      // Skip prior history for brevity — agent host dedupes by id.
      messages: [
        {
          id: "u-3",
          role: "user",
          parts: [
            {
              type: "text",
              text: "Count from one to twenty, one number per line, no punctuation, no extra words.",
            },
          ],
        },
      ],
    }),
  });
  if (!res3.ok) {
    const body = await res3.text();
    fail(
      `[smoke] turn 3 failed: ${res3.status} ${res3.statusText} body=${body}`
    );
  }

  // Pre-disconnect: drain a few frames, then bail to simulate a
  // client that closes mid-stream (page refresh, etc.).
  const pre = await drainPartialSse(res3, { maxFrames: 4 });
  console.log(`[smoke] turn 3 pre-disconnect: chunks=${pre.chunkCount}`);
  if (pre.chunkCount === 0) {
    fail("[smoke] expected at least one frame before disconnect");
  }

  // Reconnect: agent host replays the full chunk log from the start, then
  // live-tails until the upstream model finishes.
  console.log(`[smoke] GET /agent/stream/${sessionId} (full replay)`);
  const res3b = await fetch(
    `${base}/agent/stream/${encodeURIComponent(sessionId!)}`,
    { method: "GET", headers: reqHeaders(password) }
  );
  if (!res3b.ok) {
    const body = await res3b.text();
    fail(
      `[smoke] reconnect failed: ${res3b.status} ${res3b.statusText} body=${body}`
    );
  }
  const post = await drainPartialSse(res3b, { maxFrames: Infinity });
  console.log(
    `[smoke] turn 3 post-reconnect: chunks=${post.chunkCount} lastType=${post.lastType ?? "<none>"}`
  );

  if (post.lastType !== "finish") {
    fail(
      `[smoke] reconnect did not see a finish frame (got lastType=${post.lastType ?? "<none>"})`
    );
  }

  // Wait briefly for recorder writes to settle after the [DONE] frame.
  await delay(200);

  const messages3 = await listSessionMessages(base, password, sessionId!);
  // Locate the assistant message minted by turn 3 — it's the last one.
  const lastAssistant = [...messages3]
    .reverse()
    .find((m) => m.role === "assistant");
  if (!lastAssistant) fail("[smoke] turn 3 assistant message missing in DB");
  const lastText = lastAssistant!.parts
    .filter((p) => p.type === "text")
    .map((p) => (p.data as { text?: string }).text ?? "")
    .join("");
  // Look for a few mid-sequence numerals — proves the model produced
  // the full count, not just the head we drained pre-disconnect.
  const sawLate = ["15", "18", "20"].every((n) => lastText.includes(n));
  if (!sawLate) {
    fail(
      `[smoke] turn 3 assistant text appears truncated — missing late numerals. text=${JSON.stringify(
        lastText
      )}`
    );
  }
  console.log(
    `[smoke] turn 3 final assistant text length=${lastText.length} contains 15/18/20=${sawLate}`
  );

  await host.stop();
  await fs.rm(baseDir, { recursive: true, force: true });
  console.log("[smoke] OK");
}

/**
 * Drain an SSE response up to `maxFrames` chunks (Infinity = until
 * `[DONE]`). Cancels the underlying reader on early exit, which fires
 * the source-side `cancel()` in `buildConsumerResponse` and detaches
 * the consumer (the agent host pump keeps running).
 */
async function drainPartialSse(
  res: Response,
  opts: { maxFrames: number }
): Promise<{
  chunkCount: number;
  firstType: string | null;
  lastType: string | null;
}> {
  let chunkCount = 0;
  let firstType: string | null = null;
  let lastType: string | null = null;
  if (!res.body) return { chunkCount, firstType, lastType };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let frameData: string | null = null;
        for (const line of frame.split("\n")) {
          if (line.startsWith("data:")) {
            frameData = line.slice(5).trim();
          }
        }
        if (frameData === null) continue;
        if (frameData === "[DONE]") break outer;
        try {
          const obj = JSON.parse(frameData) as { type?: string };
          chunkCount += 1;
          if (firstType === null && typeof obj.type === "string") {
            firstType = obj.type;
          }
          if (typeof obj.type === "string") lastType = obj.type;
          if (process.env.SMOKE_DUMP_CHUNKS === "1") {
            console.log(`[smoke chunk] ${JSON.stringify(obj)}`);
          }
        } catch {
          // ignore unparseable frames
        }
        if (chunkCount >= opts.maxFrames) break outer;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }
  return { chunkCount, firstType, lastType };
}

async function drainSse(res: Response): Promise<{
  chunkCount: number;
  firstType: string | null;
  lastType: string | null;
  session_id: string | null;
}> {
  if (!res.body)
    return { chunkCount: 0, firstType: null, lastType: null, session_id: null };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let chunkCount = 0;
  let firstType: string | null = null;
  let lastType: string | null = null;
  let sessionId: string | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = frame.split("\n");
      // In-band session id frame: `event: grida-session` + `data: {sessionId}`.
      // It's the sole continuity channel; capture it, don't count it as a chunk.
      if (lines.some((l) => l.startsWith("event: grida-session"))) {
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (dataLine) {
          try {
            sessionId =
              (JSON.parse(dataLine.slice(5).trim()) as { session_id?: string })
                .session_id ?? null;
          } catch {
            // ignore malformed session frame
          }
        }
        continue;
      }
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const obj = JSON.parse(data) as { type?: string };
          chunkCount += 1;
          if (firstType === null && typeof obj.type === "string") {
            firstType = obj.type;
          }
          if (typeof obj.type === "string") lastType = obj.type;
          if (process.env.SMOKE_DUMP_CHUNKS === "1") {
            console.log(`[smoke chunk] ${JSON.stringify(obj)}`);
          }
        } catch {
          // ignore unparseable frames
        }
      }
    }
  }
  return { chunkCount, firstType, lastType, session_id: sessionId };
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll a probe until it returns a truthy value, or `null` on timeout.
 * Used to wait for the fire-and-forget titler to finish without
 * sleeping a fixed budget every run.
 */
async function pollUntil<T>(
  probe: () => Promise<T | null>,
  opts: { timeout_ms: number; intervalMs: number }
): Promise<T | null> {
  const deadline = Date.now() + opts.timeout_ms;
  while (Date.now() < deadline) {
    const out = await probe();
    if (out) return out;
    await delay(opts.intervalMs);
  }
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
