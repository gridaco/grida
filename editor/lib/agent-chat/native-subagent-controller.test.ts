import type {
  NativeChatObservation,
  NativeSubagentClient,
  NativeSubagentObservation,
  NativeSubagentWork,
  NativeSubagentConversation,
  NativeSubagentActivityPage,
} from "@grida/desktop-bridge";
import { afterEach, expect, it, vi } from "vitest";
import { NativeSubagentController } from "./native-subagent-controller";
import { NativeActivityFixtures } from "@/scaffolds/desktop/workbench/native-agent-activity.fixtures";

const disposals: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  vi.useRealTimers();
});
async function activityFixture(modern = true) {
  const fixture = await NativeActivityFixtures.create(modern);
  disposals.push(fixture.dispose);
  return fixture;
}

const parent: NativeChatObservation = {
  observationId: "parent-observation",
  snapshot: {
    sessionId: "parent",
    sessionRevision: 2,
    queuedInputs: 0,
    admissionPaused: false,
    current: null,
    latest: {
      turnId: "sponsor",
      epoch: 1,
      historyPosition: 1,
      journalPosition: 1,
      controlRevision: 0,
      paused: false,
      cancelled: false,
      disposition: "settled",
      status: "succeeded",
    },
  },
};

function observed(
  childId: string,
  assignment: NativeSubagentWork | null = null
): NativeSubagentObservation {
  return {
    child: {
      childId,
      name: childId,
      workTurns: 2,
      reserved: assignment?.turn ? 1 : 0,
      admissionPaused: false,
      queuedInputIds:
        assignment && !assignment.turn ? [assignment.inputId] : [],
      current:
        assignment?.turn?.disposition === "running" ? assignment.turn : null,
      assignment,
    },
    stopObservationId:
      assignment?.turn?.disposition === "running" ? "stop-exact" : null,
  };
}

it("retries a steering receipt with its original child and text after observation changes", async () => {
  const work: NativeSubagentWork = {
    inputId: "review",
    parentTurnId: "sponsor",
    instructionPreview: "Compare both drafts.",
    instructionTruncated: false,
    disposition: "claimed",
    turn: {
      turnId: "child-turn",
      disposition: "running",
      status: null,
      paused: false,
      cancelled: false,
    },
    result: null,
  };
  let token = "before-steer";
  const control =
    vi.fn<NonNullable<NativeSubagentClient["controlSubagentTurn"]>>();
  control.mockImplementationOnce(async () => {
    token = "after-steer";
    throw new Error("native_chat_subagent_unverified");
  });
  control.mockResolvedValue(undefined);
  const controller = new NativeSubagentController(
    {
      listSubagents: async () => ({
        children: [{ childId: "child", name: "Reviewer" }],
        nextAfterChildId: null,
      }),
      inspectSubagent: async () => ({
        ...observed("child", work),
        stopObservationId: token,
        turnControls: ["pause", "steer"],
      }),
      createSubagent: vi.fn<NativeSubagentClient["createSubagent"]>(),
      assignSubagent: vi.fn<NativeSubagentClient["assignSubagent"]>(),
      stopSubagent: vi.fn<NativeSubagentClient["stopSubagent"]>(),
      controlSubagentTurn: control,
    },
    "parent-attachment",
    () => parent
  );
  try {
    controller.toggle();
    await vi.waitFor(() =>
      expect(controller.turnControls).toEqual(["pause", "steer"])
    );
    const steering = {
      kind: "steer",
      instructions: "Use the newest draft.",
    } as const;
    expect(await controller.controlTurn(steering)).toBe(false);
    expect(controller.read().observation?.stopObservationId).toBe(
      "after-steer"
    );
    expect(controller.canRetryTurnControl).toBe(true);
    expect(await controller.controlTurn({ kind: "pause" })).toBe(false);
    expect(await controller.retryTurnControl()).toBe(true);
    expect(control.mock.calls).toEqual([
      ["parent-attachment", "before-steer", expect.any(String), steering],
      control.mock.calls[0],
    ]);
    expect(controller.canRetryTurnControl).toBe(false);
  } finally {
    controller.dispose();
  }
});

it("retries the exact named child and assignment on their parent, then stops the displayed turn", async () => {
  let created = false;
  let parentBasis = parent;
  let work: NativeSubagentWork | null = null;
  const create = vi.fn<NativeSubagentClient["createSubagent"]>();
  create.mockRejectedValueOnce(new Error("acknowledgement lost"));
  create.mockImplementation(async () => {
    created = true;
    return { childId: "child", name: "Researcher" };
  });
  const assign = vi.fn<NativeSubagentClient["assignSubagent"]>();
  assign.mockRejectedValueOnce(new Error("subagent_sponsor_requires_act"));
  assign.mockRejectedValueOnce(new Error("acknowledgement lost"));
  assign.mockImplementation(
    async (_attachment, input) =>
      (work = {
        inputId: input.inputId,
        parentTurnId: "sponsor",
        instructionPreview: input.instructions,
        instructionTruncated: false,
        disposition: "claimed",
        turn: {
          turnId: "child-turn",
          disposition: "running",
          status: null,
          paused: false,
          cancelled: false,
        },
        result: null,
      })
  );
  const stop = vi
    .fn<NativeSubagentClient["stopSubagent"]>()
    .mockImplementation(async () => {
      if (work?.turn)
        work = {
          ...work,
          disposition: "completed",
          turn: {
            ...work.turn,
            disposition: "settled",
            status: "cancelled",
            cancelled: true,
          },
          result: {
            turnId: work.turn.turnId,
            status: "cancelled",
            text: "Stopped.",
            textTruncated: false,
          },
        };
    });
  const inspect = vi
    .fn<NativeSubagentClient["inspectSubagent"]>()
    .mockImplementation(async (_attachment, childId) =>
      observed(childId, work)
    );
  const controller = new NativeSubagentController(
    {
      listSubagents: async () => ({
        children: created ? [{ childId: "child", name: "Researcher" }] : [],
        nextAfterChildId: null,
      }),
      inspectSubagent: inspect,
      createSubagent: create,
      assignSubagent: assign,
      stopSubagent: stop,
    },
    "parent-attachment",
    () => parentBasis
  );
  controller.toggle();
  await vi.waitFor(() => expect(controller.read().listing).toBe(false));
  expect(await controller.create("Researcher", 2)).toBe(false);
  expect(await controller.create("Researcher", 2)).toBe(true);
  expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  expect(create.mock.calls[0]?.[0]).toBe("parent-attachment");
  expect(await controller.assign("Review the spacing.")).toBe(false);
  expect(controller.read().error).toContain("Finish an Act turn");
  parentBasis = { ...parent, observationId: "act-sponsor-observation" };
  expect(await controller.assign("Review the spacing.")).toBe(false);
  expect(await controller.assign("Review the spacing.")).toBe(true);
  expect(assign.mock.calls[1]).toEqual(assign.mock.calls[2]);
  const accepted = assign.mock.calls[1]?.[1];
  expect(accepted?.inputId).not.toBe(assign.mock.calls[0]?.[1].inputId);
  expect(accepted).toMatchObject({
    childId: "child",
    parentObservationId: "act-sponsor-observation",
    instructions: "Review the spacing.",
  });
  expect(inspect).toHaveBeenLastCalledWith(
    "parent-attachment",
    "child",
    accepted?.inputId
  );
  expect(await controller.stop()).toBe(true);
  expect(stop).toHaveBeenCalledWith(
    "parent-attachment",
    "stop-exact",
    expect.any(String)
  );
  expect(controller.read().observation?.child.assignment?.result?.status).toBe(
    "cancelled"
  );
  controller.dispose();
});

it("keeps a late assignment read out of a different selected child and closes without stopping work", async () => {
  const first = Promise.withResolvers<NativeSubagentObservation>();
  let delay = false;
  const stop = vi.fn<NativeSubagentClient["stopSubagent"]>();
  const controller = new NativeSubagentController(
    {
      listSubagents: async () => ({
        children: [
          { childId: "a", name: "A" },
          { childId: "b", name: "B" },
        ],
        nextAfterChildId: null,
      }),
      inspectSubagent: async (_attachment, childId) =>
        delay && childId === "a" ? first.promise : observed(childId),
      createSubagent: vi.fn<NativeSubagentClient["createSubagent"]>(),
      assignSubagent: vi.fn<NativeSubagentClient["assignSubagent"]>(),
      stopSubagent: stop,
    },
    "parent-attachment",
    () => parent
  );
  controller.toggle();
  await vi.waitFor(() =>
    expect(controller.read().observation?.child.childId).toBe("a")
  );
  delay = true;
  const stale = controller.select("a", "old-input");
  await controller.select("b");
  first.resolve(observed("a"));
  await stale;
  expect(controller.read().observation?.child.childId).toBe("b");
  controller.toggle();
  expect(controller.read().observation).toBeNull();
  expect(stop).not.toHaveBeenCalled();
  controller.dispose();
});

it("withdraws only the selected queued assignment and retries without refreshing its basis", async () => {
  const control =
    vi.fn<NonNullable<NativeSubagentClient["controlSubagentChild"]>>();
  let basis = "held-queue";
  control.mockImplementationOnce(async () => {
    basis = "new-queue";
    throw new Error("native_chat_subagent_unverified");
  });
  control.mockResolvedValue(undefined);
  const controller = new NativeSubagentController(
    {
      listSubagents: async () => ({
        children: [
          { childId: "child", name: "Child" },
          { childId: "other", name: "Other" },
        ],
        nextAfterChildId: null,
      }),
      inspectSubagent: async (_, childId) => ({
        ...observed(childId),
        child: {
          ...observed(childId).child,
          admissionPaused: true,
          queuedInputIds: ["first", "second"],
        },
        childControls: {
          observationId: basis,
          available: ["message", "withdraw", "resume-queue"],
          pendingMessages: 1,
        },
      }),
      createSubagent: vi.fn<NativeSubagentClient["createSubagent"]>(),
      assignSubagent: vi.fn<NativeSubagentClient["assignSubagent"]>(),
      stopSubagent: vi.fn<NativeSubagentClient["stopSubagent"]>(),
      controlSubagentChild: control,
    },
    "attachment",
    () => parent
  );
  try {
    controller.toggle();
    await vi.waitFor(() => expect(controller.read().selected).toBe("child"));
    await controller.select("child", "first");
    await expect(
      controller.controlChild({ kind: "withdraw", inputId: "second" })
    ).resolves.toBe(false);
    expect(control).not.toHaveBeenCalled();
    const withdraw = { kind: "withdraw", inputId: "first" } as const;
    await expect(controller.controlChild(withdraw)).resolves.toBe(false);
    expect(controller.read().observation?.childControls?.observationId).toBe(
      "new-queue"
    );
    expect(controller.retryableChildControl).toBe("withdraw");
    expect(controller.childControls).toEqual([]);
    await controller.select("other");
    await expect(controller.retryChildControl()).resolves.toBe(false);
    await controller.select("child", "second");
    await expect(controller.retryChildControl()).resolves.toBe(true);
    expect(control.mock.calls[0]).toEqual(control.mock.calls[1]);
    expect(control.mock.calls[1]).toEqual([
      "attachment",
      "held-queue",
      expect.any(String),
      withdraw,
    ]);
    expect(controller.childControls).toEqual([
      "message",
      "withdraw",
      "resume-queue",
    ]);
  } finally {
    controller.dispose();
  }
});

it("observes parent lifecycle activity before the panel opens without inspecting every child", async () => {
  const fixture = await activityFixture();
  expect(fixture.controller.read()).toMatchObject({
    open: false,
    activityAvailable: true,
    events: [{ eventId: "review-start" }, { eventId: "review-finish" }],
  });
  expect(fixture.calls.inspect).toEqual([]);
  expect(fixture.calls.conversations).toEqual([]);
  expect(fixture.calls.activity).toEqual([undefined]);
});

it("uses worker availability rather than preload method presence for rich observation", async () => {
  const fixture = await activityFixture(false);
  fixture.controller.show();
  await vi.waitFor(() =>
    expect(fixture.controller.read().children).toHaveLength(2)
  );
  expect(fixture.controller.read().activityAvailable).toBe(false);
  expect(fixture.calls.activity).toEqual([]);
  await fixture.controller.openChild("done-child");
  expect(
    fixture.controller.read().observation?.child.assignment?.result?.text
  ).toBe("A bounded result preview.");
  expect(fixture.calls.conversations).toEqual([]);
});

it("deduplicates lifecycle snapshots while retaining each event's known native position", async () => {
  const fixture = await activityFixture();
  fixture.data.activity = {
    ...fixture.data.activity,
    orderComplete: false,
    events: fixture.data.activity.events.map((event, index) => ({
      ...event,
      activityOrder: index + 2,
    })),
  };
  fixture.controller.show();
  await vi.waitFor(() => expect(fixture.controller.read().listing).toBe(false));
  await fixture.controller.list();
  expect(
    fixture.controller.read().events.map((event) => event.activityOrder)
  ).toEqual([2, 3]);
  fixture.data.activity = {
    ...fixture.data.activity,
    events: [...fixture.data.activity.events]
      .reverse()
      .map(({ activityOrder: _order, ...event }) => event),
  };
  await fixture.controller.list();
  expect(
    fixture.controller.read().events.map((event) => event.activityOrder)
  ).toEqual([2, 3]);
  expect(fixture.controller.read().events).toHaveLength(2);
  fixture.data.activity = {
    ...fixture.data.activity,
    events: fixture.data.activity.events.map((event) => ({
      ...event,
      activityOrder: 99,
    })),
  };
  await fixture.controller.list();
  expect(
    fixture.controller.read().events.map((event) => event.activityOrder)
  ).toEqual([2, 3]);
});

it("replaces actual live output by identity, merges earlier pages and retains captured execution", async () => {
  const fixture = await activityFixture();
  const childId = "working-child";
  fixture.data.conversations.set(childId, {
    ...NativeActivityFixtures.conversation(childId, true),
    older: "older-page",
  });
  await fixture.controller.openChild(childId);
  expect(fixture.controller.read().conversation?.messages.at(-1)?.live).toBe(
    true
  );
  const current = fixture.data.conversations.get(childId)!;
  const old: NativeSubagentConversation = {
    ...current,
    view: 1,
    messages: [
      { messageId: "earlier-request", role: "user", text: "Earlier question." },
      current.messages[0],
    ],
    turns: [],
    older: null,
  };
  vi.spyOn(fixture.client, "subagentConversation").mockResolvedValueOnce(old);
  await fixture.controller.readConversation(true);
  expect(
    fixture.controller
      .read()
      .conversation?.messages.map((message) => message.messageId)
  ).toEqual(["earlier-request", `${childId}-request`, `${childId}-live`]);
  fixture.data.conversations.set(
    childId,
    NativeActivityFixtures.conversation(childId)
  );
  await fixture.controller.readConversation();
  await fixture.controller.readConversation();
  expect(
    fixture.controller
      .read()
      .conversation?.messages.map((message) => message.messageId)
  ).toEqual(["earlier-request", `${childId}-request`, `${childId}-answer`]);
  expect(fixture.controller.read().conversation?.execution).toEqual({
    model: "captured-model",
    effort: "high",
  });
  expect(fixture.controller.read().conversation?.turns[0].execution).toEqual({
    model: "captured-model",
    effort: "high",
  });
  expect(fixture.controller.read().conversation?.older).toBeNull();
});

it("rejects delayed conversation replies after selecting another child or closing its viewer", async () => {
  const fixture = await activityFixture();
  const pending = Promise.withResolvers<NativeSubagentConversation>();
  const read = vi.spyOn(fixture.client, "subagentConversation");
  read.mockImplementationOnce(() => pending.promise);
  const first = fixture.controller.openChild("working-child");
  await fixture.controller.openChild("done-child");
  pending.resolve(NativeActivityFixtures.conversation("working-child", true));
  await first;
  expect(fixture.controller.read().conversation?.childId).toBe("done-child");
  const closed = Promise.withResolvers<NativeSubagentConversation>();
  read.mockImplementationOnce(() => closed.promise);
  const request = fixture.controller.readConversation();
  fixture.controller.toggle();
  closed.resolve(NativeActivityFixtures.conversation("working-child"));
  await request;
  expect(fixture.controller.read().open).toBe(false);
  expect(fixture.controller.read().conversation?.childId).toBe("done-child");
  expect(fixture.calls.stop).toEqual([]);
});

it("retains a readable conversation after a transient error and reconnects without replay duplicates", async () => {
  const fixture = await activityFixture();
  await fixture.controller.openChild("working-child");
  vi.spyOn(fixture.client, "subagentConversation").mockRejectedValueOnce(
    new Error("connection_lost")
  );
  await fixture.controller.readConversation();
  expect(fixture.controller.read().conversationError).toContain(
    "Retry to reconnect"
  );
  expect(fixture.controller.read().conversation?.messages.at(-1)?.text).toBe(
    "I am comparing the evidence."
  );
  await fixture.controller.readConversation();
  expect(fixture.controller.read().conversationError).toBeNull();
  expect(fixture.controller.read().conversation?.messages).toHaveLength(2);
});

it("keeps paged history and the continuation after refreshing the first page", async () => {
  const fixture = await activityFixture();
  const overview = vi.spyOn(fixture.client, "subagentActivity");
  const base = fixture.data.activity;
  const page = (
    childId: string,
    nextAfterChildId: string | null
  ): NativeSubagentActivityPage => ({
    ...base,
    children: [{ ...base.children[1], childId }],
    counts: { active: 1, done: 64, complete: true },
    events: [],
    nextAfterChildId,
  });
  overview.mockResolvedValueOnce(page("one", "cursor-one"));
  fixture.controller.show();
  await vi.waitFor(() =>
    expect(fixture.controller.read().next).toBe("cursor-one")
  );
  overview.mockResolvedValueOnce(page("two", "cursor-two"));
  await fixture.controller.list(true);
  overview.mockImplementation(async (_attachment, after) =>
    after === "cursor-one"
      ? page("two", "cursor-two")
      : page("one", "cursor-one")
  );
  await fixture.controller.list();
  expect(fixture.controller.read().next).toBe("cursor-two");
  expect(
    fixture.controller.read().summaries.map((child) => child.childId)
  ).toEqual(["one", "two"]);
  expect(fixture.controller.read().eventsComplete).toBe(false);
  expect(overview).toHaveBeenCalledWith("parent-attachment", "cursor-one");
});

it("closes selected live observation without stopping work and disposes all parent timers", async () => {
  vi.useFakeTimers();
  const fixture = await activityFixture();
  await fixture.controller.openChild("working-child");
  await vi.advanceTimersByTimeAsync(650);
  const before = fixture.calls.conversations.length;
  fixture.controller.toggle();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(fixture.calls.conversations).toHaveLength(before);
  expect(fixture.calls.activity.length).toBeGreaterThan(1);
  expect(fixture.calls.stop).toEqual([]);
  fixture.dispose();
  const requests = [...fixture.calls.activity];
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fixture.calls.activity).toEqual(requests);
});

it("does not let delayed create or assignment acknowledgements replace another child selection", async () => {
  const fixture = await activityFixture();
  fixture.controller.show();
  const create = Promise.withResolvers<{ childId: string; name: string }>();
  vi.spyOn(fixture.client, "createSubagent").mockImplementationOnce(
    () => create.promise
  );
  const pendingCreate = fixture.controller.create("Another child", 2);
  await fixture.controller.openChild("done-child");
  create.resolve({ childId: "new-child", name: "Another child" });
  await pendingCreate;
  expect(fixture.controller.read().selected).toBe("done-child");
  const assigned = Promise.withResolvers<NativeSubagentWork>();
  vi.spyOn(fixture.client, "assignSubagent").mockImplementationOnce(
    () => assigned.promise
  );
  const assignment = fixture.controller.assign("Review the old contract.");
  await fixture.controller.openChild("working-child");
  assigned.resolve({
    inputId: "other-input",
    parentTurnId: "parent-turn",
    instructionPreview: "Review",
    instructionTruncated: false,
    disposition: "queued",
    turn: null,
    result: null,
  });
  await assignment;
  expect(fixture.controller.read()).toMatchObject({
    selected: "working-child",
    input: null,
  });
});

it("retains uncertain controls and Stops separately for each child", async () => {
  const fixture = await activityFixture();
  fixture.data.conversations.set(
    "done-child",
    NativeActivityFixtures.conversation("done-child", true)
  );
  const controls = vi.spyOn(fixture.client, "controlSubagentTurn");
  controls.mockRejectedValueOnce(new Error("native_chat_subagent_unverified"));
  await fixture.controller.openChild("working-child");
  await expect(fixture.controller.controlTurn({ kind: "pause" })).resolves.toBe(
    false
  );
  await fixture.controller.openChild("done-child");
  await expect(fixture.controller.controlTurn({ kind: "pause" })).resolves.toBe(
    true
  );
  await fixture.controller.openChild("working-child");
  expect(fixture.controller.canRetryTurnControl).toBe(true);
  await expect(fixture.controller.retryTurnControl()).resolves.toBe(true);
  expect(controls.mock.calls[0]).toEqual(controls.mock.calls[2]);
  const stop = vi.spyOn(fixture.client, "stopSubagent");
  stop.mockRejectedValueOnce(new Error("reply_lost"));
  await expect(fixture.controller.stop()).resolves.toBe(false);
  await fixture.controller.openChild("done-child");
  await expect(fixture.controller.stop()).resolves.toBe(true);
  await fixture.controller.openChild("working-child");
  await expect(fixture.controller.stop()).resolves.toBe(true);
  expect(stop.mock.calls[0]).toEqual(stop.mock.calls[2]);
});

it("uses the latest page's causal order when committed messages move around live output", async () => {
  const fixture = await activityFixture();
  const page = NativeActivityFixtures.conversation("working-child", true);
  const first = page.messages[0];
  const second = {
    ...first,
    messageId: "second-request",
    text: "Use the updated evidence.",
  };
  fixture.data.conversations.set("working-child", {
    ...page,
    messages: [first, second, page.messages[1]],
  });
  await fixture.controller.openChild("working-child");
  const answer = {
    ...page.messages[1],
    messageId: "committed-answer",
    text: "The first findings.",
    live: undefined,
    phase: "answer" as const,
  };
  fixture.data.conversations.set("working-child", {
    ...page,
    messages: [first, answer, second],
  });
  await fixture.controller.readConversation();
  expect(
    fixture.controller
      .read()
      .conversation?.messages.map((message) => message.messageId)
  ).toEqual([first.messageId, "committed-answer", "second-request"]);
});

it("refreshes loaded later pages while closed so a finished child does not stay Active forever", async () => {
  vi.useFakeTimers();
  const fixture = await activityFixture();
  const base = fixture.data.activity;
  let finished = false;
  vi.spyOn(fixture.client, "subagentActivity").mockImplementation(
    async (_attachment, after) => ({
      ...base,
      children: after
        ? [
            {
              ...base.children[0],
              ...(finished && {
                section: "done" as const,
                status: "succeeded" as const,
              }),
            },
          ]
        : [base.children[1]],
      counts: finished ? { active: 0, done: 2, complete: true } : base.counts,
      events:
        after && finished
          ? [
              {
                ...base.events[1],
                eventId: "later-page-finish",
                childId: "working-child",
              },
            ]
          : [],
      nextAfterChildId: after ? null : "later-page",
    })
  );
  fixture.controller.show();
  await Promise.resolve();
  await fixture.controller.list(true);
  expect(
    fixture.controller
      .read()
      .summaries.find((child) => child.childId === "working-child")?.section
  ).toBe("active");
  fixture.controller.toggle();
  finished = true;
  await vi.advanceTimersByTimeAsync(2_000);
  expect(
    fixture.controller
      .read()
      .summaries.find((child) => child.childId === "working-child")?.section
  ).toBe("done");
  expect(
    fixture.controller.read().events.map((event) => event.eventId)
  ).toContain("later-page-finish");
  expect(fixture.controller.read().open).toBe(false);
});

it("pages beyond the bounded visible window and refreshes at most sixteen loaded catalog pages", async () => {
  const fixture = await activityFixture();
  const base = fixture.data.activity;
  const overview = vi.spyOn(fixture.client, "subagentActivity");
  overview.mockImplementation(async (_attachment, after) => {
    const page = Number(after ?? 0);
    return {
      ...base,
      children: Array.from({ length: 32 }, (_, index) => ({
        ...base.children[1],
        childId: `page-${page}-child-${index}`,
      })),
      counts: { active: 0, done: 1_000, complete: false },
      events: [],
      nextAfterChildId: String(page + 1),
    };
  });
  fixture.controller.show();
  await Promise.resolve();
  for (let index = 0; index < 18; index++) await fixture.controller.list(true);
  expect(fixture.controller.read().summaries).toHaveLength(512);
  expect(fixture.controller.read().next).toBe("19");
  const before = overview.mock.calls.length;
  await fixture.controller.list();
  expect(overview.mock.calls.length - before).toBe(16);
  expect(
    fixture.controller
      .read()
      .summaries.some((child) => child.childId === "page-18-child-0")
  ).toBe(true);
  expect(fixture.controller.read().eventsComplete).toBe(false);
});

it("refuses additional uncertain controls at the bound without dropping an earlier retry identity", async () => {
  const fixture = await activityFixture();
  const control = vi.spyOn(fixture.client, "controlSubagentTurn");
  control.mockRejectedValue(new Error("native_chat_subagent_unverified"));
  const results: boolean[] = [];
  for (let index = 0; index < 17; index++) {
    const childId = `uncertain-${index}`;
    fixture.data.conversations.set(
      childId,
      NativeActivityFixtures.conversation(childId, true)
    );
    await fixture.controller.openChild(childId);
    results.push(await fixture.controller.controlTurn({ kind: "pause" }));
  }
  expect(results).toEqual(Array.from({ length: 17 }, () => false));
  expect(control).toHaveBeenCalledTimes(16);
  expect(fixture.controller.read().error).toContain(
    "Resolve earlier unconfirmed"
  );
  await fixture.controller.openChild("uncertain-0");
  control.mockResolvedValueOnce(undefined);
  await expect(fixture.controller.retryTurnControl()).resolves.toBe(true);
  expect(control.mock.calls[0]).toEqual(control.mock.calls[16]);
});

it("discovers later child work on an idle parent after every child finished and the panel closed", async () => {
  vi.useFakeTimers();
  const fixture = await activityFixture();
  fixture.data.activity = {
    ...fixture.data.activity,
    children: fixture.data.activity.children.map((child) => ({
      ...child,
      section: "done",
      status: "succeeded",
    })),
    counts: { active: 0, done: 2, complete: true },
  };
  fixture.controller.show();
  await Promise.resolve();
  fixture.controller.toggle();
  const base = fixture.data.activity;
  fixture.data.activity = {
    ...base,
    children: [
      {
        ...base.children[0],
        childId: "later-child",
        name: "Later researcher",
        section: "active",
        status: "running",
      },
      ...base.children,
    ],
    counts: { active: 1, done: 2, complete: true },
    events: [
      ...base.events,
      { ...base.events[0], eventId: "later-start", childId: "later-child" },
    ],
  };
  await vi.advanceTimersByTimeAsync(2_000);
  expect(fixture.controller.read().open).toBe(false);
  expect(
    fixture.controller
      .read()
      .summaries.some((child) => child.childId === "later-child")
  ).toBe(true);
  expect(
    fixture.controller.read().events.map((event) => event.eventId)
  ).toContain("later-start");
  expect(fixture.calls.conversations).toEqual([]);
});

it("preserves loaded earlier records from the same turn when refreshing a bounded latest page", async () => {
  const fixture = await activityFixture();
  const base = NativeActivityFixtures.conversation("done-child");
  const tail = base.messages[1];
  fixture.data.conversations.set("done-child", {
    ...base,
    messages: [tail],
    older: "earlier-in-same-turn",
  });
  await fixture.controller.openChild("done-child");
  vi.spyOn(fixture.client, "subagentConversation").mockResolvedValueOnce({
    ...base,
    messages: [
      { ...base.messages[0], messageId: "older-a" },
      { ...tail, messageId: "older-b", text: "Earlier commentary." },
      tail,
    ],
    older: null,
  });
  await fixture.controller.readConversation(true);
  await fixture.controller.readConversation();
  expect(
    fixture.controller
      .read()
      .conversation?.messages.map((message) => message.messageId)
  ).toEqual(["older-a", "older-b", tail.messageId]);
  expect(fixture.controller.read().conversation?.older).toBeNull();
});

it("resets an obsolete conversation view and refuses an older page from another view", async () => {
  const fixture = await activityFixture();
  await fixture.controller.openChild("done-child");
  const base = NativeActivityFixtures.conversation("done-child");
  fixture.data.conversations.set("done-child", {
    ...base,
    view: 2,
    messages: [{ ...base.messages[1], messageId: "new-view-message" }],
    older: "new-view-older",
  });
  await fixture.controller.readConversation();
  expect(
    fixture.controller
      .read()
      .conversation?.messages.map((message) => message.messageId)
  ).toEqual(["new-view-message"]);
  expect(fixture.controller.read().conversation?.older).toBe("new-view-older");
  vi.spyOn(fixture.client, "subagentConversation").mockResolvedValueOnce(base);
  await fixture.controller.readConversation(true);
  expect(fixture.controller.read().conversation?.view).toBe(2);
  expect(
    fixture.controller
      .read()
      .conversation?.messages.map((message) => message.messageId)
  ).toEqual(["new-view-message"]);
  expect(fixture.controller.read().conversationError).toContain(
    "Retry to reconnect"
  );
});

it("follows fresh page boundaries when a new child shifts the loaded catalog window", async () => {
  const fixture = await activityFixture();
  const base = fixture.data.activity;
  const children = Array.from({ length: 33 }, (_, index) => ({
    ...base.children[1],
    childId: `child-${33 - index}`,
  }));
  vi.spyOn(fixture.client, "subagentActivity").mockImplementation(
    async (_attachment, after) => {
      const start = after
        ? children.findIndex((child) => child.childId === after) + 1
        : 0;
      const page = children.slice(start, start + 32);
      return {
        ...base,
        children: page,
        counts: { active: 0, done: children.length, complete: true },
        events: [],
        nextAfterChildId:
          start + 32 < children.length ? page.at(-1)!.childId : null,
      };
    }
  );
  fixture.controller.show();
  await Promise.resolve();
  await fixture.controller.list(true);
  expect(fixture.controller.read().summaries).toHaveLength(33);
  children.unshift({ ...base.children[1], childId: "child-34" });
  await fixture.controller.list();
  expect(fixture.controller.read().summaries).toHaveLength(34);
  expect(
    fixture.controller.read().summaries.map((child) => child.childId)
  ).toContain("child-2");
  expect(fixture.controller.read().next).toBeNull();
});

it("retains an uncertain assignment's input identity across a successful assignment to another child", async () => {
  const fixture = await activityFixture();
  const assign = vi.spyOn(fixture.client, "assignSubagent");
  assign.mockRejectedValueOnce(new Error("acknowledgement_lost"));
  await fixture.controller.openChild("working-child");
  await expect(
    fixture.controller.assign("Review the original evidence.")
  ).resolves.toBe(false);
  await expect(
    fixture.controller.assign("Different instructions.")
  ).resolves.toBe(false);
  await fixture.controller.openChild("done-child");
  await expect(
    fixture.controller.assign("Check another result.")
  ).resolves.toBe(true);
  await fixture.controller.openChild("working-child");
  await expect(
    fixture.controller.assign("Review the original evidence.")
  ).resolves.toBe(true);
  expect(assign.mock.calls[0]).toEqual(assign.mock.calls[2]);
  expect(assign).toHaveBeenCalledTimes(3);
});

it("opens a newly created child with its own conversation instead of retaining the previous child's view", async () => {
  const fixture = await activityFixture();
  await fixture.controller.openChild("working-child");
  fixture.data.conversations.set("created-child", {
    ...NativeActivityFixtures.conversation("created-child"),
    messages: [],
    turns: [],
    execution: null,
  });
  fixture.controller.back();
  await expect(fixture.controller.create("New researcher", 2)).resolves.toBe(
    true
  );
  expect(fixture.controller.read().conversation?.childId).toBe("created-child");
  expect(fixture.controller.read().conversation?.messages).toEqual([]);
});

it("requests presentation only for explicit viewer actions, not observations or back navigation", async () => {
  const fixture = await activityFixture();
  const controller = fixture.controller;
  expect(controller.read().focus).toBe(0);
  controller.parentUpdated();
  expect(controller.read().focus).toBe(0);
  controller.show();
  expect(controller.read().focus).toBe(1);
  await controller.list();
  expect(controller.read().focus).toBe(1);
  controller.show();
  expect(controller.read().focus).toBe(2);
  await controller.openChild("done-child");
  expect(controller.read().focus).toBe(3);
  await controller.readConversation();
  controller.back();
  expect(controller.read().focus).toBe(3);
  controller.toggle();
  expect(controller.read()).toMatchObject({ open: false, focus: 3 });
  controller.toggle();
  expect(controller.read()).toMatchObject({ open: true, focus: 4 });
});
