import { describe, expect, it } from "vitest";
import type {
  NativeChatMessage,
  NativeChatTurnRecord,
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
          : item.kind === "compaction"
            ? item.compaction.id
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
        : item.kind === "activity"
          ? {
              ...item,
              calls: item.calls.map((call) => ({
                ...call,
                outcome: "succeeded" as const,
              })),
            }
          : item
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

  it.each([
    { nextOrder: 4, expected: ["before", "compacted", "next", "tail"] },
    { nextOrder: undefined, expected: ["before", "compacted", "next", "tail"] },
    { nextOrder: 3, expected: ["before", "next", "tail", "compacted"] },
  ])(
    "anchors a compaction with incomplete replay order and a following coordinate of $nextOrder",
    ({ nextOrder, expected }) => {
      const result = turn_activity.merge(
        [
          ...turn_activity.items([
            message("before", 2),
            message("next", nextOrder),
            { ...message("tail"), activityOrderIncomplete: true },
          ]),
          {
            kind: "compaction",
            compaction: {
              id: "compacted",
              status: "succeeded",
              automatic: true,
              activityOrder: 3,
            },
          },
        ],
        events(),
        "parent"
      );
      expect(ids(result)).toEqual(expected);
      expect(result.unplaced).toEqual(events());
    }
  );

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
        item.kind === "commentary" ? item.message.messageId : item.kind
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
  it("places a failed manual compaction in the transcript", () => {
    const blocks = turn_activity.group(
      [],
      [
        {
          turnId: "manual",
          startedAtMs: 1,
          status: "failed",
          compactions: [{ id: "one", status: "failed", automatic: false }],
        },
        {
          turnId: "automatic",
          startedAtMs: 2,
          status: "failed",
          compactions: [{ id: "two", status: "failed", automatic: true }],
        },
      ],
      null
    );
    expect(blocks).toMatchObject([
      {
        kind: "compaction",
        turnId: "manual",
        compactionId: "one",
        failed: true,
      },
    ]);
  });
  it("keeps two inline markers between their tool rounds during work and on replay", () => {
    const messages: NativeChatMessage[] = [
      {
        messageId: "ask",
        turnId: "t",
        role: "user",
        text: "Check the cart.",
      },
      {
        messageId: "first-tools",
        turnId: "t",
        role: "assistant",
        text: "",
        activity: [{ ...read, activityOrder: 1 }],
      },
      {
        messageId: "next-tool",
        turnId: "t",
        role: "assistant",
        text: "",
        activity: [{ ...command, activityOrder: 3 }],
      },
      {
        messageId: "final",
        turnId: "t",
        role: "assistant",
        phase: "answer",
        activityOrder: 6,
        text: "The cart is ready.",
      },
    ];
    const record: NativeChatTurnRecord = {
      turnId: "t",
      startedAtMs: 0,
      status: null,
      compaction: { summary: "Legacy duplicate", automatic: true },
      compactions: [
        { id: "one", status: "succeeded", activityOrder: 2, automatic: true },
        { id: "two", status: "succeeded", activityOrder: 4, automatic: true },
        { id: "failed", status: "failed", activityOrder: 5, automatic: true },
      ],
    };
    const live = turn_activity.group(messages.slice(0, 3), [record], {
      turnId: "t",
    });
    const replay = turn_activity.group(
      messages,
      [{ ...record, status: "succeeded", settledAtMs: 5000 }],
      null
    );
    for (const blocks of [live, replay]) {
      expect(blocks).toHaveLength(1);
      const block = blocks[0];
      if (block.kind !== "turn") throw new Error("Expected a foreground turn");
      const timeline = turn_activity.merge(block.work, [], "t");
      expect(
        timeline.work.map((item) =>
          item.kind === "compaction"
            ? item.compaction.id
            : item.kind === "activity"
              ? item.calls[0].callId
              : item.kind
        )
      ).toEqual(["call-1", "one", "call-2", "two"]);
    }
  });

  it("keeps a legacy inline summary inside its turn's work", () => {
    const blocks = turn_activity.group(
      [
        {
          messageId: "ask",
          role: "user",
          text: "Check the cart.",
          turnId: "t",
        },
      ],
      [
        {
          turnId: "t",
          status: "succeeded",
          startedAtMs: 0,
          compaction: { summary: "Earlier work on the cart.", automatic: true },
        },
      ],
      null
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "turn",
      work: [
        {
          kind: "compaction",
          compaction: { id: "t", summary: "Earlier work on the cart." },
        },
      ],
    });
  });

  it("shows a standalone start and hides stale starts after pause or failure", () => {
    const record: NativeChatTurnRecord = {
      turnId: "compact",
      startedAtMs: 0,
      status: null,
      compactions: [{ id: "one", status: "running", automatic: true }],
    };
    const current = {
      turnId: "compact",
      disposition: "running",
      paused: false,
      cancelled: false,
    } as const;
    expect(turn_activity.compacting([record], null)).toBe(true);
    expect(turn_activity.compacting([record], current)).toBe(true);
    expect(turn_activity.compacting([record], current, current.turnId)).toBe(
      false
    );
    expect(
      turn_activity.compacting([record], { ...current, paused: true })
    ).toBe(false);
    expect(
      turn_activity.compacting([record], { ...current, cancelled: true })
    ).toBe(false);
    expect(
      turn_activity.compacting(
        [
          {
            ...record,
            compactions: [{ id: "one", status: "failed", automatic: true }],
          },
        ],
        current
      )
    ).toBe(false);
    const completed = turn_activity.group(
      [],
      [
        {
          ...record,
          status: "succeeded",
          compactions: [{ id: "one", status: "succeeded", automatic: true }],
        },
      ],
      null
    );
    expect(completed).toMatchObject([
      { kind: "compaction", turnId: "compact", compactionId: "one" },
    ]);
  });

  it("places a standalone marker before the observed next turn's first streamed message", () => {
    const records: NativeChatTurnRecord[] = [
      { turnId: "a", status: "succeeded", startedAtMs: 1 },
      {
        turnId: "compact",
        status: "succeeded",
        startedAtMs: 2,
        compactions: [{ id: "one", status: "succeeded", automatic: true }],
      },
    ];
    const messages = [...turn("a"), turn("b")[0]];
    const current = { turnId: "b", modelId: "model-b" };
    const beforePage = turn_activity.group(messages, records, current);
    const afterPage = turn_activity.group(
      messages,
      [...records, { turnId: "b", status: null, startedAtMs: 3 }],
      current
    );
    for (const blocks of [beforePage, afterPage]) {
      expect(blocks.map((block) => block.kind)).toEqual([
        "turn",
        "compaction",
        "turn",
      ]);
      expect(blocks[1]).toMatchObject({ compactionId: "one" });
      expect(blocks[2]).toMatchObject({ turnId: "b" });
    }
  });

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
      summary: "Summary.",
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

describe("transcript time dividers", () => {
  const at = (day: number, hour: number, minute: number) =>
    new Date(2026, 10, day, hour, minute).getTime();
  const records = [
    { turnId: "a", startedAtMs: at(21, 23, 0), settledAtMs: at(21, 23, 20) },
    { turnId: "b", startedAtMs: at(21, 23, 23), settledAtMs: at(21, 23, 33) },
    { turnId: "c", startedAtMs: at(21, 23, 43), settledAtMs: at(21, 23, 58) },
    { turnId: "d", startedAtMs: at(22, 0, 2) },
  ].map((record) => ({ ...record, status: "succeeded" as const }));
  const messages = records.flatMap(({ turnId }) => turn(turnId));

  it("marks a ten-minute idle gap or a new local day between turns", () => {
    const blocks = turn_activity.group(messages, records, null);
    expect(
      blocks.flatMap((block) =>
        block.kind === "turn" ? [block.timeDividerAtMs] : []
      )
    ).toEqual([undefined, undefined, at(21, 23, 43), at(22, 0, 2)]);
  });

  it("skips an incomplete opening and comparisons across a history gap", () => {
    const blocks = turn_activity.group(
      messages.slice(1),
      records,
      null,
      null,
      "c-ask"
    );
    expect(blocks[0]).not.toHaveProperty("timeDividerAtMs");
    expect(blocks[2]).not.toHaveProperty("timeDividerAtMs");
    expect(blocks[3]).toHaveProperty("timeDividerAtMs", at(22, 0, 2));
  });
});

describe("turn_activity.contextUsage", () => {
  it("uses the latest captured working window to estimate absent provider usage", () => {
    expect(
      turn_activity.contextUsage([
        {
          turnId: "a",
          status: "succeeded",
          startedAtMs: 0,
          contextTokens: 42_000,
          contextWindowTokens: 1_000_000,
        },
        {
          turnId: "b",
          status: "succeeded",
          startedAtMs: 1,
          contextWindowTokens: 272_000,
        },
      ])
    ).toEqual({ window: 272_000 });
  });

  it("keeps the foreground window for estimates after standalone compaction", () => {
    expect(
      turn_activity.contextUsage([
        {
          turnId: "a",
          status: "succeeded",
          startedAtMs: 0,
          contextTokens: 42_000,
          contextWindowTokens: 272_000,
        },
        {
          turnId: "compact",
          status: "succeeded",
          startedAtMs: 1,
          contextTokens: 512,
          compaction: { summary: "s", automatic: false },
        },
      ])
    ).toEqual({ window: 272_000 });
  });

  it("uses the latest turn's reported size and resets after a compaction", () => {
    expect(
      turn_activity.contextUsage([
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
          contextWindowTokens: 128_000,
        },
      ])
    ).toEqual({ tokens: 42_000, window: 128_000 });
    expect(
      turn_activity.contextUsage([
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
      turn_activity.contextUsage([
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
    ).toEqual({ tokens: 18_000, window: undefined });
    expect(
      turn_activity.contextUsage([
        {
          turnId: "inline",
          modelId: "fixture",
          status: "succeeded",
          startedAtMs: 0,
          contextTokens: 12_000,
          contextWindowTokens: 32_000,
          compaction: { summary: "s", automatic: true },
        },
      ])
    ).toEqual({ tokens: 12_000, window: 32_000 });
  });
});
