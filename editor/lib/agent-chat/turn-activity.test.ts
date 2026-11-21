import { describe, expect, it } from "vitest";
import type {
  NativeChatMessage,
  NativeSubagentLifecycleEvent,
} from "@grida/desktop-bridge";
import { turn_activity } from "./turn-activity";

const read = {
  callId: "call-1",
  title: "read_file",
  kind: "read",
  outcome: "succeeded",
} as const;
const command = {
  callId: "call-2",
  title: "exec_command",
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

describe("turn_activity.merge", () => {
  const message = (id: string, activityOrder?: number): NativeChatMessage => ({
    messageId: id,
    turnId: "parent",
    role: "assistant",
    text: id,
    activityOrder,
  });
  const event = (
    id: string,
    activityOrder?: number,
    extra: Partial<NativeSubagentLifecycleEvent> = {}
  ): NativeSubagentLifecycleEvent => ({
    eventId: id,
    childId: "child-a",
    childTurnId: "child-turn-a",
    inputId: "input-a",
    parentTurnId: "parent",
    name: "Researcher",
    kind: "started",
    atMs: activityOrder ?? 0,
    activityOrder,
    ...extra,
  });
  const ids = (timeline: turn_activity.Timeline) =>
    timeline.work.map((item) =>
      item.kind === "commentary"
        ? item.message.messageId
        : item.kind === "subagent"
          ? item.event.eventId
          : item.calls.map((call) => call.callId).join("+")
    );
  const work = () =>
    turn_activity.items([
      message("before", 1),
      {
        ...message("quiet"),
        text: "",
        activity: [
          { ...read, activityOrder: 3 },
          { ...command, activityOrder: 5 },
          { ...docs, activityOrder: 6 },
        ],
      },
      message("after", 9),
    ]);
  const events = () => [
    event("start-a", 2),
    event("start-b", 4, { childId: "child-b", name: "Reviewer" }),
    event("finish-a", 7, { kind: "finished", status: "succeeded" }),
    event("finish-b", 8, {
      childId: "child-b",
      kind: "finished",
      status: "succeeded",
    }),
  ];

  it("merges individual calls and two children's completed work before later parent commentary", () => {
    const result = turn_activity.merge(
      work(),
      events()
        .reverse()
        .map((event) => ({ ...event, atMs: 100 - event.activityOrder! })),
      "parent"
    );
    expect(ids(result)).toEqual([
      "before",
      "start-a",
      "call-1",
      "start-b",
      "call-2+call-3",
      "finish-a",
      "finish-b",
      "after",
    ]);
    expect(result.unplaced).toEqual([]);
  });

  it("keeps stable positions through growth, outcomes, duplicates and replay", () => {
    const initial = turn_activity.merge(work(), events().slice(0, 2), "parent");
    const updated = work().map((item) =>
      item.kind === "commentary"
        ? {
            ...item,
            message: { ...item.message, text: item.message.text + " grew" },
          }
        : {
            ...item,
            calls: item.calls.map((call) => ({
              ...call,
              outcome: "succeeded" as const,
            })),
          }
    );
    const result = turn_activity.merge(
      [...updated, updated[0]],
      [...events().reverse(), events()[0]],
      "parent"
    );
    expect(ids(result)).toEqual([
      "before",
      "start-a",
      "call-1",
      "start-b",
      "call-2+call-3",
      "finish-a",
      "finish-b",
      "after",
    ]);
    expect(ids(initial).filter((id) => !id.startsWith("finish"))).toEqual(
      ids(result).filter((id) => !id.startsWith("finish"))
    );
    expect(turn_activity.merge(updated, events(), "parent")).toEqual(result);
  });

  it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "leaves parent order untouched and child facts explicitly unplaced when a parent coordinate is %s",
    (activityOrder) => {
      const parent = turn_activity.items([
        message("first", 9),
        message("second", activityOrder),
      ]);
      const result = turn_activity.merge(parent, events(), "parent");
      expect(ids(result)).toEqual(["first", "second"]);
      expect(result.unplaced).toEqual(events());
    }
  );

  it("treats incomplete and duplicate parent positions as uncomparable", () => {
    for (const messages of [
      [
        message("first", 9),
        { ...message("second", 1), activityOrderIncomplete: true as const },
      ],
      [message("first", 9), message("second", 9)],
      [message("first", 9), message("first", 1)],
    ]) {
      const result = turn_activity.merge(
        turn_activity.items(messages),
        events(),
        "parent"
      );
      expect(result.work.every((item) => item.kind !== "subagent")).toBe(true);
      expect(result.unplaced).toEqual(events());
    }
  });

  it("places known child facts while quarantining missing, conflicting and wrong-turn facts", () => {
    const known = event("known", 2);
    const unknown = event("unknown");
    const collision = event("collision", 1);
    const wrongTurn = event("foreign", 4, { parentTurnId: "other" });
    const conflicting = [event("changed", 5), event("changed", 6)];
    const duplicateOrder = [event("same-a", 7), event("same-b", 7)];
    const result = turn_activity.merge(
      turn_activity.items([message("parent", 1)]),
      [known, unknown, collision, wrongTurn, ...conflicting, ...duplicateOrder],
      "parent"
    );
    expect(ids(result)).toEqual(["parent", "known"]);
    expect(result.unplaced.map((item) => item.eventId)).toEqual([
      "unknown",
      "collision",
      "foreign",
      "changed",
      "same-a",
      "same-b",
    ]);
  });

  it("does not require a text coordinate for a tool-only envelope", () => {
    const result = turn_activity.merge(
      turn_activity.items([
        {
          ...message("quiet"),
          text: "",
          activity: [{ ...read, activityOrder: 3 }],
        },
      ]),
      [event("start", 2)],
      "parent"
    );
    expect(ids(result)).toEqual(["start", "call-1"]);
    expect(result.unplaced).toEqual([]);
  });

  it("enriches repeated unknown facts and retains known positions when later metadata is absent", () => {
    const result = turn_activity.merge(
      turn_activity.items([
        message("first"),
        message("first", 1),
        message("first"),
      ]),
      [event("start"), event("start", 2), event("start")],
      "parent"
    );
    expect(ids(result)).toEqual(["first", "start"]);
    expect(result.unplaced).toEqual([]);
  });
});

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
      [{ turnId: "a", status: null, startedAtMs: 0 }],
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
      [{ turnId: "a", status: "cancelled", startedAtMs: 0 }],
      null
    );
    expect(block).toMatchObject({ kind: "turn", answers: [] });
    const unrecorded: NativeChatMessage[] = [
      { messageId: "u", role: "user", text: "Hi", turnId: "old" },
      { messageId: "r", role: "assistant", text: "Hello", turnId: "old" },
      { messageId: "seed", role: "assistant", text: "Inherited" },
    ];
    expect(
      turn_activity.group(unrecorded, [], null).map((b) => b.kind)
    ).toEqual(["message", "message", "message"]);
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

describe("turn_activity compaction notes", () => {
  it("places a compaction note between the turns around it", () => {
    const message = (
      id: string,
      turnId: string,
      role: "user" | "assistant"
    ) => ({
      messageId: id,
      role,
      text: id,
      turnId,
      ...(role === "assistant" && { phase: "answer" as const }),
    });
    const blocks = turn_activity.group(
      [
        message("ask-1", "t1", "user"),
        message("reply-1", "t1", "assistant"),
        message("ask-2", "t3", "user"),
        message("reply-2", "t3", "assistant"),
      ],
      [
        { turnId: "t1", status: "succeeded", startedAtMs: 0 },
        {
          turnId: "t2",
          status: "succeeded",
          startedAtMs: 0,
          compaction: { summary: "Earlier work on the cart.", automatic: true },
        },
        { turnId: "t3", status: "succeeded", startedAtMs: 0 },
      ],
      null,
      null
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      "turn",
      "compaction",
      "turn",
    ]);
    expect(blocks[1]).toMatchObject({
      summary: "Earlier work on the cart.",
      automatic: true,
    });
  });

  it("ends the transcript with a compaction after the last turn", () => {
    const blocks = turn_activity.group(
      [{ messageId: "ask", role: "user", text: "ask", turnId: "t1" }],
      [
        { turnId: "t1", status: "succeeded", startedAtMs: 0 },
        {
          turnId: "t2",
          status: "succeeded",
          startedAtMs: 0,
          compaction: { summary: "Summary.", automatic: false },
        },
      ],
      null,
      null
    );
    expect(blocks.at(-1)).toMatchObject({
      kind: "compaction",
      automatic: false,
    });
  });
});

describe("turn_activity model changes", () => {
  const recorded = (turnId: string, modelId?: string) => ({
    turnId,
    modelId,
    status: "succeeded" as const,
    startedAtMs: 0,
    settledAtMs: 1,
  });

  it("marks only adjacent turns with known, different models", () => {
    const records = [
      recorded("a", "model-a"),
      recorded("b", "model-a"),
      recorded("c", "model-b"),
      recorded("legacy"),
      recorded("d", "model-c"),
    ];
    const blocks = turn_activity.group(
      records.flatMap(({ turnId }) => turn(turnId)),
      records,
      null
    );
    expect(
      blocks.map((block) => block.kind === "turn" && block.modelChange)
    ).toEqual([
      undefined,
      undefined,
      { from: "model-a", to: "model-b" },
      undefined,
      undefined,
    ]);
  });

  it("uses the live turn's captured model before its first reply arrives", () => {
    const [first, second] = turn_activity.group(
      [...turn("a"), turn("b")[0]],
      [recorded("a", "model-a")],
      { turnId: "b", modelId: "model-b" }
    );
    expect(first).not.toHaveProperty("modelChange");
    expect(second).toMatchObject({
      kind: "turn",
      turnId: "b",
      finished: false,
      modelChange: { from: "model-a", to: "model-b" },
    });
  });

  it("only uses a snapshot's latest model for the turn it identifies", () => {
    const messages = [...turn("a"), ...turn("b")];
    const records = [recorded("a", "model-a")];
    const latest = { modelId: "model-b", status: "succeeded" as const };
    expect(
      turn_activity.group(messages, records, null, {
        ...latest,
        turnId: "c",
      })[1]
    ).not.toHaveProperty("modelChange");
    expect(
      turn_activity.group(messages, records, null, {
        ...latest,
        turnId: "b",
      })[1]
    ).toMatchObject({ modelChange: { from: "model-a", to: "model-b" } });
  });

  it("adds the boundary when the previous page becomes visible after reopening", () => {
    const first = recorded("a", "model-a");
    const latest = recorded("b", "model-b");
    expect(
      turn_activity.group(turn("b"), [latest], null)[0]
    ).not.toHaveProperty("modelChange");
    expect(
      turn_activity.group(
        [...turn("a"), ...turn("b")],
        [first, latest],
        null
      )[1]
    ).toMatchObject({ modelChange: { from: "model-a", to: "model-b" } });
  });

  it("resets model comparison only at an unconfirmed page boundary", () => {
    const blocks = turn_activity.group(
      [...turn("a"), ...turn("c"), ...turn("d")],
      [
        recorded("a", "model-a"),
        recorded("c", "model-c"),
        recorded("d", "model-d"),
      ],
      null,
      null,
      "c-ask"
    );
    expect(blocks[1]).not.toHaveProperty("modelChange");
    expect(blocks[2]).toMatchObject({
      modelChange: { from: "model-c", to: "model-d" },
    });
  });

  it("compares foreground turns around a compaction notice", () => {
    const blocks = turn_activity.group(
      [...turn("a"), ...turn("b")],
      [
        recorded("a", "model-a"),
        {
          ...recorded("compaction"),
          compaction: { summary: "Earlier context", automatic: true },
        },
        recorded("b", "model-b"),
      ],
      null
    );
    expect(blocks[1]).toMatchObject({ kind: "compaction" });
    expect(blocks[2]).toMatchObject({
      turnId: "b",
      modelChange: { from: "model-a", to: "model-b" },
    });
  });
});

describe("turn_activity.measuredContext", () => {
  it("uses the latest turn's reported size and resets after a compaction", () => {
    expect(
      turn_activity.measuredContext([
        {
          turnId: "a",
          status: "succeeded",
          startedAtMs: 0,
          contextTokens: 30_000,
        },
        {
          turnId: "b",
          status: "succeeded",
          startedAtMs: 0,
          contextTokens: 42_000,
        },
      ])
    ).toBe(42_000);
    expect(
      turn_activity.measuredContext([
        {
          turnId: "a",
          status: "succeeded",
          startedAtMs: 0,
          contextTokens: 42_000,
        },
        {
          turnId: "c",
          status: "succeeded",
          startedAtMs: 0,
          contextTokens: 872,
          compaction: { summary: "s", automatic: false },
        },
      ])
    ).toBeUndefined();
    expect(
      turn_activity.measuredContext([
        {
          turnId: "c",
          status: "succeeded",
          startedAtMs: 0,
          compaction: { summary: "s", automatic: false },
        },
        {
          turnId: "d",
          status: "succeeded",
          startedAtMs: 0,
          contextTokens: 18_000,
        },
      ])
    ).toBe(18_000);
  });
});
