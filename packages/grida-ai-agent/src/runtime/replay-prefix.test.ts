import { describe, expect, it } from "vitest";
import { buildReplayPrefix } from "./replay-prefix";
import type { ChatMessageWithParts, ChatPartRow } from "../session/rows";

function msg(
  role: "user" | "assistant",
  parts: Array<Partial<ChatPartRow> & { type: string; data: unknown }>
): ChatMessageWithParts {
  return {
    id: "msgA",
    session_id: "ses_1",
    role,
    metadata: {},
    hidden_at: null,
    created_at: 1,
    updated_at: 1,
    parts: parts.map((p, i) => ({
      id: `p${i}`,
      message_id: "msgA",
      session_id: "ses_1",
      index: i,
      tool_call_id: null,
      tool_state: null,
      created_at: 1,
      updated_at: 1,
      ...p,
    })),
  };
}

function parsed(frames: string[]): Array<Record<string, unknown>> {
  return frames.map((f) => JSON.parse(f));
}

describe("buildReplayPrefix", () => {
  it("returns [] for a user tail (normal send / queue drain) and for no tail", () => {
    expect(buildReplayPrefix(undefined)).toEqual([]);
    expect(
      buildReplayPrefix(
        msg("user", [{ type: "text", data: { type: "text", text: "hi" } }])
      )
    ).toEqual([]);
  });

  it("emits `start {messageId}` FIRST — the continuation key", () => {
    const out = parsed(
      buildReplayPrefix(
        msg("assistant", [
          { type: "text", data: { type: "text", text: "hello" } },
        ])
      )
    );
    expect(out[0]).toEqual({ type: "start", messageId: "msgA" });
  });

  it("lowers text and reasoning parts to start/delta/end triplets in part order", () => {
    const out = parsed(
      buildReplayPrefix(
        msg("assistant", [
          { type: "text", data: { type: "text", text: "thinking done" } },
          { type: "reasoning", data: { type: "reasoning", text: "why" } },
        ])
      )
    );
    expect(out.map((c) => c.type)).toEqual([
      "start",
      "text-start",
      "text-delta",
      "text-end",
      "reasoning-start",
      "reasoning-delta",
      "reasoning-end",
    ]);
    expect(out[2]).toMatchObject({ delta: "thinking done" });
    // ids are stable per part, distinct across parts
    expect(out[1].id).toBe(out[2].id);
    expect(out[1].id).not.toBe(out[4].id);
  });

  it("skips empty text and unknown part types", () => {
    const out = parsed(
      buildReplayPrefix(
        msg("assistant", [
          { type: "text", data: { type: "text", text: "" } },
          { type: "wat", data: { anything: true } },
        ])
      )
    );
    expect(out).toHaveLength(1); // start only
  });

  it("re-emits file/source/data parts verbatim", () => {
    const file = {
      type: "file",
      url: "data:image/png;base64,AA==",
      mediaType: "image/png",
    };
    const dataPart = {
      type: "data-compaction",
      id: "d1",
      data: { summary: "s" },
    };
    const out = parsed(
      buildReplayPrefix(
        msg("assistant", [
          { type: "file", data: file },
          { type: "data-compaction", data: dataPart },
        ])
      )
    );
    expect(out[1]).toEqual(file);
    expect(out[2]).toEqual(dataPart);
  });

  describe("tool parts by persisted state", () => {
    const toolPart = (
      state: string,
      data: Record<string, unknown>,
      rowOverrides: Partial<ChatPartRow> = {}
    ) =>
      msg("assistant", [
        {
          type: "tool-run_command",
          tool_call_id: "tc1",
          tool_state: state,
          data: { type: "tool-run_command", state, ...data },
          ...rowOverrides,
        },
      ]);

    it("approval-requested → input-available THEN approval-request (order mandatory)", () => {
      const out = parsed(
        buildReplayPrefix(
          toolPart("approval-requested", {
            toolCallId: "tc1",
            toolName: "run_command",
            input: { command: "cp" },
            approval: { id: "ap1" },
          })
        )
      );
      expect(out.map((c) => c.type)).toEqual([
        "start",
        "tool-input-available",
        "tool-approval-request",
      ]);
      expect(out[1]).toMatchObject({
        toolCallId: "tc1",
        toolName: "run_command",
        input: { command: "cp" },
      });
      expect(out[2]).toEqual({
        type: "tool-approval-request",
        toolCallId: "tc1",
        approvalId: "ap1",
      });
    });

    it("approval-responded (the incident state) lowers to the approval-requested pair — the live turn terminalizes", () => {
      const out = parsed(
        buildReplayPrefix(
          toolPart("approval-responded", {
            toolCallId: "tc1",
            toolName: "run_command",
            input: { command: "cp", args: ["a", "b"] },
            approval: { id: "ap1", approved: true },
          })
        )
      );
      expect(out.map((c) => c.type)).toEqual([
        "start",
        "tool-input-available",
        "tool-approval-request",
      ]);
    });

    it("normalizes legacy snake_case rows (tool_call_id / tool_name mirrors)", () => {
      const out = parsed(
        buildReplayPrefix(
          toolPart("approval-requested", {
            tool_call_id: "tc1",
            tool_name: "run_command",
            input: { command: "ls" },
            approval: { id: "ap9" },
          })
        )
      );
      expect(out[1]).toMatchObject({
        type: "tool-input-available",
        toolCallId: "tc1",
        toolName: "run_command",
      });
      expect((out[1] as Record<string, unknown>).tool_call_id).toBeUndefined();
      expect(out[2]).toMatchObject({ approvalId: "ap9" });
    });

    it("output-available → input + output pair", () => {
      const out = parsed(
        buildReplayPrefix(
          toolPart("output-available", {
            toolCallId: "tc1",
            toolName: "run_command",
            input: { command: "ls" },
            output: { exit_code: 0, stdout: "ok" },
          })
        )
      );
      expect(out.map((c) => c.type)).toEqual([
        "start",
        "tool-input-available",
        "tool-output-available",
      ]);
      expect(out[2]).toMatchObject({ output: { exit_code: 0 } });
    });

    it("output-error → input + error; missing input degrades to tool-input-start", () => {
      const withInput = parsed(
        buildReplayPrefix(
          toolPart("output-error", {
            toolCallId: "tc1",
            toolName: "run_command",
            input: { command: "ls" },
            errorText: "boom",
          })
        )
      );
      expect(withInput.map((c) => c.type)).toEqual([
        "start",
        "tool-input-available",
        "tool-output-error",
      ]);
      expect(withInput[2]).toMatchObject({ errorText: "boom" });

      const noInput = parsed(
        buildReplayPrefix(
          toolPart("output-error", {
            toolCallId: "tc1",
            toolName: "run_command",
            errorText: "boom",
          })
        )
      );
      // never fabricate an input the call wasn't observed with
      expect(noInput.map((c) => c.type)).toEqual([
        "start",
        "tool-input-start",
        "tool-output-error",
      ]);
    });

    it("output-denied → input + approval-request + denied", () => {
      const out = parsed(
        buildReplayPrefix(
          toolPart("output-denied", {
            toolCallId: "tc1",
            toolName: "run_command",
            input: { command: "rm" },
            approval: { id: "ap1", approved: false },
          })
        )
      );
      expect(out.map((c) => c.type)).toEqual([
        "start",
        "tool-input-available",
        "tool-approval-request",
        "tool-output-denied",
      ]);
    });

    it("input-streaming → tool-input-start only; missing toolCallId skips the part", () => {
      const streaming = parsed(
        buildReplayPrefix(
          toolPart("input-streaming", {
            toolCallId: "tc1",
            toolName: "run_command",
          })
        )
      );
      expect(streaming.map((c) => c.type)).toEqual([
        "start",
        "tool-input-start",
      ]);

      const noId = parsed(
        buildReplayPrefix(
          msg("assistant", [
            {
              type: "tool-run_command",
              tool_call_id: null,
              tool_state: "input-available",
              data: { type: "tool-run_command", state: "input-available" },
            },
          ])
        )
      );
      expect(noId.map((c) => c.type)).toEqual(["start"]);
    });

    it("derives toolName from the part type when data omits it", () => {
      const out = parsed(
        buildReplayPrefix(
          toolPart("input-available", {
            toolCallId: "tc1",
            input: { command: "ls" },
          })
        )
      );
      expect(out[1]).toMatchObject({ toolName: "run_command" });
    });

    it("dynamic-tool parts carry dynamic:true", () => {
      const out = parsed(
        buildReplayPrefix(
          msg("assistant", [
            {
              type: "dynamic-tool",
              tool_call_id: "tc1",
              tool_state: "input-available",
              data: {
                type: "dynamic-tool",
                state: "input-available",
                toolCallId: "tc1",
                toolName: "mystery",
                input: { a: 1 },
              },
            },
          ])
        )
      );
      expect(out[1]).toMatchObject({
        type: "tool-input-available",
        toolName: "mystery",
        dynamic: true,
      });
    });
  });
});
