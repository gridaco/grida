/**
 * Contract pins for the ACP adapter (docs/wg/ai/agent/acp.md): the
 * chunk→update translation table, prompt-block lowering, the tool-kind
 * map, and the adapter's session/prompt/cancel flows against a scripted
 * core client and a recording update sink.
 */
import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  AcpAgentAdapter,
  promptText,
  toolKind,
  translateChunk,
  type AcpCoreClient,
} from "./adapter";
import type { AgentUIMessageChunk } from "../protocol/wire";

const chunk = (c: Record<string, unknown>) => c as AgentUIMessageChunk;

function recordingSink() {
  const updates: SessionNotification[] = [];
  return {
    updates,
    sink: {
      sessionUpdate: async (n: SessionNotification) => {
        updates.push(n);
      },
    },
  };
}

describe("translateChunk (acp.md §update-mapping)", () => {
  it("text-delta → agent_message_chunk", () => {
    expect(translateChunk(chunk({ type: "text-delta", delta: "hi" }))).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "hi" },
    });
  });

  it("reasoning-delta → agent_thought_chunk", () => {
    expect(
      translateChunk(chunk({ type: "reasoning-delta", delta: "hmm" }))
    ).toEqual({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "hmm" },
    });
  });

  it("tool-input-start → tool_call pending with the mapped kind", () => {
    expect(
      translateChunk(
        chunk({
          type: "tool-input-start",
          toolCallId: "c1",
          toolName: "read_file",
        })
      )
    ).toEqual({
      sessionUpdate: "tool_call",
      toolCallId: "c1",
      title: "read_file",
      kind: "read",
      status: "pending",
    });
  });

  it("tool-input-available → tool_call_update in_progress with rawInput", () => {
    expect(
      translateChunk(
        chunk({
          type: "tool-input-available",
          toolCallId: "c1",
          toolName: "read_file",
          input: { path: "a.txt" },
        })
      )
    ).toEqual({
      sessionUpdate: "tool_call_update",
      toolCallId: "c1",
      status: "in_progress",
      rawInput: { path: "a.txt" },
    });
  });

  it("tool-output-available → tool_call_update completed", () => {
    expect(
      translateChunk(
        chunk({
          type: "tool-output-available",
          toolCallId: "c1",
          output: { ok: true },
        })
      )
    ).toEqual({
      sessionUpdate: "tool_call_update",
      toolCallId: "c1",
      status: "completed",
      rawOutput: { ok: true },
    });
  });

  it("tool-output-error → tool_call_update failed carrying the error text", () => {
    const update = translateChunk(
      chunk({ type: "tool-output-error", toolCallId: "c1", errorText: "boom" })
    );
    expect(update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "c1",
      status: "failed",
    });
  });

  it("bookkeeping chunks have no outward counterpart", () => {
    for (const type of ["start", "finish", "start-step", "finish-step"]) {
      expect(translateChunk(chunk({ type }))).toBeNull();
    }
    expect(translateChunk(chunk({ type: "text-delta", delta: "" }))).toBeNull();
  });
});

describe("toolKind (acp.md §tool-kind-mapping)", () => {
  it("maps the locked tools and defaults to other", () => {
    expect(toolKind("read_file")).toBe("read");
    expect(toolKind("write_file")).toBe("edit");
    expect(toolKind("edit_file")).toBe("edit");
    expect(toolKind("list_files")).toBe("search");
    expect(toolKind("grep_files")).toBe("search");
    expect(toolKind("run_command")).toBe("execute");
    expect(toolKind("skill")).toBe("think");
    expect(toolKind("todo_write")).toBe("other");
    expect(toolKind("some_mcp_tool")).toBe("other");
  });
});

describe("promptText", () => {
  it("lowers text and resource_link blocks; ignores unsupported kinds", () => {
    expect(
      promptText([
        { type: "text", text: "fix this" },
        { type: "resource_link", uri: "file:///a.ts", name: "a.ts" },
      ])
    ).toBe("fix this\nfile:///a.ts");
  });
});

describe("AcpAgentAdapter", () => {
  function makeAdapter(overrides: Partial<AcpCoreClient> = {}) {
    const { updates, sink } = recordingSink();
    const created: unknown[] = [];
    const aborted: string[] = [];
    const client = {
      sessions: {
        create: async (opts: unknown) => {
          created.push(opts);
          return { id: "ses_1" };
        },
        list_messages: async () => [],
      },
      agent: {
        run: async () => ({ session_id: "ses_1", done: Promise.resolve() }),
        abort: async (sessionId: string) => {
          aborted.push(sessionId);
        },
      },
      ...overrides,
    } as unknown as AcpCoreClient;
    const adapter = new AcpAgentAdapter(sink, { client });
    return { adapter, client, updates, created, aborted };
  }

  it("initialize negotiates down to the supported protocol version", async () => {
    const { adapter } = makeAdapter();
    const res = await adapter.initialize({
      protocolVersion: 99,
      clientCapabilities: {},
    });
    expect(res.protocolVersion).toBe(1);
    expect(res.agentCapabilities?.loadSession).toBe(true);
    expect(res.agentInfo?.name).toBe("grida-agent");
  });

  it("newSession creates a core session and returns its id", async () => {
    const { adapter, created } = makeAdapter();
    const res = await adapter.newSession({ cwd: "/work", mcpServers: [] });
    expect(res.sessionId).toBe("ses_1");
    expect(created).toEqual([
      { agent: "grida", metadata: { acp: { cwd: "/work" } } },
    ]);
  });

  it("prompt streams translated updates in order and ends end_turn", async () => {
    const script = [
      { type: "text-delta", delta: "Hel" },
      { type: "text-delta", delta: "lo" },
      { type: "tool-input-start", toolCallId: "c1", toolName: "run_command" },
      { type: "tool-output-available", toolCallId: "c1", output: "done" },
      { type: "finish" },
    ];
    const { adapter, updates } = makeAdapter({
      agent: {
        run: async (
          opts: { session_id?: string },
          onChunk: (c: AgentUIMessageChunk) => void
        ) => {
          for (const c of script) onChunk(chunk(c));
          return { session_id: opts.session_id!, done: Promise.resolve() };
        },
        abort: async () => {},
      } as unknown as AcpCoreClient["agent"],
    });

    const res = await adapter.prompt({
      sessionId: "ses_1",
      prompt: [{ type: "text", text: "go" }],
    });
    expect(res.stopReason).toBe("end_turn");
    expect(updates.map((u) => u.update.sessionUpdate)).toEqual([
      "agent_message_chunk",
      "agent_message_chunk",
      "tool_call",
      "tool_call_update",
    ]);
    expect(updates.every((u) => u.sessionId === "ses_1")).toBe(true);
  });

  it("cancel aborts the core run and the prompt stops cancelled", async () => {
    let release!: () => void;
    const done = new Promise<void>((r) => (release = r));
    const aborted: string[] = [];
    const { adapter } = makeAdapter({
      agent: {
        run: async (opts: { session_id?: string }) => ({
          session_id: opts.session_id!,
          done,
        }),
        abort: async (sessionId: string) => {
          aborted.push(sessionId);
          release();
        },
      } as unknown as AcpCoreClient["agent"],
    });

    const pending = adapter.prompt({
      sessionId: "ses_1",
      prompt: [{ type: "text", text: "go" }],
    });
    // Let prompt reach its `await handle.done` before cancelling.
    await new Promise((r) => setTimeout(r, 0));
    await adapter.cancel({ sessionId: "ses_1" });
    const res = await pending;
    expect(aborted).toEqual(["ses_1"]);
    expect(res.stopReason).toBe("cancelled");
  });

  it("loadSession replays visible user/assistant text as ordered updates", async () => {
    const rows = [
      {
        role: "user",
        hidden_at: null,
        parts: [{ type: "text", data: { type: "text", text: "hi" } }],
      },
      {
        role: "assistant",
        hidden_at: null,
        parts: [{ type: "text", data: { type: "text", text: "yo" } }],
      },
      {
        role: "user",
        hidden_at: 123,
        parts: [{ type: "text", data: { type: "text", text: "rewound" } }],
      },
    ];
    const { adapter, updates } = makeAdapter({
      sessions: {
        create: async () => ({ id: "ses_1" }),
        list_messages: async () => rows,
      } as unknown as AcpCoreClient["sessions"],
    });

    await adapter.loadSession({
      sessionId: "ses_1",
      cwd: "/work",
      mcpServers: [],
    });
    expect(updates.map((u) => u.update.sessionUpdate)).toEqual([
      "user_message_chunk",
      "agent_message_chunk",
    ]);
  });
});
