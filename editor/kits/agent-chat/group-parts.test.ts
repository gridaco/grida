import { describe, expect, it } from "vitest";
import { groupMessageParts } from "./group-parts";
import type { ChatMessage } from "@/lib/agent-chat";

type Part = ChatMessage["parts"][number];

const text = (t: string) => ({ type: "text", text: t }) as Part;
const reasoning = (t: string) =>
  ({ type: "reasoning", text: t, state: "done" }) as Part;
const tool = (id: string, name: string) =>
  ({
    type: `tool-${name}`,
    toolCallId: id,
    state: "output-available",
    input: {},
    output: { ok: true },
  }) as Part;
const stepStart = () => ({ type: "step-start" }) as Part;
const msg = (...parts: Part[]) =>
  ({ id: "m", role: "assistant", parts }) as ChatMessage;

describe("groupMessageParts", () => {
  it("keeps text and tools while dropping reasoning", () => {
    const groups = groupMessageParts(
      msg(text("hi"), reasoning("thinking"), tool("1", "read_file"))
    );
    expect(groups.map((g) => g.type)).toEqual(["text", "tools"]);
  });

  it("drops reasoning-only content", () => {
    const groups = groupMessageParts(msg(reasoning("Plan: do X")));
    expect(groups).toEqual([]);
  });

  it("collapses a run of tool calls into one group", () => {
    const groups = groupMessageParts(
      msg(
        tool("1", "read_file"),
        tool("2", "read_file"),
        tool("3", "edit_file")
      )
    );
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.type).toBe("tools");
    const entries = group.type === "tools" ? group.entries : [];
    expect(entries).toHaveLength(3);
  });

  it("splits tool groups around interleaved text", () => {
    const groups = groupMessageParts(
      msg(tool("1", "read_file"), text("done"), tool("2", "edit_file"))
    );
    expect(groups.map((g) => g.type)).toEqual(["tools", "text", "tools"]);
  });

  it("drops part kinds the renderer doesn't handle", () => {
    const groups = groupMessageParts(msg(text("a"), stepStart(), text("b")));
    expect(groups.map((g) => g.type)).toEqual(["text", "text"]);
  });
});
