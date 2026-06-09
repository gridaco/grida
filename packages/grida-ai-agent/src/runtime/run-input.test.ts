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

describe("persistIncomingTail", () => {
  it("persists user messages with their parts", async () => {
    const s = await store.create({ agent: "grida" });
    await persistIncomingTail(store, s.id, [userMsg("u1", "hello")]);
    const messages = await store.listMessages(s.id);
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe("u1");
    expect((messages[0].parts[0].data as { text: string }).text).toBe("hello");
  });

  it("skips assistant messages (the recorder owns those)", async () => {
    const s = await store.create({ agent: "grida" });
    await persistIncomingTail(store, s.id, [
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "hi" }] },
    ]);
    expect((await store.listMessages(s.id)).length).toBe(0);
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
