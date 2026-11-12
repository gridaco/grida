import { describe, expect, it } from "vitest";
import type { NativeChatMessage } from "@grida/desktop-bridge";
import { turn_activity } from "./turn-activity";

const read = {
  callId: "call-1",
  title: "read_file",
  kind: "read",
  outcome: "succeeded",
} as const;
const command = {
  callId: "call-2",
  title: "run_command",
  kind: "execute",
  outcome: "failed",
} as const;
const docs = {
  callId: "call-3",
  title: "mcp_docs_search",
  kind: "integration",
  source: "docs",
  outcome: "succeeded",
} as const;

function turn(id: string, answer = `Answer ${id}`): NativeChatMessage[] {
  return [
    { messageId: `${id}-ask`, role: "user", text: `Ask ${id}`, turnId: id },
    {
      messageId: `${id}-plan`,
      role: "assistant",
      text: "I'll check.",
      turnId: id,
      phase: "progress",
      activity: [read],
    },
    {
      messageId: `${id}-quiet`,
      role: "assistant",
      text: "",
      turnId: id,
      phase: "progress",
      activity: [command, docs],
    },
    {
      messageId: `${id}-answer`,
      role: "assistant",
      text: answer,
      turnId: id,
      phase: "answer",
    },
  ];
}

describe("turn_activity.group", () => {
  it("collapses each finished turn and keeps its answer outside the work", () => {
    const blocks = turn_activity.group(
      [...turn("a"), ...turn("b")],
      [
        {
          turnId: "a",
          status: "succeeded",
          startedAtMs: 0,
          settledAtMs: 9_000,
        },
        { turnId: "b", status: "succeeded", startedAtMs: 10, settledAtMs: 20 },
      ],
      null
    );
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      if (block.kind !== "turn") throw new Error("expected a turn");
      expect(block.finished).toBe(true);
      expect(block.requests.map((message) => message.role)).toEqual(["user"]);
      expect(block.answers.map((message) => message.messageId)).toEqual([
        `${block.turnId}-answer`,
      ]);
      // Commentary, then one activity line joining consecutive calls.
      expect(block.work.map((item) => item.kind)).toEqual([
        "commentary",
        "activity",
      ]);
      const line = block.work[1];
      if (line.kind !== "activity") throw new Error("expected activity");
      expect(turn_activity.describe(line.calls)).toBe(
        "Read files, ran commands, used docs integration"
      );
      expect(turn_activity.unsuccessful(line.calls)).toBe(1);
    }
    expect(blocks[0].kind === "turn" && blocks[0].durationMs).toBe(9_000);
  });

  it("keeps the current turn expanded, including while it waits for input", () => {
    const [block] = turn_activity.group(
      turn("a"),
      [{ turnId: "a", status: null, startedAtMs: 0 }],
      { turnId: "a" }
    );
    expect(block).toMatchObject({
      kind: "turn",
      finished: false,
      outcome: null,
    });
  });

  it("keeps a running turn in order, even after a resumed reply follows an answer", () => {
    const messages: NativeChatMessage[] = [
      { messageId: "ask", role: "user", text: "Ask", turnId: "a" },
      {
        messageId: "before-pause",
        role: "assistant",
        text: "Starting",
        turnId: "a",
        phase: "answer",
      },
      { messageId: "streaming", role: "assistant", text: "Again", turnId: "a" },
    ];
    const [block] = turn_activity.group(
      messages,
      [{ turnId: "a", status: null }],
      { turnId: "a" }
    );
    if (block.kind !== "turn") throw new Error("expected a turn");
    expect(block.answers).toEqual([]);
    expect(
      block.work.map((item) =>
        item.kind === "commentary" ? item.message.messageId : item.key
      )
    ).toEqual(["before-pause", "streaming"]);
  });

  it("labels stopped and failed turns and omits unrecorded durations", () => {
    expect(turn_activity.header("cancelled", 3_000)).toBe("You stopped");
    expect(turn_activity.header("failed", null)).toBe("Failed");
    expect(turn_activity.header("succeeded", null)).toBe("Worked");
    expect(turn_activity.header("uncertain", 61_000)).toBe(
      "Worked for 1m 1s · result uncertain"
    );
    expect(turn_activity.duration(9_011_000)).toBe("2h 30m 11s");
    expect(turn_activity.duration(400)).toBe("<1s");
    // A turn without its own record uses the latest snapshot outcome.
    const [block] = turn_activity.group(turn("a"), [], null, {
      turnId: "a",
      status: "failed",
    });
    expect(block).toMatchObject({
      finished: true,
      outcome: "failed",
      durationMs: null,
    });
  });

  it("never invents an answer and leaves unclassified history ungrouped", () => {
    const work = turn("a").slice(0, 3);
    const [block] = turn_activity.group(
      work,
      [{ turnId: "a", status: "cancelled" }],
      null
    );
    expect(block).toMatchObject({ kind: "turn", answers: [] });
    const legacy: NativeChatMessage[] = [
      { messageId: "u", role: "user", text: "Hi", turnId: "old" },
      { messageId: "r", role: "assistant", text: "Hello", turnId: "old" },
      { messageId: "seed", role: "assistant", text: "Inherited" },
    ];
    expect(turn_activity.group(legacy, [], null).map((b) => b.kind)).toEqual([
      "message",
      "message",
      "message",
    ]);
  });

  it("gives a recorded turn its header even when it failed before replying", () => {
    const [block] = turn_activity.group(
      [{ messageId: "ask", role: "user", text: "Try", turnId: "f" }],
      [{ turnId: "f", status: "failed", startedAtMs: 0, settledAtMs: 2_000 }],
      null
    );
    expect(block).toMatchObject({
      kind: "turn",
      finished: true,
      work: [],
      answers: [],
    });
    expect(turn_activity.header("failed", 2_000)).toBe("Failed after 2s");
  });

  it("shows no header for a finished answer-only turn unless it ended badly", () => {
    const base = { finished: true, work: [], outcome: "succeeded" } as const;
    expect(turn_activity.showsHeader(base)).toBe(false);
    for (const outcome of ["cancelled", "failed", "uncertain"] as const)
      expect(turn_activity.showsHeader({ ...base, outcome })).toBe(true);
    expect(
      turn_activity.showsHeader({
        ...base,
        work: [{ kind: "activity", key: "a", calls: [read] }],
      })
    ).toBe(true);
    expect(turn_activity.showsHeader({ ...base, finished: false })).toBe(false);
  });

  it("groups an earlier page that begins inside a turn", () => {
    const [block] = turn_activity.group(
      turn("a").slice(1),
      [{ turnId: "a", status: "succeeded", startedAtMs: 0, settledAtMs: 1 }],
      null
    );
    expect(block).toMatchObject({ kind: "turn", requests: [], finished: true });
  });
});
