import { describe, expect, it } from "vitest";
import { tool, validateUIMessages } from "ai";
import { z } from "zod";
import { buildModelMessages, type ModelUIMessage } from "./message-view";
import type { ChatMessageWithParts, ChatPartRow } from "../session/rows";

// The runtime feeds buildModelMessages output into the AI SDK's
// createAgentUIStreamResponse, which runs `validateUIMessages({ messages,
// tools })` — that is the exact call that threw in production on a tool part
// with a missing `input` ("Type validation failed for …parts[N].input").
// Validate against it (NOT convertToModelMessages, which doesn't check input)
// so these tests guard the real failure path.
const TOOLS = {
  list_files: tool({
    description: "",
    inputSchema: z.object({ path: z.string() }),
  }),
};
function validateView(out: unknown[]) {
  // Cast the whole options once: validateUIMessages's UI_MESSAGE generic ties
  // `messages` to the typed `tools`, over-constraining the call. The real
  // TOOLS object is still passed at runtime, so validation genuinely fires.
  return validateUIMessages({ messages: out, tools: TOOLS } as never);
}

let seq = 0;
function part(
  type: string,
  data: unknown,
  extra: Partial<ChatPartRow> = {}
): ChatPartRow {
  seq += 1;
  return {
    id: `p${seq}`,
    message_id: "m",
    session_id: "s",
    index: 0,
    type,
    data,
    tool_call_id: extra.tool_call_id ?? null,
    tool_state: extra.tool_state ?? null,
    created_at: seq,
    updated_at: seq,
  };
}

function msg(
  id: string,
  role: "user" | "assistant" | "system",
  parts: ChatPartRow[]
): ChatMessageWithParts {
  return {
    id,
    session_id: "s",
    role,
    metadata: {},
    hidden_at: null,
    created_at: seq++,
    updated_at: seq,
    parts,
  };
}

function textOf(m: ModelUIMessage): string {
  return m.parts.map((p) => (p as { text?: string }).text ?? "").join(" ");
}

describe("buildModelMessages", () => {
  it("passes through a normal user/assistant exchange", () => {
    const out = buildModelMessages([
      msg("m1", "user", [part("text", { type: "text", text: "hi" })]),
      msg("m2", "assistant", [part("text", { type: "text", text: "hello" })]),
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(textOf(out[0])).toContain("hi");
  });

  it("folds a compaction summary into the following user message", () => {
    const out = buildModelMessages([
      // synthetic summary lives on an assistant message…
      msg("sum", "assistant", [
        part("data-compaction", {
          type: "data-compaction",
          data: { summary: "EARLIER STUFF", tail_start_id: "u2", auto: true },
        }),
      ]),
      msg("u2", "user", [part("text", { type: "text", text: "continue" })]),
      msg("a2", "assistant", [part("text", { type: "text", text: "ok" })]),
    ]);
    // The summary is NOT its own turn; it's prepended to the user turn so
    // the model view stays user-led (Anthropic requires user-first).
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(textOf(out[0])).toContain("EARLIER STUFF");
    expect(textOf(out[0])).toContain("continue");
  });

  it("resolves a bottom summary: drops the head, reorders the summary to the front", () => {
    // New model: the marker sorts LAST. The boundary is read from tail_start_id,
    // the head before it is dropped, and the summary leads.
    const out = buildModelMessages([
      msg("h1", "user", [part("text", { type: "text", text: "old question" })]),
      msg("h2", "assistant", [
        part("text", { type: "text", text: "old answer" }),
      ]),
      msg("t1", "user", [
        part("text", { type: "text", text: "recent question" }),
      ]),
      msg("t2", "assistant", [
        part("text", { type: "text", text: "recent answer" }),
      ]),
      msg("sum", "assistant", [
        part("data-compaction", {
          type: "data-compaction",
          data: { summary: "OLD STUFF", tail_start_id: "t1", auto: true },
        }),
      ]),
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(textOf(out[0])).toContain("OLD STUFF");
    expect(textOf(out[0])).toContain("recent question");
    expect(JSON.stringify(out)).not.toContain("old question");
    expect(JSON.stringify(out)).not.toContain("old answer");
  });

  it("manual compact (null tail) emits only the summary as a leading user turn", () => {
    const out = buildModelMessages([
      msg("u1", "user", [part("text", { type: "text", text: "everything" })]),
      msg("a1", "assistant", [part("text", { type: "text", text: "done" })]),
      msg("sum", "assistant", [
        part("data-compaction", {
          type: "data-compaction",
          data: { summary: "ALL OF IT", tail_start_id: null, auto: false },
        }),
      ]),
    ]);
    expect(out.map((m) => m.role)).toEqual(["user"]);
    expect(textOf(out[0])).toContain("ALL OF IT");
    expect(JSON.stringify(out)).not.toContain("everything");
  });

  it("chained compaction resolves to the latest boundary (older summary + its head drop)", () => {
    const out = buildModelMessages([
      msg("h1", "user", [part("text", { type: "text", text: "turn one" })]),
      msg("h2", "assistant", [
        part("text", { type: "text", text: "reply one" }),
      ]),
      msg("sum1", "assistant", [
        part("data-compaction", {
          type: "data-compaction",
          data: { summary: "FIRST", tail_start_id: "h1", auto: true },
        }),
      ]),
      msg("m1", "user", [part("text", { type: "text", text: "turn two" })]),
      msg("m2", "assistant", [
        part("text", { type: "text", text: "reply two" }),
      ]),
      msg("sum2", "assistant", [
        part("data-compaction", {
          type: "data-compaction",
          data: { summary: "SECOND", tail_start_id: "m1", auto: true },
        }),
      ]),
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(textOf(out[0])).toContain("SECOND");
    expect(textOf(out[0])).toContain("turn two");
    expect(JSON.stringify(out)).not.toContain("FIRST");
    expect(JSON.stringify(out)).not.toContain("turn one");
  });

  it("drops reasoning parts", () => {
    const out = buildModelMessages([
      msg("m1", "user", [part("text", { type: "text", text: "q" })]),
      msg("m2", "assistant", [
        part("reasoning", { type: "reasoning", text: "thinking..." }),
        part("text", { type: "text", text: "answer" }),
      ]),
    ]);
    expect(out[1].parts.length).toBe(1);
    expect(textOf(out[1])).toBe("answer");
  });

  it("keeps completed tool parts, drops incomplete ones", () => {
    const out = buildModelMessages([
      msg("m1", "user", [part("text", { type: "text", text: "go" })]),
      msg("m2", "assistant", [
        part(
          "tool-read_file",
          {
            type: "tool-read_file",
            tool_call_id: "tc1",
            state: "output-available",
            input: { path: "/a" },
            output: { content: "x" },
          },
          { tool_call_id: "tc1", tool_state: "output-available" }
        ),
        part(
          "tool-read_file",
          {
            type: "tool-read_file",
            tool_call_id: "tc2",
            state: "input-available",
            input: { path: "/b" },
          },
          { tool_call_id: "tc2", tool_state: "input-available" }
        ),
      ]),
    ]);
    // Only the completed tool call survives.
    expect(out[1].parts.length).toBe(1);
    expect((out[1].parts[0] as { toolCallId: string }).toolCallId).toBe("tc1");
  });

  it("re-feeds a completed tool call with its input intact (passes validateUIMessages)", async () => {
    // The production failure (`ses_e826…`) was validateUIMessages throwing
    // `Type validation failed for messages[1].parts[0].input`. A complete tool
    // part must keep its input and pass validation.
    const out = buildModelMessages([
      msg("m1", "user", [part("text", { type: "text", text: "go" })]),
      msg("m2", "assistant", [
        part(
          "tool-list_files",
          {
            type: "tool-list_files",
            tool_call_id: "tc1",
            state: "output-available",
            input: { path: "/" },
            output: { files: ["/a.svg"] },
          },
          { tool_call_id: "tc1", tool_state: "output-available" }
        ),
      ]),
    ]);
    expect((out[1].parts[0] as { input?: unknown }).input).toEqual({
      path: "/",
    });
    await expect(validateView(out)).resolves.toBeDefined();
  });

  it("drops an input-less completed tool part that validateUIMessages would reject", async () => {
    // Mirrors the on-disk shape of `ses_e826…`: an `output-available` tool
    // part persisted WITHOUT `input`.
    const poisoned = [
      msg("m1", "user", [part("text", { type: "text", text: "go" })]),
      msg("m2", "assistant", [
        part(
          "tool-list_files",
          {
            type: "tool-list_files",
            tool_call_id: "tc1",
            state: "output-available",
            // input intentionally absent — the poisoned shape.
            output: { files: ["/a.svg"] },
          },
          { tool_call_id: "tc1", tool_state: "output-available" }
        ),
      ]),
    ];
    // Fed raw (old behavior), the bad part fails validation exactly as in prod.
    const raw = poisoned.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts.map((p) => {
        const data = p.data as Record<string, unknown>;
        const toolCallId = data.tool_call_id;
        const out = { ...data };
        delete out.tool_call_id;
        if (typeof toolCallId === "string") out.toolCallId = toolCallId;
        return out;
      }),
    }));
    await expect(validateView(raw)).rejects.toThrow(/input/i);
    // buildModelMessages drops it → the assistant turn becomes empty and is
    // omitted, and the remaining view validates clean.
    const out = buildModelMessages(poisoned);
    expect(out.map((m) => m.id)).toEqual(["m1"]);
    await expect(validateView(out)).resolves.toBeDefined();
  });

  it("skips messages that become empty after lowering", () => {
    const out = buildModelMessages([
      msg("m1", "user", [part("text", { type: "text", text: "q" })]),
      // assistant with only reasoning → dropped entirely.
      msg("m2", "assistant", [
        part("reasoning", { type: "reasoning", text: "..." }),
      ]),
    ]);
    expect(out.map((m) => m.id)).toEqual(["m1"]);
  });
});
