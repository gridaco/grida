import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { newMessageId, newPartId, newSessionId } from "./ids";
import { openSessionsDb, type OpenedSessionsDb } from "./db";
import { SessionsStore, SessionNotFoundError } from "./store";

let tempDir: string;
let opened: OpenedSessionsDb;
let store: SessionsStore;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-sessions-test-"));
  opened = openSessionsDb({ user_data_path: tempDir });
  store = new SessionsStore(opened);
});

afterEach(async () => {
  store.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("sessions ids", () => {
  it("mints sortable monotonic ids in tight loops", () => {
    const N = 10_000;
    const ids: string[] = [];
    for (let i = 0; i < N; i += 1) ids.push(newSessionId());
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
    expect(new Set(ids).size).toBe(N);
  });

  it("uses distinct prefixes", () => {
    expect(newSessionId().startsWith("ses_")).toBe(true);
    expect(newMessageId().startsWith("msg_")).toBe(true);
    expect(newPartId().startsWith("prt_")).toBe(true);
  });
});

describe("openSessionsDb", () => {
  it("creates the three tables + expected indexes", () => {
    const tables = opened.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("chat_sessions");
    expect(names).toContain("chat_messages");
    expect(names).toContain("chat_parts");

    const idx = opened.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;
    const idxNames = idx.map((r) => r.name);
    expect(idxNames).toContain("idx_chat_sessions_agent_updated");
    expect(idxNames).toContain("idx_chat_messages_session_created");
    expect(idxNames).toContain("idx_chat_parts_message_index");
  });

  it("sets WAL journal mode and foreign_keys on", () => {
    const journal = opened.sqlite.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    expect(journal.journal_mode.toLowerCase()).toBe("wal");
    const fk = opened.sqlite.prepare("PRAGMA foreign_keys").get() as {
      foreign_keys: number;
    };
    expect(fk.foreign_keys).toBe(1);
  });

  it("is idempotent on second open", () => {
    store.close();
    // Re-open the same file; should not throw and tables should still exist.
    opened = openSessionsDb({ user_data_path: tempDir });
    store = new SessionsStore(opened);
    const tables = opened.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toContain("chat_sessions");
  });

  it("creates a missing nested userDataPath directory", async () => {
    // node:sqlite won't create the parent dir; the host's userDataPath
    // (e.g. ~/.grida/agent) may not exist on a fresh machine. Opening must
    // create it rather than fail with "unable to open database file".
    const nested = path.join(tempDir, "does", "not", "exist", "agent");
    const opened2 = openSessionsDb({ user_data_path: nested });
    try {
      const tables = opened2.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;
      expect(tables.map((t) => t.name)).toContain("chat_sessions");
      expect(
        await fs.stat(path.join(nested, "sessions.db")).then((s) => s.isFile())
      ).toBe(true);
    } finally {
      opened2.close();
    }
  });
});

describe("SessionsStore CRUD", () => {
  it("create → get → rename → archive → unarchive → delete", async () => {
    const created = await store.create({
      agent: "grida",
      workspace_id: "ws1",
      workspace_root: "/tmp/ws",
      title: "Hello",
      model: { provider_id: "openrouter", tier: "pro" },
      metadata: { source: "test" },
    });
    expect(created.id).toMatch(/^ses_/);
    expect(created.agent).toBe("grida");
    expect(created.model).toEqual({
      provider_id: "openrouter",
      tier: "pro",
    });
    expect(created.metadata).toEqual({ source: "test" });

    const fetched = await store.get(created.id);
    expect(fetched?.id).toBe(created.id);

    const renamed = await store.rename(created.id, "Renamed");
    expect(renamed.title).toBe("Renamed");
    expect(renamed.updated_at).toBeGreaterThanOrEqual(created.updated_at);

    const archived = await store.archive(created.id);
    expect(archived.archived_at).not.toBeNull();

    const unarchived = await store.unarchive(created.id);
    expect(unarchived.archived_at).toBeNull();

    await store.delete(created.id);
    expect(await store.get(created.id)).toBeNull();
  });

  it("rename throws when session is missing", async () => {
    await expect(store.rename("ses_missing", "X")).rejects.toBeInstanceOf(
      SessionNotFoundError
    );
  });

  it("list filters by agent + workspaceId, excludes archived by default", async () => {
    const a = await store.create({ agent: "grida", workspace_id: "ws1" });
    await delay(2);
    const b = await store.create({ agent: "grida", workspace_id: "ws2" });
    await delay(2);
    const c = await store.create({ agent: "other", workspace_id: "ws1" });

    const grida = await store.list({ agent: "grida" });
    expect(grida.items.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());

    const ws1 = await store.list({ workspace_id: "ws1" });
    expect(ws1.items.map((s) => s.id).sort()).toEqual([a.id, c.id].sort());

    await store.archive(a.id);
    const gridaVisible = await store.list({ agent: "grida" });
    expect(gridaVisible.items.map((s) => s.id)).toEqual([b.id]);

    const gridaAll = await store.list({
      agent: "grida",
      include_archived: true,
    });
    expect(gridaAll.items.length).toBe(2);
  });

  it("list paginates with deterministic cursors", async () => {
    const created: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const s = await store.create({ agent: "grida", title: `s${i}` });
      created.push(s.id);
      await delay(1);
    }
    const first = await store.list({ limit: 5 });
    expect(first.items.length).toBe(5);
    expect(first.next_cursor).not.toBeNull();

    const second = await store.list({ limit: 5, cursor: first.next_cursor! });
    expect(second.items.length).toBe(5);
    const overlap = new Set(first.items.map((s) => s.id));
    for (const s of second.items) expect(overlap.has(s.id)).toBe(false);
  });

  it("paginates without skips/dupes after an old session is re-touched", async () => {
    // Regression: the keyset cursor must track the ORDER key (updatedAt),
    // not id. Re-touching the oldest (lowest-id) session moves it to the
    // top by updatedAt; a cursor on id alone then drops or duplicates it.
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const s = await store.create({ agent: "grida", title: `s${i}` });
      ids.push(s.id);
      await delay(2);
    }
    await delay(2);
    await store.touch(ids[0]); // oldest id, now newest updatedAt

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 6; page += 1) {
      const res = await store.list({ limit: 2, cursor });
      seen.push(...res.items.map((s) => s.id));
      if (!res.next_cursor) break;
      cursor = res.next_cursor;
    }

    expect([...seen].sort()).toEqual([...ids].sort());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("cascades delete to messages and parts", async () => {
    const s = await store.create({ agent: "grida" });
    const m = await store.appendMessage(s.id, { role: "user" });
    await store.upsertPart(m.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: "hi" },
    });
    expect((await store.listMessages(s.id)).length).toBe(1);
    await store.delete(s.id);
    expect(await store.get(s.id)).toBeNull();
    const orphanParts = opened.sqlite
      .prepare("SELECT COUNT(*) AS n FROM chat_parts WHERE session_id = ?")
      .get(s.id) as { n: number };
    expect(orphanParts.n).toBe(0);
    const orphanMessages = opened.sqlite
      .prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?")
      .get(s.id) as { n: number };
    expect(orphanMessages.n).toBe(0);
  });
});

describe("SessionsStore messages + parts", () => {
  it("appendMessage bumps session updated_at", async () => {
    const s = await store.create({ agent: "grida" });
    const before = s.updated_at;
    await delay(2);
    await store.appendMessage(s.id, { role: "user" });
    const after = await store.get(s.id);
    expect(after!.updated_at).toBeGreaterThan(before);
  });

  it("appendMessageIfAbsent is a no-op on a duplicate id (no throw)", async () => {
    const s = await store.create({ agent: "grida" });
    await store.appendMessageIfAbsent(s.id, { id: "fixed-id", role: "user" });
    // Second insert of the same client-minted id must not throw — the
    // client resends history with stable ids and runs can race.
    await store.appendMessageIfAbsent(s.id, { id: "fixed-id", role: "user" });
    const messages = await store.listMessages(s.id);
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe("fixed-id");
  });

  it("appendMessage throws on a duplicate id (recorder collisions stay loud)", async () => {
    const s = await store.create({ agent: "grida" });
    await store.appendMessage(s.id, { id: "dup", role: "assistant" });
    // Distinct from appendMessageIfAbsent: the recorder mints server-side
    // assistant ids that must never collide, so a clash here is a real
    // bug and must surface rather than silently no-op.
    await expect(
      store.appendMessage(s.id, { id: "dup", role: "assistant" })
    ).rejects.toThrow(/chat_messages/);
  });

  it("upsertPart by (messageId, index) is idempotent", async () => {
    const s = await store.create({ agent: "grida" });
    const m = await store.appendMessage(s.id, { role: "assistant" });
    const first = await store.upsertPart(m.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: "h" },
    });
    const second = await store.upsertPart(m.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: "hello" },
    });
    expect(second.id).toBe(first.id);
    const messages = await store.listMessages(s.id);
    expect(messages[0].parts.length).toBe(1);
    expect((messages[0].parts[0].data as { text: string }).text).toBe("hello");
  });

  it("upsertPart by toolCallId tracks state transitions", async () => {
    const s = await store.create({ agent: "grida" });
    const m = await store.appendMessage(s.id, { role: "assistant" });
    const a = await store.upsertPart(m.id, {
      index: 0,
      type: "tool-list_files",
      data: { type: "tool-list_files", state: "input-streaming" },
      tool_call_id: "tc-1",
      tool_state: "input-streaming",
    });
    const b = await store.upsertPart(m.id, {
      index: 0,
      type: "tool-list_files",
      data: {
        type: "tool-list_files",
        state: "output-available",
        output: { files: ["a"] },
      },
      tool_call_id: "tc-1",
      tool_state: "output-available",
    });
    expect(b.id).toBe(a.id);
    expect(b.tool_state).toBe("output-available");
    const messages = await store.listMessages(s.id);
    expect(messages[0].parts.length).toBe(1);
  });

  it("updateUsage adds to counters; setUsage replaces", async () => {
    const s = await store.create({ agent: "grida" });
    await store.updateUsage(s.id, {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    await store.updateUsage(s.id, {
      prompt_tokens: 2,
      completion_tokens: 1,
      total_tokens: 3,
    });
    let row = await store.get(s.id);
    expect(row!.prompt_tokens).toBe(12);
    expect(row!.completion_tokens).toBe(6);
    expect(row!.total_tokens).toBe(18);

    await store.setUsage(s.id, {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });
    row = await store.get(s.id);
    expect(row!.prompt_tokens).toBe(100);
    expect(row!.total_tokens).toBe(150);
  });

  it("listMessages returns messages in insertion order with their parts", async () => {
    const s = await store.create({ agent: "grida" });
    const m1 = await store.appendMessage(s.id, { role: "user" });
    await delay(2);
    const m2 = await store.appendMessage(s.id, { role: "assistant" });
    await store.upsertPart(m2.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: "ok" },
    });
    await store.upsertPart(m2.id, {
      index: 1,
      type: "tool-list_files",
      data: {
        type: "tool-list_files",
        state: "output-available",
        output: { files: [] },
      },
      tool_call_id: "tc-1",
      tool_state: "output-available",
    });
    const messages = await store.listMessages(s.id);
    expect(messages.map((m) => m.id)).toEqual([m1.id, m2.id]);
    expect(messages[1].parts.length).toBe(2);
    expect(messages[1].parts[0].type).toBe("text");
    expect(messages[1].parts[1].type).toBe("tool-list_files");
  });
});

describe("SessionsStore schema columns", () => {
  it("openSessionsDb declares fork/rewind/usage columns", () => {
    const sessCols = (
      opened.sqlite.prepare("PRAGMA table_info(chat_sessions)").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(sessCols).toContain("parent_id");
    expect(sessCols).toContain("parent_message_id");
    expect(sessCols).toContain("permissions_json");
    expect(sessCols).toContain("reasoning_tokens");
    expect(sessCols).toContain("cache_read");
    expect(sessCols).toContain("cache_write");
    const msgCols = (
      opened.sqlite.prepare("PRAGMA table_info(chat_messages)").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(msgCols).toContain("hidden_at");
  });
});

describe("SessionsStore rewind", () => {
  it("soft-hides messages after the rewind point; history is preserved", async () => {
    const s = await store.create({ agent: "grida" });
    const u1 = await store.appendMessage(s.id, { role: "user" });
    await delay(2);
    const a1 = await store.appendMessage(s.id, { role: "assistant" });
    await delay(2);
    const u2 = await store.appendMessage(s.id, { role: "user" });
    await delay(2);
    const a2 = await store.appendMessage(s.id, { role: "assistant" });

    const res = await store.rewind(s.id, u1.id);
    expect(res.hidden_count).toBe(3); // a1, u2, a2
    expect(res.to_message_id).toBe(u1.id);

    const visible = await store.listVisibleMessages(s.id);
    expect(visible.map((m) => m.id)).toEqual([u1.id]);

    // Hidden rows are NOT deleted — listMessages still returns all four,
    // with hiddenAt stamped on the truncated ones.
    const all = await store.listMessages(s.id);
    expect(all.map((m) => m.id)).toEqual([u1.id, a1.id, u2.id, a2.id]);
    expect(all.find((m) => m.id === u1.id)!.hidden_at).toBeNull();
    expect(all.find((m) => m.id === a2.id)!.hidden_at).not.toBeNull();
  });

  it("unhideAfter restores a rewind (un-rewind)", async () => {
    const s = await store.create({ agent: "grida" });
    const u1 = await store.appendMessage(s.id, { role: "user" });
    await delay(2);
    const a1 = await store.appendMessage(s.id, { role: "assistant" });
    await delay(2);
    const u2 = await store.appendMessage(s.id, { role: "user" });

    await store.rewind(s.id, u1.id);
    expect((await store.listVisibleMessages(s.id)).map((m) => m.id)).toEqual([
      u1.id,
    ]);

    await store.unhideAfter(s.id, u1.id);
    expect((await store.listVisibleMessages(s.id)).map((m) => m.id)).toEqual([
      u1.id,
      a1.id,
      u2.id,
    ]);
  });

  it("rewind throws for a message in another session", async () => {
    const s1 = await store.create({ agent: "grida" });
    const s2 = await store.create({ agent: "grida" });
    const m = await store.appendMessage(s2.id, { role: "user" });
    await expect(store.rewind(s1.id, m.id)).rejects.toThrow(
      /message not found/
    );
  });
});

describe("SessionsStore rewind past compaction", () => {
  async function seedCompacted() {
    const s = await store.create({ agent: "grida" });
    const ids: Record<string, string> = {};
    const u1 = await store.appendMessage(s.id, { role: "user" });
    ids.u1 = u1.id;
    await delay(2);
    const a1 = await store.appendMessage(s.id, { role: "assistant" });
    ids.a1 = a1.id;
    await delay(2);
    const u2 = await store.appendMessage(s.id, { role: "user" });
    ids.u2 = u2.id;
    await delay(2);
    const a2 = await store.appendMessage(s.id, { role: "assistant" });
    ids.a2 = a2.id;
    await delay(2);
    const u3 = await store.appendMessage(s.id, { role: "user" });
    ids.u3 = u3.id;
    await delay(2);
    const a3 = await store.appendMessage(s.id, { role: "assistant" });
    ids.a3 = a3.id;
    await delay(2);
    // Compact the first two turns; tail = [u3, a3]. The marker is appended at
    // the BOTTOM and nothing is hidden — the boundary is read-time.
    const { summary_message_id: summaryMessageId } =
      await store.applyCompaction({
        session_id: s.id,
        summary: "SUMMARY",
        tail_start_id: u3.id,
        auto: true,
        summary_tokens: 5,
      });
    ids.summary = summaryMessageId;
    return { session_id: s.id, ids };
  }

  it("hides nothing and sorts the marker last (linear, complete log)", async () => {
    const { session_id: sessionId, ids } = await seedCompacted();
    const visible = await store.listVisibleMessages(sessionId);
    expect(visible.map((m) => m.id)).toEqual([
      ids.u1,
      ids.a1,
      ids.u2,
      ids.a2,
      ids.u3,
      ids.a3,
      ids.summary,
    ]);
  });

  it("rewinding past the marker re-exposes the head and drops the boundary", async () => {
    const { session_id: sessionId, ids } = await seedCompacted();
    // Rewind to u2 → hide everything after it (incl. the bottom marker).
    await store.rewind(sessionId, ids.u2);
    const visible = await store.listVisibleMessages(sessionId);
    expect(visible.map((m) => m.id)).toEqual([ids.u1, ids.a1, ids.u2]);
    // The marker is gone → no compaction boundary remains.
    expect(
      visible.some((m) => m.parts.some((p) => p.type === "data-compaction"))
    ).toBe(false);
  });

  it("rewinding to the tail start hides the marker (undoes the compaction)", async () => {
    const { session_id: sessionId, ids } = await seedCompacted();
    await store.rewind(sessionId, ids.u3);
    const visible = await store.listVisibleMessages(sessionId);
    expect(visible.map((m) => m.id)).toEqual([
      ids.u1,
      ids.a1,
      ids.u2,
      ids.a2,
      ids.u3,
    ]);
    expect(
      visible.some((m) => m.parts.some((p) => p.type === "data-compaction"))
    ).toBe(false);
  });
});

describe("SessionsStore rollups", () => {
  it("recomputeRollups sums per-message usage across visible assistant turns", async () => {
    const s = await store.create({ agent: "grida" });
    await store.appendMessage(s.id, { role: "user" });
    const a1 = await store.appendMessage(s.id, { role: "assistant" });
    await store.setMessageUsage(a1.id, {
      input: 100,
      output: 20,
      reasoning: 5,
      cache_read: 10,
      cache_write: 2,
    });
    await delay(2);
    await store.appendMessage(s.id, { role: "user" });
    const a2 = await store.appendMessage(s.id, { role: "assistant" });
    await store.setMessageUsage(a2.id, { input: 50, output: 10 });

    await store.recomputeRollups(s.id);
    const row = await store.get(s.id);
    expect(row!.prompt_tokens).toBe(150);
    expect(row!.completion_tokens).toBe(30);
    expect(row!.reasoning_tokens).toBe(5);
    expect(row!.cache_read).toBe(10);
    expect(row!.cache_write).toBe(2);
    expect(row!.total_tokens).toBe(150 + 30 + 5 + 10 + 2);
  });

  it("rewind excludes hidden assistant usage from the rollup", async () => {
    const s = await store.create({ agent: "grida" });
    const u1 = await store.appendMessage(s.id, { role: "user" });
    const a1 = await store.appendMessage(s.id, { role: "assistant" });
    await store.setMessageUsage(a1.id, { input: 100, output: 20 });
    await delay(2);
    await store.appendMessage(s.id, { role: "user" });
    const a2 = await store.appendMessage(s.id, { role: "assistant" });
    await store.setMessageUsage(a2.id, { input: 999, output: 999 });
    await store.recomputeRollups(s.id);
    expect((await store.get(s.id))!.total_tokens).toBe(100 + 20 + 999 + 999);

    // Rewinding to u1 hides a1, u2, a2 → only nothing-visible-assistant remains.
    await store.rewind(s.id, u1.id);
    expect((await store.get(s.id))!.total_tokens).toBe(0);
  });

  it("recomputeRollups counts from the compaction boundary (summarized head excluded)", async () => {
    const s = await store.create({ agent: "grida" });
    await store.appendMessage(s.id, { role: "user" });
    const a1 = await store.appendMessage(s.id, { role: "assistant" });
    // Head turn — visible after compaction, but NOT in the model's context.
    await store.setMessageUsage(a1.id, { input: 999, output: 999 });
    await delay(2);
    const u2 = await store.appendMessage(s.id, { role: "user" });
    const a2 = await store.appendMessage(s.id, { role: "assistant" });
    await store.setMessageUsage(a2.id, { input: 30, output: 10 }); // tail
    await delay(2);
    await store.appendMessage(s.id, { role: "user" });
    const a3 = await store.appendMessage(s.id, { role: "assistant" });
    await store.setMessageUsage(a3.id, { input: 20, output: 5 }); // tail
    await delay(2);
    // Compact turn 1; tail starts at u2. The marker (summary_tokens=7) sits last.
    await store.applyCompaction({
      session_id: s.id,
      summary: "S",
      tail_start_id: u2.id,
      auto: true,
      summary_tokens: 7,
    });
    // head (999+999) excluded; tail (40 + 25) + summary cost (7) = 72.
    expect((await store.get(s.id))!.total_tokens).toBe(30 + 10 + 20 + 5 + 7);
  });
});

describe("SessionsStore fork", () => {
  it("forks visible history up to the fork point into a new session", async () => {
    const parent = await store.create({
      agent: "grida",
      workspace_id: "ws1",
      model: { provider_id: "openrouter", tier: "pro" },
      metadata: { keep: "this" },
    });
    const u1 = await store.appendMessage(parent.id, { role: "user" });
    await store.upsertPart(u1.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: "first" },
    });
    await delay(2);
    const a1 = await store.appendMessage(parent.id, { role: "assistant" });
    await store.setMessageUsage(a1.id, { input: 10, output: 4 });
    await store.upsertPart(a1.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: "reply" },
    });
    await delay(2);
    const u2 = await store.appendMessage(parent.id, { role: "user" });
    await store.upsertPart(u2.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: "second" },
    });

    const fork = await store.fork({
      parent_session_id: parent.id,
      from_message_id: a1.id,
      metadata: { ephemeral: true },
    });

    expect(fork.id).not.toBe(parent.id);
    expect(fork.parent_id).toBe(parent.id);
    expect(fork.parent_message_id).toBe(a1.id);
    expect(fork.workspace_id).toBe("ws1");
    expect(fork.model).toEqual({ provider_id: "openrouter", tier: "pro" });
    expect(fork.metadata).toEqual({ keep: "this", ephemeral: true });

    // Copied: u1 + a1 (up to and including fork point). NOT u2.
    const copied = await store.listMessages(fork.id);
    expect(copied.length).toBe(2);
    expect(copied.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(copied[0].id).not.toBe(u1.id); // fresh ids
    expect((copied[0].parts[0].data as { text: string }).text).toBe("first");
    expect((copied[1].parts[0].data as { text: string }).text).toBe("reply");

    // Rollups recomputed from copied turns (only a1's usage).
    expect(fork.total_tokens).toBe(14);

    // Parent is untouched.
    expect((await store.listMessages(parent.id)).length).toBe(3);
  });

  // Title rule: docs/wg/ai/agent/session.md §Forking.
  it("derives the copy title from a titled parent", async () => {
    const parent = await store.create({
      agent: "grida",
      title: "Design the logo",
    });
    const m = await store.appendMessage(parent.id, { role: "user" });
    const fork = await store.fork({
      parent_session_id: parent.id,
      from_message_id: m.id,
    });
    expect(fork.title).toBe("Design the logo (copy)");
  });

  it("leaves a fork of an untitled parent at the default title", async () => {
    const parent = await store.create({ agent: "grida" });
    const m = await store.appendMessage(parent.id, { role: "user" });
    const fork = await store.fork({
      parent_session_id: parent.id,
      from_message_id: m.id,
    });
    expect(fork.title).toBe("New Chat");
  });

  it("fork ignores hidden messages in the parent", async () => {
    const parent = await store.create({ agent: "grida" });
    const u1 = await store.appendMessage(parent.id, { role: "user" });
    await delay(2);
    const a1 = await store.appendMessage(parent.id, { role: "assistant" });
    await delay(2);
    const u2 = await store.appendMessage(parent.id, { role: "user" });
    // Hide u2 via rewind to a1.
    await store.rewind(parent.id, a1.id);

    const fork = await store.fork({
      parent_session_id: parent.id,
      from_message_id: a1.id,
    });
    const copied = await store.listMessages(fork.id);
    expect(copied.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(copied.length).toBe(2);
    void u1;
    void u2;
  });

  it("fork throws when the fork message isn't in the parent", async () => {
    const parent = await store.create({ agent: "grida" });
    const other = await store.create({ agent: "grida" });
    const m = await store.appendMessage(other.id, { role: "user" });
    await expect(
      store.fork({ parent_session_id: parent.id, from_message_id: m.id })
    ).rejects.toThrow(/message not found/);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
