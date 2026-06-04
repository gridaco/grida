/* eslint-disable vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openSessionsDb, type OpenedSessionsDb } from "./db";
import { SessionsStore } from "./store";
import type { ModelFactory } from "../agent";
import {
  DEFAULT_COMPACTION_CONFIG,
  compactSession,
  estimateTokens,
  pruneToolOutputs,
  resolveModelLimits,
  shouldCompact,
  splitTail,
  usableContext,
} from "./compaction";
import type { ChatMessageWithParts } from "./rows";
import type { compactor } from "./compactor";

let tempDir: string;
let opened: OpenedSessionsDb;
let store: SessionsStore;

// The injected summarizer ignores the model; pass a stub factory.
const stubFactory = (() => ({})) as unknown as ModelFactory;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-compaction-test-"));
  opened = openSessionsDb({ user_data_path: tempDir });
  store = new SessionsStore(opened);
});

afterEach(async () => {
  store.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function seedTurns(
  sessionId: string,
  n: number,
  opts: { textLen?: number; usagePerAssistant?: number } = {}
): Promise<{ userIds: string[]; assistantIds: string[] }> {
  const userIds: string[] = [];
  const assistantIds: string[] = [];
  const len = opts.textLen ?? 40;
  for (let i = 0; i < n; i += 1) {
    const u = await store.appendMessage(sessionId, { role: "user" });
    await store.upsertPart(u.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: `user message ${i} `.repeat(len) },
    });
    userIds.push(u.id);
    await delay(2);
    const a = await store.appendMessage(sessionId, { role: "assistant" });
    await store.upsertPart(a.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: `assistant reply ${i} `.repeat(len) },
    });
    if (opts.usagePerAssistant) {
      await store.setMessageUsage(a.id, { input: opts.usagePerAssistant });
    }
    assistantIds.push(a.id);
    await delay(2);
  }
  return { userIds, assistantIds };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("threshold helpers", () => {
  it("usableContext subtracts reserve, capped at output limit", () => {
    const limits = { context_window: 200_000, output_limit: 8_000 };
    const config = { ...DEFAULT_COMPACTION_CONFIG, reserve_tokens: 20_000 };
    // reserve capped at outputLimit (8k) → usable = 192k.
    expect(usableContext(limits, config)).toBe(192_000);
  });

  it("shouldCompact fires at/above usable", () => {
    const limits = { context_window: 1000, output_limit: 500 };
    const config = { ...DEFAULT_COMPACTION_CONFIG, reserve_tokens: 200 };
    // usable = 1000 - 200 = 800.
    expect(shouldCompact(799, limits, config)).toBe(false);
    expect(shouldCompact(800, limits, config)).toBe(true);
    expect(shouldCompact(900, limits, config)).toBe(true);
  });

  it("resolveModelLimits reads the catalog by tier", () => {
    const limits = resolveModelLimits({
      provider_id: "openrouter",
      tier: "nano",
    });
    expect(limits.context_window).toBeGreaterThan(0);
    expect(limits.output_limit).toBeGreaterThan(0);
  });
});

describe("splitTail", () => {
  const limits = { context_window: 1_000_000, output_limit: 100_000 };

  function fakeMsgs(
    roles: Array<"user" | "assistant">
  ): ChatMessageWithParts[] {
    return roles.map((role, i) => ({
      id: `m${i}`,
      session_id: "s",
      role,
      metadata: {},
      hidden_at: null,
      created_at: i,
      updated_at: i,
      parts: [
        {
          id: `p${i}`,
          message_id: `m${i}`,
          session_id: "s",
          index: 0,
          type: "text",
          data: { type: "text", text: "x" },
          tool_call_id: null,
          tool_state: null,
          created_at: i,
          updated_at: i,
        },
      ],
    }));
  }

  it("keeps the last N user-led turns verbatim", () => {
    const msgs = fakeMsgs([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    const split = splitTail(msgs, limits, {
      ...DEFAULT_COMPACTION_CONFIG,
      tail_turns: 2,
    });
    // 3 turns, keep last 2 → head = first turn (2 messages).
    expect(split.head.map((m) => m.id)).toEqual(["m0", "m1"]);
    expect(split.tail.map((m) => m.id)).toEqual(["m2", "m3", "m4", "m5"]);
    expect(split.tail_start!.id).toBe("m2");
    expect(split.kept_turns).toBe(2);
  });

  it("head is empty when there are fewer turns than the tail budget", () => {
    const msgs = fakeMsgs(["user", "assistant"]);
    const split = splitTail(msgs, limits, DEFAULT_COMPACTION_CONFIG);
    expect(split.head).toEqual([]);
  });

  it("drops to 1 turn when the 2-turn tail exceeds the budget", () => {
    // Tiny usable so the budget is small; big messages.
    const tinyLimits = { context_window: 1000, output_limit: 100 };
    const bigMsgs: ChatMessageWithParts[] = fakeMsgs([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
    ]).map((m) => ({
      ...m,
      parts: [
        {
          ...m.parts[0],
          data: { type: "text", text: "z".repeat(2000) },
        },
      ],
    }));
    const split = splitTail(bigMsgs, tinyLimits, {
      ...DEFAULT_COMPACTION_CONFIG,
      reserve_tokens: 100,
      tail_turns: 2,
      tail_budget_pct: 0.25,
    });
    // Over budget at 2 turns → drop to 1: tail = last user+assistant.
    expect(split.kept_turns).toBe(1);
    expect(split.tail.map((m) => m.id)).toEqual(["m4", "m5"]);
  });
});

describe("compactSession", () => {
  it("summarizes the head and appends a marker at the bottom (head stays visible)", async () => {
    const s = await store.create({
      agent: "grida",
      model: { provider_id: "openrouter", tier: "pro" },
    });
    const { userIds } = await seedTurns(s.id, 4, { usagePerAssistant: 100 });

    const summarize = vi.fn(async () => "## Goal\nDo the thing.");
    const res = await compactSession(
      { store, model_factory: stubFactory, summarize },
      {
        session_id: s.id,
        auto: true,
        config: { ...DEFAULT_COMPACTION_CONFIG, tail_turns: 2 },
      }
    );

    expect(res.compacted).toBe(true);
    if (!res.compacted) throw new Error("expected compacted");
    expect(summarize).toHaveBeenCalledOnce();
    expect(res.strategy).toBe("one-shot");
    // 4 turns, keep last 2 → head = first 2 turns = 4 messages summarized.
    expect(res.summarized_count).toBe(4);
    expect(res.tail_start_id).toBe(userIds[2]); // 3rd user message

    // The marker sorts LAST (stamped at invocation time); the head is NOT
    // hidden — the log stays linear and complete.
    const visible = await store.listVisibleMessages(s.id);
    const last = visible[visible.length - 1];
    expect(last.id).toBe(res.summary_message_id);
    const summaryPart = last.parts.find((p) => p.type === "data-compaction");
    expect(summaryPart).toBeTruthy();
    const payload = (summaryPart!.data as { data: Record<string, unknown> })
      .data;
    expect(payload.summary).toContain("Do the thing.");
    expect(payload.auto).toBe(true);
    expect(payload.tail_start_id).toBe(userIds[2]);

    // Nothing is hidden — only the read-time boundary excludes the head.
    const all = await store.listMessages(s.id);
    expect(all.filter((m) => m.hidden_at !== null).length).toBe(0);
  });

  it("manual compaction summarizes everything (no verbatim tail); auto no-ops on a short session", async () => {
    const s = await store.create({
      agent: "grida",
      model: { provider_id: "openrouter", tier: "pro" },
    });
    await seedTurns(s.id, 2);

    // Auto (rolling N=2 tail): both turns ARE the tail → nothing to compact.
    const auto = await compactSession(
      { store, model_factory: stubFactory, summarize: async () => "S" },
      { session_id: s.id, auto: true }
    );
    expect(auto.compacted).toBe(false);
    if (auto.compacted) throw new Error("unreachable");
    expect(auto.reason).toBe("nothing-to-compact");

    // Manual ("just compact"): summarize the whole conversation, keep no
    // verbatim tail → the marker lands at the bottom, model sees only the summary.
    const manual = await compactSession(
      {
        store,
        model_factory: stubFactory,
        summarize: async () => "## Goal\nX",
      },
      { session_id: s.id, auto: false }
    );
    expect(manual.compacted).toBe(true);
    if (!manual.compacted) throw new Error("expected compacted");
    expect(manual.kept_turns).toBe(0);
    expect(manual.tail_start_id).toBeNull();
    expect(manual.summarized_count).toBe(4); // both turns = 4 messages

    const visible = await store.listVisibleMessages(s.id);
    const last = visible[visible.length - 1];
    expect(last.id).toBe(manual.summary_message_id);
    const payload = (
      last.parts.find((p) => p.type === "data-compaction")!.data as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(payload.auto).toBe(false);
    expect(payload.tail_start_id).toBeNull();
    const all = await store.listMessages(s.id);
    expect(all.filter((m) => m.hidden_at !== null).length).toBe(0);
  });

  it("no-ops when there is nothing to compact", async () => {
    const s = await store.create({ agent: "grida" });
    await seedTurns(s.id, 1);
    const res = await compactSession(
      { store, model_factory: stubFactory, summarize: async () => "S" },
      { session_id: s.id, auto: true }
    );
    expect(res.compacted).toBe(false);
    if (res.compacted) throw new Error("unreachable");
    expect(res.reason).toBe("nothing-to-compact");
  });

  it("proceeds WITHOUT compaction when the summarizer keeps failing", async () => {
    const s = await store.create({
      agent: "grida",
      model: { provider_id: "openrouter", tier: "pro" },
    });
    await seedTurns(s.id, 4);
    const summarize = vi.fn(async () => {
      throw new Error("provider 5xx");
    });
    const warn = vi.fn();
    const res = await compactSession(
      { store, model_factory: stubFactory, summarize, on_warn: warn },
      {
        session_id: s.id,
        auto: true,
        config: {
          ...DEFAULT_COMPACTION_CONFIG,
          retry_on_transient: 1,
          tail_turns: 2,
        },
      }
    );
    expect(res.compacted).toBe(false);
    if (res.compacted) throw new Error("unreachable");
    expect(res.reason).toBe("summarizer-failed");
    // initial + 1 retry = 2 calls.
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    // Nothing hidden — the conversation is intact.
    const all = await store.listMessages(s.id);
    expect(all.every((m) => m.hidden_at === null)).toBe(true);
  });

  it("uses smart recovery (drop-middle/chunked/pruned) when the head exceeds the cap", async () => {
    const s = await store.create({
      agent: "grida",
      model: { provider_id: "openrouter", tier: "pro" },
    });
    await seedTurns(s.id, 8, { textLen: 60 });
    const summarize = vi.fn(async () => "RECOVERED SUMMARY");
    const res = await compactSession(
      { store, model_factory: stubFactory, summarize },
      {
        session_id: s.id,
        auto: true,
        // Force the spec-limit path with a tiny cap.
        summarizer_input_cap: 50,
        config: {
          ...DEFAULT_COMPACTION_CONFIG,
          tail_turns: 2,
          smart_recovery: {
            prune_tool_outputs: false,
            chunked_summarize: true,
            drop_middle: true,
          },
        },
      }
    );
    expect(res.compacted).toBe(true);
    if (!res.compacted) throw new Error("expected compacted");
    expect(["chunked", "drop-middle", "pruned"]).toContain(res.strategy);
    expect(summarize).toHaveBeenCalled();
  });

  it("folds a prior summary into a chained compaction", async () => {
    const s = await store.create({
      agent: "grida",
      model: { provider_id: "openrouter", tier: "pro" },
    });
    // First compaction.
    await seedTurns(s.id, 4);
    await compactSession(
      {
        store,
        model_factory: stubFactory,
        summarize: async () => "FIRST SUMMARY",
      },
      {
        session_id: s.id,
        auto: true,
        config: { ...DEFAULT_COMPACTION_CONFIG, tail_turns: 1 },
      }
    );
    // Add more turns, compact again — the summarizer should see the prior summary.
    await seedTurns(s.id, 3);
    const summarize = vi.fn(
      (_opts: compactor.SummarizeOptions): Promise<string> =>
        Promise.resolve("SECOND SUMMARY")
    );
    await compactSession(
      { store, model_factory: stubFactory, summarize },
      {
        session_id: s.id,
        auto: true,
        config: { ...DEFAULT_COMPACTION_CONFIG, tail_turns: 1 },
      }
    );
    expect(summarize).toHaveBeenCalled();
    expect(summarize.mock.calls[0]?.[0]?.prior_summary).toBe("FIRST SUMMARY");
  });
});

describe("pruneToolOutputs", () => {
  it("prunes old large tool outputs, keeps the recent ones intact", async () => {
    const s = await store.create({ agent: "grida" });
    await store.appendMessage(s.id, { role: "user" });
    const a = await store.appendMessage(s.id, { role: "assistant" });
    const bigOutput = {
      files: Array.from({ length: 200 }, (_, i) => `f${i}.ts`),
    };
    // 8 completed tool calls; keepRecent=5 → 3 oldest prunable.
    for (let i = 0; i < 8; i += 1) {
      await store.upsertPart(a.id, {
        index: i,
        type: "tool-list_files",
        data: {
          type: "tool-list_files",
          tool_name: "list_files",
          state: "output-available",
          input: {},
          output: bigOutput,
        },
        tool_call_id: `tc-${i}`,
        tool_state: "output-available",
      });
    }
    const res = await pruneToolOutputs(store, {
      session_id: s.id,
      keep_recent: 5,
      min_chars: 100,
    });
    expect(res.pruned_count).toBe(3);

    const visible = await store.listVisibleMessages(s.id);
    const toolParts = visible
      .flatMap((m) => m.parts)
      .filter((p) => p.tool_call_id !== null)
      .sort((x, y) => x.index - y.index);
    const pruned = toolParts.filter(
      (p) => (p.data as { output?: { pruned?: boolean } }).output?.pruned
    );
    expect(pruned.length).toBe(3);
    // The 5 most recent keep their real output.
    const intact = toolParts.slice(toolParts.length - 5);
    for (const p of intact) {
      expect(
        (p.data as { output?: { pruned?: boolean } }).output?.pruned
      ).toBeFalsy();
    }
  });
});

describe("estimateTokens", () => {
  it("approximates chars/4", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});
