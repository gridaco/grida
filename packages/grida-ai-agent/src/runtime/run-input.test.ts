import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openSessionsDb, type OpenedSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import {
  parseRunBody,
  persistIncomingTail,
  type NormalizedMessage,
} from "./run-input";
import { buildModelMessages } from "./message-view";

let tempDir: string;
let opened: OpenedSessionsDb;
let store: SessionsStore;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-run-input-test-"));
  opened = openSessionsDb({ user_data_path: tempDir });
  store = new SessionsStore(opened);
});

afterEach(async () => {
  store.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

function userMsg(id: string, text: string): NormalizedMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

// Mimic the recorder writing a tool call at `input-available` (turn 1, before
// the renderer resolves it) — the row `fillToolResult` later updates in place.
async function recordPendingCall(
  sessionId: string,
  msgId: string,
  tcid: string,
  name: string,
  index = 0
) {
  await store.appendMessageIfAbsent(sessionId, {
    id: msgId,
    role: "assistant",
  });
  await store.upsertPart(msgId, {
    index,
    type: `tool-${name}`,
    data: {
      type: `tool-${name}`,
      tool_call_id: tcid,
      tool_name: name,
      state: "input-available",
      input: {},
    },
    tool_call_id: tcid,
    tool_state: "input-available",
    session_id: sessionId,
  });
}

// The shape the AI SDK client resends a resolved tool part in (camelCase).
function clientTool(name: string, tcid: string, output: unknown) {
  return {
    type: `tool-${name}`,
    toolCallId: tcid,
    state: "output-available",
    input: {},
    output,
  };
}

describe("persistIncomingTail", () => {
  it("persists user messages with their parts", async () => {
    const s = await store.create({ agent: "grida" });
    await persistIncomingTail(store, s.id, [userMsg("u1", "hello")]);
    const messages = await store.listMessages(s.id);
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe("u1");
    expect((messages[0].parts[0].data as { text: string }).text).toBe("hello");
  });

  it("skips assistant text/reasoning (the recorder owns those)", async () => {
    const s = await store.create({ agent: "grida" });
    await persistIncomingTail(store, s.id, [
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "hi" }] },
    ]);
    expect((await store.listMessages(s.id)).length).toBe(0);
  });

  it("fills a CLIENT-resolved tool result into the recorder's pending row", async () => {
    // The desktop file-window single-file sidebar resolves fs tools in the
    // renderer, so the result reaches the server only on the next request's
    // assistant message. The recorder wrote the call at `input-available` on
    // turn 1; the resend fills it in place. Without this it stays
    // input-available and the run can't progress.
    const s = await store.create({ agent: "grida" });
    await recordPendingCall(s.id, "a1", "tc1", "list_files");
    await persistIncomingTail(store, s.id, [
      userMsg("u1", "what do you see"),
      {
        id: "a1",
        role: "assistant",
        parts: [clientTool("list_files", "tc1", { files: ["/canvas.svg"] })],
      },
    ]);
    const a1 = (await store.listMessages(s.id)).find((m) => m.id === "a1");
    const toolPart = a1!.parts.find((p) => p.tool_call_id === "tc1");
    expect(toolPart!.tool_state).toBe("output-available");
    expect(
      (toolPart!.data as { output?: { files?: string[] } }).output?.files
    ).toEqual(["/canvas.svg"]);
  });

  it("makes a filled tool result visible to the model view", async () => {
    // The fix is meaningless unless `buildModelMessages` (the server-
    // authoritative model input) now SEES the result — otherwise it drops the
    // call as incomplete and the turn stalls forever.
    const s = await store.create({ agent: "grida" });
    await recordPendingCall(s.id, "a1", "tc1", "list_files");
    await persistIncomingTail(store, s.id, [
      userMsg("u1", "what do you see"),
      {
        id: "a1",
        role: "assistant",
        parts: [clientTool("list_files", "tc1", { files: ["/canvas.svg"] })],
      },
    ]);
    const model = buildModelMessages(await store.listVisibleMessages(s.id));
    const assistant = model.find((m) => m.role === "assistant");
    const toolPart = assistant!.parts.find(
      (p): p is { toolCallId: string; output: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as { toolCallId?: unknown }).toolCallId === "tc1"
    );
    expect(toolPart!.output).toEqual({ files: ["/canvas.svg"] });
  });

  it("does NOT 500 or overwrite when resending already-resolved tool rows (turn-2 workspace regression)", async () => {
    // The bug: once decks became workspace-bound (server-side fs), turn 1
    // produced MANY server-resolved tool parts; on turn 2 the client resent
    // them and the old code re-`upsertPart`'d each at its CLIENT array index,
    // which the tool-keyed UPDATE forced onto the existing row → collided with a
    // sibling part's slot → `UNIQUE(message_id, index)` → 500. `fillToolResult`
    // only touches `input-available` rows and never reindexes, so a resend of
    // already-`output-available` rows is a clean no-op.
    const s = await store.create({ agent: "grida", workspace_id: "w1" });
    await store.appendMessageIfAbsent(s.id, { id: "a1", role: "assistant" });
    const persisted = [
      { index: 0, type: "text", data: { type: "text", text: "Let me look." } },
      {
        index: 1,
        type: "tool-list_files",
        data: {
          type: "tool-list_files",
          tool_call_id: "tc1",
          state: "output-available",
          input: {},
          output: { files: [] },
        },
        tool_call_id: "tc1",
        tool_state: "output-available",
      },
      {
        index: 2,
        type: "tool-read_file",
        data: {
          type: "tool-read_file",
          tool_call_id: "tc2",
          state: "output-available",
          input: {},
          output: { content: "x" },
        },
        tool_call_id: "tc2",
        tool_state: "output-available",
      },
      { index: 3, type: "text", data: { type: "text", text: "done" } },
    ];
    for (const p of persisted) {
      await store.upsertPart("a1", {
        index: p.index,
        type: p.type,
        data: p.data,
        tool_call_id: p.tool_call_id ?? null,
        tool_state: p.tool_state ?? null,
        session_id: s.id,
      });
    }
    // Turn 2: the client resends the full history (same order) + a new message.
    await expect(
      persistIncomingTail(store, s.id, [
        userMsg("u1", "what do you see"),
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "text", text: "Let me look." },
            clientTool("list_files", "tc1", { files: [] }),
            clientTool("read_file", "tc2", { content: "x" }),
            { type: "text", text: "done" },
          ],
        },
        userMsg("u2", "edit slide 1"),
      ])
    ).resolves.toBeUndefined();
    // Rows untouched (still terminal) and the model view rebuilds cleanly.
    const a1 = (await store.listMessages(s.id)).find((m) => m.id === "a1");
    expect(a1!.parts.find((p) => p.tool_call_id === "tc1")!.tool_state).toBe(
      "output-available"
    );
    const model = buildModelMessages(await store.listVisibleMessages(s.id));
    expect(model.map((m) => m.role)).toEqual(["assistant", "user", "user"]);
  });

  it("dedups a user id repeated within one request (no UNIQUE-constraint 500)", async () => {
    const s = await store.create({ agent: "grida" });
    // A client DB-hydration race can put the same user message into the
    // outgoing array twice. Persisting it must not crash.
    await persistIncomingTail(store, s.id, [
      userMsg("dup", "first"),
      userMsg("dup", "second"),
    ]);
    const messages = await store.listMessages(s.id);
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe("dup");
  });

  it("is idempotent across turns — the resent history does not collide", async () => {
    const s = await store.create({ agent: "grida" });
    // Turn 1.
    await persistIncomingTail(store, s.id, [userMsg("u1", "one")]);
    // Turn 2 resends the full history (u1) plus the new message (u2), as
    // the AI SDK client does on every send.
    await persistIncomingTail(store, s.id, [
      userMsg("u1", "one"),
      userMsg("u2", "two"),
    ]);
    const ids = (await store.listMessages(s.id)).map((m) => m.id);
    expect(ids).toEqual(["u1", "u2"]);
  });

  it("survives a concurrent same-session run racing the same new id", async () => {
    const s = await store.create({ agent: "grida" });
    // Two runs each snapshot an empty session, then both try to persist
    // the same client-minted user id. The loser must be a no-op, not a
    // `UNIQUE constraint failed: chat_messages.id` 500.
    await Promise.all([
      persistIncomingTail(store, s.id, [userMsg("race", "a")]),
      persistIncomingTail(store, s.id, [userMsg("race", "a")]),
    ]);
    const messages = await store.listMessages(s.id);
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe("race");
  });
});

describe("parseRunBody", () => {
  const deps = {
    workspace_registry: {
      findById: async () => null,
    },
  };

  it("accepts typed message parts with a string type", async () => {
    const parsed = await parseRunBody(
      {
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "hello" }],
          },
        ],
      },
      deps as never
    );
    expect(parsed).not.toBeInstanceOf(Response);
    if (parsed instanceof Response) return;
    expect(parsed.messages[0].parts[0]).toEqual({
      type: "text",
      text: "hello",
    });
  });

  it("rejects untyped message parts at the HTTP boundary", async () => {
    const parsed = await parseRunBody(
      {
        messages: [
          {
            role: "user",
            parts: [{ text: "missing type" }],
          },
        ],
      },
      deps as never
    );
    expect(parsed).toBeInstanceOf(Response);
    expect(parsed instanceof Response ? parsed.status : 200).toBe(400);
  });

  it("accepts a small inline image file part", async () => {
    const parsed = await parseRunBody(
      {
        messages: [
          {
            role: "user",
            parts: [
              { type: "text", text: "look at this" },
              {
                type: "file",
                mediaType: "image/png",
                url: "data:image/png;base64,AAAA",
                filename: "a.png",
              },
            ],
          },
        ],
      },
      deps as never
    );
    expect(parsed).not.toBeInstanceOf(Response);
    if (parsed instanceof Response) return;
    expect(
      parsed.messages[0].parts.find((p) => p.type === "file")
    ).toMatchObject({
      type: "file",
      mediaType: "image/png",
      filename: "a.png",
    });
  });

  it("accepts a large-but-under-ceiling inline image file part (~7MB decoded)", async () => {
    // Pairs with the oversized-reject case below to bracket the 8 MB ceiling:
    // a legitimately large image (well above the tiny 4-char case) must pass.
    const b64 = "A".repeat(Math.ceil((7 * 1024 * 1024 * 4) / 3));
    const parsed = await parseRunBody(
      {
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "file",
                mediaType: "image/png",
                url: `data:image/png;base64,${b64}`,
              },
            ],
          },
        ],
      },
      deps as never
    );
    expect(parsed).not.toBeInstanceOf(Response);
    if (parsed instanceof Response) return;
    expect(
      parsed.messages[0].parts.find((p) => p.type === "file")
    ).toMatchObject({ type: "file", mediaType: "image/png" });
  });

  it("rejects an oversized inline image file part (>~8MB decoded) with 400", async () => {
    // base64 length ≈ bytes * 4/3; target ~9 MB decoded, over the 8 MB ceiling.
    const b64 = "A".repeat(Math.ceil((9 * 1024 * 1024 * 4) / 3));
    const parsed = await parseRunBody(
      {
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "file",
                mediaType: "image/png",
                url: `data:image/png;base64,${b64}`,
              },
            ],
          },
        ],
      },
      deps as never
    );
    expect(parsed).toBeInstanceOf(Response);
    expect(parsed instanceof Response ? parsed.status : 200).toBe(400);
  });

  it("rejects an oversized inline image with a case-variant DATA: scheme", async () => {
    // The size guard detects `data:` case-insensitively — a `DATA:` scheme must
    // not slip the backstop.
    const b64 = "A".repeat(Math.ceil((9 * 1024 * 1024 * 4) / 3));
    const parsed = await parseRunBody(
      {
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "file",
                mediaType: "image/png",
                url: `DATA:image/png;base64,${b64}`,
              },
            ],
          },
        ],
      },
      deps as never
    );
    expect(parsed).toBeInstanceOf(Response);
    expect(parsed instanceof Response ? parsed.status : 200).toBe(400);
  });

  it("rejects a malformed inline data: URL (no comma) instead of treating it as 0 bytes", async () => {
    // Fail closed: a comma-less data: URL has indeterminate size. The old guard
    // measured it as 0 bytes and let a multi-MB payload through.
    const huge = "A".repeat(9 * 1024 * 1024);
    const parsed = await parseRunBody(
      {
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "file",
                mediaType: "image/png",
                url: `data:image/png;base64${huge}`,
              },
            ],
          },
        ],
      },
      deps as never
    );
    expect(parsed).toBeInstanceOf(Response);
    expect(parsed instanceof Response ? parsed.status : 200).toBe(400);
  });

  // Supervised-approval answer (RFC `permission modes`, Phase 2). The Allow/Deny
  // rides the body as `approval_answer`; parseRunBody shape-gates it (the store
  // is the authority on whether it matches a real pending approval).
  it("parses a well-formed approval_answer", async () => {
    const parsed = await parseRunBody(
      {
        messages: [{ role: "user", parts: [{ type: "text", text: "ok" }] }],
        approval_answer: {
          tool_call_id: "tc1",
          approval_id: "ap1",
          approved: true,
          reason: "looks safe",
        },
      },
      deps as never
    );
    expect(parsed).not.toBeInstanceOf(Response);
    if (parsed instanceof Response) return;
    expect(parsed.approval_answer).toEqual({
      tool_call_id: "tc1",
      approval_id: "ap1",
      approved: true,
      reason: "looks safe",
    });
  });

  it("drops a malformed approval_answer (missing `approved`) without 400ing the turn", async () => {
    const parsed = await parseRunBody(
      {
        messages: [{ role: "user", parts: [{ type: "text", text: "ok" }] }],
        // `approved` missing — fail safe to "no resume", not a rejected request.
        approval_answer: { tool_call_id: "tc1", approval_id: "ap1" },
      },
      deps as never
    );
    expect(parsed).not.toBeInstanceOf(Response);
    if (parsed instanceof Response) return;
    expect(parsed.approval_answer).toBeUndefined();
  });

  it("leaves approval_answer undefined when absent", async () => {
    const parsed = await parseRunBody(
      { messages: [{ role: "user", parts: [{ type: "text", text: "ok" }] }] },
      deps as never
    );
    expect(parsed).not.toBeInstanceOf(Response);
    if (parsed instanceof Response) return;
    expect(parsed.approval_answer).toBeUndefined();
  });
});

describe("parseRunBody — model/provider gates over the open registry (#806)", () => {
  const msg = { messages: [{ role: "user", content: "hi" }] };
  const endpoints = {
    registeredModels: async () => [{ id: "llama3.1:8b" }],
    get: async (id: string) =>
      id === "ollama"
        ? { id: "ollama", base_url: "http://localhost:11434/v1", models: [] }
        : null,
  };
  const deps = {
    workspace_registry: { findById: async () => null },
    endpoints,
  };
  const depsWithoutEndpoints = {
    workspace_registry: { findById: async () => null },
  };

  it("accepts a catalog model id", async () => {
    const parsed = await parseRunBody(
      { ...msg, model_id: "anthropic/claude-opus-4.8" },
      deps as never
    );
    expect(parsed).not.toBeInstanceOf(Response);
  });

  it("accepts a registered endpoint model id", async () => {
    const parsed = await parseRunBody(
      { ...msg, model_id: "llama3.1:8b" },
      deps as never
    );
    expect(parsed).not.toBeInstanceOf(Response);
    if (parsed instanceof Response) return;
    expect(parsed.model_id).toBe("llama3.1:8b");
  });

  it("still 400s an unknown model id (the gate stays closed)", async () => {
    const parsed = await parseRunBody(
      { ...msg, model_id: "not-a-model" },
      deps as never
    );
    expect(parsed).toBeInstanceOf(Response);
    expect(parsed instanceof Response ? parsed.status : 0).toBe(400);
  });

  it("400s a registered-looking id when no endpoints store is wired", async () => {
    const parsed = await parseRunBody(
      { ...msg, model_id: "llama3.1:8b" },
      depsWithoutEndpoints as never
    );
    expect(parsed).toBeInstanceOf(Response);
  });

  it("accepts a configured endpoint id as provider_id, rejects unknown", async () => {
    const ok = await parseRunBody(
      { ...msg, provider_id: "ollama" },
      deps as never
    );
    expect(ok).not.toBeInstanceOf(Response);
    if (ok instanceof Response) return;
    expect(ok.explicit).toBe("ollama");

    const bad = await parseRunBody(
      { ...msg, provider_id: "nope" },
      deps as never
    );
    expect(bad).toBeInstanceOf(Response);
    expect(bad instanceof Response ? bad.status : 0).toBe(400);
  });
});
