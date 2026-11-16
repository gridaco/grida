// GRIDA-SEC-004 — parent-scoped observations cannot become child attachments.
import { expect, it, vi } from "vitest";
import { NativeSubagentActivity } from "./native-subagent-activity";

const parent = { id: "parent" };
const attachment = {};
const childId = "subagent/child";
const check = () => {};
const captured = { model: "original-model", effort: "high" };
const summary = {
  childId,
  name: "Layout review",
  kind: "review",
  status: "running",
  section: "active",
  updatedAtMs: 10,
  latestTurnId: "child-turn",
};
const event = {
  eventId: "child-started",
  childId,
  name: summary.name,
  kind: "started",
  childTurnId: "child-turn",
  parentTurnId: "sponsor-turn",
  inputId: "assignment",
  atMs: 10,
};
const overview = {
  parentSessionId: parent.id,
  children: [summary],
  nextAfterChildId: null,
  counts: { active: 1, done: 0, complete: true },
  events: [event],
  eventsComplete: true,
  observedAtMs: 20,
};
const conversation = {
  parentSessionId: parent.id,
  childId,
  name: summary.name,
  kind: "review",
  view: 3,
  messages: [
    {
      messageId: "assignment-message",
      role: "user",
      turnId: "child-turn",
      text: "Review the layout.",
    },
    {
      messageId: "visible-output",
      role: "assistant",
      turnId: "child-turn",
      phase: "progress",
      text: "I am checking the constraints.",
      live: true,
      activity: [
        {
          callId: "read",
          title: "read_file",
          kind: "read",
          outcome: "succeeded",
          input: { path: "layout.ts" },
          output: { text: "visible tool output", truncated: false },
        },
      ],
    },
  ],
  turns: [
    {
      turnId: "child-turn",
      startedAtMs: 10,
      status: null,
      execution: captured,
    },
  ],
  execution: captured,
  older: "native-private-continuation",
  live: { available: true, truncated: false },
  observedAtMs: 20,
};

it("preserves lifecycle coordinates independently from wall time and reports missing retained order", async () => {
  const finish = {
    ...event,
    eventId: "child-finished",
    kind: "finished",
    status: "succeeded",
    atMs: 9,
    activityOrder: 7,
  };
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(
    async () => ({
      ...overview,
      events: [{ ...event, activityOrder: 3 }, finish],
      orderComplete: true,
    })
  );
  const adapter = new NativeSubagentActivity(request, () => true);
  const page = await adapter.activity(parent, undefined, check);
  expect(page.events.map((entry) => [entry.kind, entry.activityOrder])).toEqual(
    [
      ["started", 3],
      ["finished", 7],
    ]
  );
  expect(page.orderComplete).toBe(true);
  request.mockResolvedValueOnce({ ...overview, orderComplete: false });
  const legacy = await adapter.activity(parent, undefined, check);
  expect(legacy.events[0].activityOrder).toBeUndefined();
  expect(legacy.orderComplete).toBe(false);
  request.mockResolvedValueOnce({ ...overview, orderComplete: true });
  await expect(adapter.activity(parent, undefined, check)).rejects.toThrow(
    "native_chat_subagent_invalid_response"
  );
});

it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null])(
  "refuses invalid child lifecycle positions (%s)",
  async (activityOrder) => {
    const request = vi.fn<
      (method: string, params: unknown) => Promise<unknown>
    >(async () => ({
      ...overview,
      events: [{ ...event, activityOrder }],
      orderComplete: true,
    }));
    await expect(
      new NativeSubagentActivity(request, () => true).activity(
        parent,
        undefined,
        check
      )
    ).rejects.toThrow("native_chat_activity_order_invalid");
  }
);

it("keeps child conversation message and tool coordinates in their own turn without borrowing a parent position", async () => {
  const messages = conversation.messages.map((message, index) => ({
    ...message,
    activityOrder: index + 1,
    ...(message.activity && {
      activity: message.activity.map((activity) => ({
        ...activity,
        activityOrder: 3,
      })),
    }),
  }));
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(
    async () => ({ ...conversation, messages })
  );
  const page = await new NativeSubagentActivity(
    request,
    () => true
  ).conversation(attachment, parent, childId, undefined, check);
  expect(page.messages.map((entry) => entry.activityOrder)).toEqual([1, 2]);
  expect(page.messages[1].activity?.[0].activityOrder).toBe(3);
  const unavailable = await new NativeSubagentActivity(request).conversation(
    attachment,
    parent,
    childId,
    undefined,
    check
  );
  expect(unavailable.messages[0].activityOrder).toBeUndefined();
  expect(unavailable.messages[1].activity?.[0].activityOrder).toBeUndefined();
  request.mockResolvedValueOnce({
    ...conversation,
    messages: messages.map((entry) => ({
      ...entry,
      activityOrder: undefined,
      activityOrderIncomplete: true,
    })),
  });
  const incomplete = await new NativeSubagentActivity(
    request,
    () => true
  ).conversation(attachment, parent, childId, undefined, check);
  expect(
    incomplete.messages.every(
      (entry) =>
        entry.activityOrderIncomplete === true &&
        entry.activityOrder === undefined
    )
  ).toBe(true);
});

it("projects bounded status pages and strips internal fields without inspecting each child", async () => {
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(
    async () => ({
      ...overview,
      providerState: "private",
      children: [{ ...summary, credential: "private" }],
      events: [{ ...event, driverState: "private" }],
    })
  );
  const adapter = new NativeSubagentActivity(request);
  const page = await adapter.activity(parent, undefined, check);
  expect(page).toEqual({
    children: [summary],
    nextAfterChildId: null,
    counts: overview.counts,
    events: [event],
    eventsComplete: true,
    observedAtMs: 20,
  });
  expect(request).toHaveBeenCalledExactlyOnceWith(
    NativeSubagentActivity.activityMethod,
    { parentSessionId: parent.id }
  );
  expect(Object.isFrozen(page.children)).toBe(true);
});

it("keeps complete Done history visible with no active work and reports lower-bound counts honestly", async () => {
  const request =
    vi.fn<(method: string, params: unknown) => Promise<unknown>>();
  const adapter = new NativeSubagentActivity(request);
  request.mockResolvedValueOnce({
    ...overview,
    children: [{ ...summary, status: "succeeded", section: "done" }],
    counts: { active: 0, done: 1, complete: true },
  });
  const completed = await adapter.activity(parent, undefined, check);
  expect(completed.counts).toEqual({ active: 0, done: 1, complete: true });
  expect(completed.children[0].section).toBe("done");
  request.mockResolvedValueOnce({
    ...overview,
    counts: { active: 0, done: 512, complete: false },
    eventsComplete: false,
  });
  const partial = await adapter.activity(parent, undefined, check);
  expect(partial.counts.complete).toBe(false);
  expect(partial.eventsComplete).toBe(false);
});

it.each([
  { parentSessionId: "another-parent" },
  { children: [summary, summary] },
  { children: [{ ...summary, childId: parent.id }] },
  { children: [{ ...summary, status: "uncertain", section: "done" }] },
  { children: [{ ...summary, kind: "guessed-by-name" }] },
  { nextAfterChildId: childId },
  { counts: { active: 513, done: 0, complete: false } },
  { events: [event, event] },
  { events: [{ ...event, childId: "foreign-child" }] },
  { events: [{ ...event, name: "Different identity" }] },
  { events: [{ ...event, status: "succeeded" }] },
])("refuses inconsistent activity facts %j", async (changed) => {
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(
    async () => ({ ...overview, ...changed })
  );
  await expect(
    new NativeSubagentActivity(request).activity(parent, undefined, check)
  ).rejects.toThrow("native_chat_subagent_invalid_response");
});

it("accepts a fresh child row while complete counts still describe the cached earlier sample", async () => {
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(
    async () => ({
      ...overview,
      children: [{ ...summary, status: "ready" }],
      counts: { active: 0, done: 0, complete: true },
      events: [],
    })
  );
  const page = await new NativeSubagentActivity(request).activity(
    parent,
    undefined,
    check
  );
  expect(page.children[0].status).toBe("ready");
  expect(page.counts).toEqual({ active: 0, done: 0, complete: true });
  expect(page.observedAtMs).toBe(overview.observedAtMs);
});

it("bounds message text separately from displayed tool output under the whole-response limit", async () => {
  const messages = Array.from({ length: 4 }, (_, index) => ({
    messageId: `message-${index}`,
    turnId: "child-turn",
    role: "assistant",
    text: "x".repeat((index < 3 ? 64 : 58) * 1024),
    ...(index === 0 && {
      activity: [
        {
          callId: "read",
          title: "read_file",
          kind: "read",
          outcome: "succeeded",
          output: { text: "y".repeat(8 * 1024), truncated: false },
        },
      ],
    }),
  }));
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(
    async () => ({ ...conversation, messages })
  );
  const page = await new NativeSubagentActivity(request).conversation(
    attachment,
    parent,
    childId,
    undefined,
    check
  );
  expect(
    page.messages.reduce(
      (bytes, message) => bytes + Buffer.byteLength(message.text),
      0
    )
  ).toBe(250 * 1024);
  expect(page.messages[0].activity?.[0].output?.text).toHaveLength(8 * 1024);
  request.mockResolvedValueOnce({
    ...conversation,
    messages: [
      {
        ...messages[0],
        activity: [
          {
            callId: "read",
            title: "read_file",
            kind: "read",
            outcome: "succeeded",
            output: { text: "y".repeat(64 * 1024 + 1), truncated: false },
          },
        ],
      },
    ],
  });
  await expect(
    new NativeSubagentActivity(request).conversation(
      attachment,
      parent,
      childId,
      undefined,
      check
    )
  ).rejects.toThrow("native_chat_subagent_invalid_response");
});

it("keeps exact captured execution and actual live message/activity separate from private state", async () => {
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(
    async () => ({
      ...conversation,
      providerState: { hidden: "private" },
      messages: conversation.messages.map((message) => ({
        ...message,
        reasoning: "hidden",
      })),
      turns: conversation.turns.map((turn) => ({
        ...turn,
        principal: "private",
      })),
    })
  );
  const adapter = new NativeSubagentActivity(request);
  const result = await adapter.conversation(
    attachment,
    parent,
    childId,
    undefined,
    check
  );
  expect(result.execution).toEqual(captured);
  expect(result.turns[0].execution).toEqual(captured);
  expect(result.messages).toEqual(conversation.messages);
  expect(result.live.available).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private");
  expect(JSON.stringify(result)).not.toContain("hidden");
  expect(result.older).toEqual(expect.any(String));
  expect(result.older).not.toBe(conversation.older);
});

it("binds opaque continuation to exact attachment, parent and child and reuses unchanged cursors", async () => {
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(
    async () => conversation
  );
  const adapter = new NativeSubagentActivity(request);
  const first = await adapter.conversation(
    attachment,
    parent,
    childId,
    undefined,
    check
  );
  const same = await adapter.conversation(
    attachment,
    parent,
    childId,
    undefined,
    check
  );
  expect(same.older).toBe(first.older);
  const older = first.older!;
  await expect(
    adapter.conversation({}, parent, childId, older, check)
  ).rejects.toThrow("native_chat_subagent_cursor_unavailable");
  await expect(
    adapter.conversation(attachment, { id: parent.id }, childId, older, check)
  ).rejects.toThrow("native_chat_subagent_cursor_unavailable");
  await expect(
    adapter.conversation(attachment, parent, "foreign-child", older, check)
  ).rejects.toThrow("native_chat_subagent_cursor_unavailable");
  expect(request).toHaveBeenCalledTimes(2);
  request.mockResolvedValueOnce({ ...conversation, older: null });
  await adapter.conversation(attachment, parent, childId, older, check);
  expect(request).toHaveBeenLastCalledWith(
    NativeSubagentActivity.conversationMethod,
    {
      parentSessionId: parent.id,
      childId,
      before: conversation.older,
    }
  );
});

it("does not publish an observation or continuation after its attachment is revoked", async () => {
  const response = Promise.withResolvers<unknown>();
  const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(
    () => response.promise
  );
  const adapter = new NativeSubagentActivity(request);
  let admitted = true;
  const verify = () => {
    if (!admitted) throw new Error("revoked");
  };
  const pending = adapter.conversation(
    attachment,
    parent,
    childId,
    undefined,
    verify
  );
  admitted = false;
  response.resolve(conversation);
  await expect(pending).rejects.toThrow("revoked");
  const activity = adapter.activity(parent, undefined, verify);
  await expect(activity).rejects.toThrow("revoked");
  expect(request).toHaveBeenCalledOnce();
});

it.each([
  { parentSessionId: "foreign-parent" },
  { childId: "foreign-child" },
  { messages: [conversation.messages[1], conversation.messages[1]] },
  { messages: [{ ...conversation.messages[1], turnId: "foreign-turn" }] },
  { messages: [{ ...conversation.messages[1], role: "user" }] },
  { messages: [{ ...conversation.messages[1], text: "界".repeat(22 * 1024) }] },
  { turns: [{ ...conversation.turns[0], status: "invented" }] },
  { turns: [{ ...conversation.turns[0], settledAtMs: 1 }] },
  { execution: { model: "current-parent-model", effort: "automatic" } },
  { live: { available: false, truncated: false } },
])(
  "refuses unsafe or incoherent conversation projection %j",
  async (changed) => {
    const request = vi.fn<
      (method: string, params: unknown) => Promise<unknown>
    >(async () => ({ ...conversation, ...changed }));
    await expect(
      new NativeSubagentActivity(request).conversation(
        attachment,
        parent,
        childId,
        undefined,
        check
      )
    ).rejects.toThrow("native_chat_subagent_invalid_response");
  }
);

it("bounds records, complete response bytes and aggregate visible output", async () => {
  const request =
    vi.fn<(method: string, params: unknown) => Promise<unknown>>();
  const adapter = new NativeSubagentActivity(request);
  request.mockResolvedValueOnce({
    ...conversation,
    messages: Array.from({ length: 129 }, (_, i) => ({
      messageId: `m${i}`,
      role: "user",
      text: "",
    })),
  });
  await expect(
    adapter.conversation(attachment, parent, childId, undefined, check)
  ).rejects.toThrow("native_chat_subagent_invalid_response");
  request.mockResolvedValueOnce({
    ...conversation,
    ignored: "x".repeat(768 * 1024),
  });
  await expect(
    adapter.conversation(attachment, parent, childId, undefined, check)
  ).rejects.toThrow("native_chat_subagent_invalid_response");
  request.mockResolvedValueOnce({
    ...conversation,
    messages: Array.from({ length: 5 }, (_, i) => ({
      messageId: `m${i}`,
      role: "user",
      text: "x".repeat(64 * 1024),
    })),
  });
  await expect(
    adapter.conversation(attachment, parent, childId, undefined, check)
  ).rejects.toThrow("native_chat_subagent_invalid_response");
});
