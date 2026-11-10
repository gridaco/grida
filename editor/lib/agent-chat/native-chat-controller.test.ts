import { describe, expect, it, vi } from "vitest";
import type {
  DesktopNativeChat,
  NativeChatCatalogEntry,
  NativeChatMessage,
  NativeChatObservation,
  NativeChatPage,
  NativeChatTurn,
  NativeChatTurnSummary,
  NativeChatUpdate,
} from "@grida/desktop-bridge";
import { NativeChatController } from "./native-chat-controller";

function fixture() {
  const updates = new Map<string, (update: NativeChatUpdate) => void>();
  const transcripts = new Map<string, readonly NativeChatMessage[]>();
  const running = new Set<string>();
  const waiting = new Set<string>();
  const observed = (id: string): NativeChatObservation => ({
    observationId: `observation-${id}`,
    snapshot: {
      sessionId: id,
      sessionRevision: 2,
      queuedInputs: 0,
      admissionPaused: false,
      current:
        running.has(id) || waiting.has(id)
          ? {
              turnId: `turn-${id}`,
              epoch: 1,
              journalPosition: 1,
              historyPosition: 1,
              controlRevision: 1,
              paused: false,
              cancelled: false,
              disposition: waiting.has(id) ? "suspended" : "running",
              status: null,
            }
          : null,
      latest: null,
    },
  });
  const bridge: DesktopNativeChat = {
    async available() {
      return true;
    },
    async list() {
      return { sessionIds: [], nextCursor: null };
    },
    async create() {
      return this.load("new");
    },
    async load(id) {
      return { attachmentId: id, sessionId: id };
    },
    async detach(id) {
      updates.delete(id);
    },
    async submit(id, inputId) {
      return {
        sessionId: id,
        inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: `turn-${id}`,
      };
    },
    async inputReceipt() {
      throw new Error("input_missing");
    },
    async observe(id) {
      return observed(id);
    },
    async transcript(id) {
      return transcripts.get(id) ?? [];
    },
    async control(id, input) {
      if (input.action === "resume") throw new Error("fixture only");
      return {
        action: input.action,
        receipt: {
          sessionId: id,
          turnId: `turn-${id}`,
          requestId: input.requestId,
          sessionRevision: 2,
          journalPosition: 1,
        },
      };
    },
    async subscribe(id, listener) {
      updates.set(id, listener);
      return id;
    },
    async unsubscribe(id) {
      updates.delete(id);
    },
  };
  return {
    bridge,
    updates,
    transcripts,
    running,
    waiting,
    controller: new NativeChatController(bridge),
  };
}

it("keeps the original mode and input identity when a draft is retried", async () => {
  const { bridge, controller } = fixture();
  const send = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
    async (_action, sessionId, inputId) => ({
      sessionId,
      inputId,
      disposition: "claimed",
      inputPosition: 1,
      turnId: "turn-a",
    })
  );
  send.mockRejectedValueOnce(new Error("fixture lost reply"));
  bridge.submitInRegime = send;
  await controller.select("chat-a");
  controller.selectOperatingRegime("plan");
  await expect(controller.submit("Investigate")).rejects.toThrow("lost reply");
  const first = send.mock.calls[0];
  expect(first).toEqual([
    "submit",
    "chat-a",
    expect.any(String),
    "Investigate",
    "plan",
  ]);
  controller.selectOperatingRegime("act");
  await expect(controller.submit("Investigate")).rejects.toThrow(
    "native_chat_pending_regime_changed"
  );
  expect(send).toHaveBeenCalledTimes(1);
  controller.selectOperatingRegime("plan");
  await controller.submit("Investigate");
  expect(send.mock.calls[1]).toEqual(first);
  controller.disconnect();
});

it("reviews the exact pending request and removes authority on chat switch", async () => {
  const { bridge, controller, waiting } = fixture();
  waiting.add("chat-a");
  const review = {
    reviewId: "review-a",
    tool: "read_file",
    root: "/chosen",
    relativePath: "note.txt",
  } as const;
  const approvals = vi.fn<NonNullable<DesktopNativeChat["approvals"]>>(
    async () => [review]
  );
  const answer = vi.fn<NonNullable<DesktopNativeChat["answerApproval"]>>(
    async () => {
      waiting.delete("chat-a");
      return {
        sessionId: "chat-a",
        turnId: "turn-chat-a",
        requestId: "decision",
        sessionRevision: 3,
        journalPosition: 2,
      };
    }
  );
  bridge.approvals = approvals;
  bridge.answerApproval = answer;
  await controller.select("chat-a");
  expect(controller.read().approvals).toEqual([review]);
  expect(approvals).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "observation-chat-a"
  );
  await controller.answerApproval("review-a", "approve_once");
  expect(answer).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "review-a",
    "approve_once"
  );
  expect(controller.read().approvals).toEqual([]);
  await controller.select("chat-b");
  await controller.answerApproval("review-a", "decline");
  expect(answer).toHaveBeenCalledTimes(1);
  controller.disconnect();
});

it("drops a late review from the previous chat", async () => {
  const { bridge, controller, waiting } = fixture();
  waiting.add("chat-a");
  const pending =
    Promise.withResolvers<
      Awaited<ReturnType<NonNullable<DesktopNativeChat["approvals"]>>>
    >();
  const approvals = vi.fn<NonNullable<DesktopNativeChat["approvals"]>>(
    () => pending.promise
  );
  bridge.approvals = approvals;
  bridge.answerApproval = async () => {
    throw new Error("unexpected review");
  };
  const old = controller.select("chat-a");
  await vi.waitFor(() => expect(approvals).toHaveBeenCalledTimes(1));
  await controller.select("chat-b");
  pending.resolve([
    {
      reviewId: "old",
      tool: "read_file",
      root: "/chosen",
      relativePath: "note.txt",
    },
  ]);
  await old;
  expect(controller.read().selected).toBe("chat-b");
  expect(controller.read().approvals).toEqual([]);
  controller.disconnect();
});

it("queues separately and uses the new review token for the same question", async () => {
  const { bridge, controller, waiting } = fixture();
  waiting.add("chat-a");
  let queued = 0;
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const prior = await observe(id);
    return {
      observationId: `${prior.observationId}-${queued}`,
      snapshot: { ...prior.snapshot, queuedInputs: queued },
    };
  };
  const question = {
    questionId: "question",
    style: "answer_dependent",
    question: "Which edition?",
    options: ["Screen", "Print"],
  } as const;
  bridge.questions = async () =>
    waiting.size ? [{ ...question, reviewId: `review-${queued}` }] : [];
  const enqueue = vi.fn<NonNullable<DesktopNativeChat["enqueue"]>>(
    async (sessionId, inputId) => {
      queued++;
      return {
        sessionId,
        inputId,
        disposition: "queued",
        inputPosition: 2,
        turnId: null,
      };
    }
  );
  const answer = vi.fn<NonNullable<DesktopNativeChat["answerQuestion"]>>(
    async () => {
      waiting.clear();
      return {
        sessionId: "chat-a",
        turnId: "turn-chat-a",
        requestId: "answer",
        sessionRevision: 3,
        journalPosition: 2,
      };
    }
  );
  bridge.enqueue = enqueue;
  bridge.answerQuestion = answer;
  await controller.select("chat-a");
  expect(controller.read().questions[0]?.reviewId).toBe("review-0");
  await controller.submit("Check the page numbers.");
  expect(enqueue).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    expect.any(String),
    "Check the page numbers."
  );
  expect(controller.read().questions[0]).toEqual({
    ...question,
    reviewId: "review-1",
  });
  expect(
    await controller.answerQuestion(question.questionId, {
      kind: "choice",
      index: 1,
    })
  ).toBe(true);
  expect(answer).toHaveBeenCalledExactlyOnceWith("chat-a", "review-1", {
    kind: "choice",
    index: 1,
  });
  await controller.select("chat-b");
  expect(
    await controller.answerQuestion(question.questionId, { kind: "skipped" })
  ).toBe(false);
  expect(answer).toHaveBeenCalledTimes(1);
  controller.disconnect();
});

it("keeps ordinary turns quiet when question inspection is absent or fails", async () => {
  const { bridge, controller, running } = fixture();
  running.add("chat-a");
  const questions = vi.fn<NonNullable<DesktopNativeChat["questions"]>>(
    async () => {
      throw new Error("fixture question method unavailable");
    }
  );
  bridge.questions = questions;
  await controller.select("chat-a");
  expect(questions).not.toHaveBeenCalled();
  expect(controller.read().questionError).toBeNull();

  bridge.answerQuestion = async () => {
    throw new Error("unexpected answer");
  };
  await controller.repair();
  expect(questions).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "observation-chat-a"
  );
  expect(controller.read().questions).toEqual([]);
  expect(controller.read().questionError).toBeNull();
  expect(controller.read().error).toBeNull();
  controller.disconnect();
});

it("keeps a queued edit draft across a stale revision and requires an explicit retry", async () => {
  const { bridge, controller, running } = fixture();
  running.add("chat-a");
  let revision = 2;
  const base = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const value = await base(id);
    return {
      observationId: `${id}-${revision}`,
      snapshot: {
        ...value.snapshot,
        sessionRevision: revision,
        queuedInputs: id === "chat-a" ? 1 : 0,
      },
    };
  };
  bridge.queue = async () => ({
    items: [{ inputId: "queued", preview: "Original" }],
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  bridge.queuedText = async () => "Original";
  const edits = vi.fn<NonNullable<DesktopNativeChat["editQueue"]>>(
    async (sessionId, change) => {
      revision++;
      if (revision === 3) throw new Error("stale_session_revision");
      return {
        sessionId,
        requestId: change.requestId,
        sessionRevision: revision,
      };
    }
  );
  bridge.editQueue = edits;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.editQueuedText("queued");
  controller.changeQueueDraft("Revised draft");
  await controller.saveQueueDraft();
  expect(controller.read().queueDraft).toEqual({
    inputId: "queued",
    text: "Revised draft",
  });
  expect(edits).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.saveQueueDraft();
  expect(edits).toHaveBeenLastCalledWith(
    "chat-a",
    expect.objectContaining({
      action: "replace",
      observationId: "chat-a-3",
      text: "Revised draft",
    })
  );
  expect(edits.mock.calls[1][1].requestId).not.toBe(
    edits.mock.calls[0][1].requestId
  );
  expect(controller.read().queueDraft).toBeNull();
  controller.disconnect();
});

it("retries steering exactly after a lost reply and never falls through to the queue", async () => {
  const { bridge, controller, running } = fixture();
  running.add("chat-a");
  const enqueue = vi.fn<NonNullable<DesktopNativeChat["enqueue"]>>(
    async (sessionId, inputId) => ({
      sessionId,
      inputId,
      disposition: "queued",
      inputPosition: 2,
      turnId: null,
    })
  );
  const steer = vi.fn<NonNullable<DesktopNativeChat["steer"]>>(
    async (sessionId, input) => ({
      sessionId,
      requestId: input.requestId,
      turnId: "turn-chat-a",
      sessionRevision: 3,
      journalPosition: 2,
    })
  );
  steer.mockRejectedValueOnce(new Error("fixture lost reply"));
  bridge.enqueue = enqueue;
  bridge.steer = steer;
  await controller.select("chat-a");
  controller.toggleSteering();
  await expect(controller.submit("Correction")).rejects.toThrow(
    "fixture lost reply"
  );
  expect(controller.read().steering).toBe(true);
  expect(enqueue).not.toHaveBeenCalled();
  await controller.submit("Correction");
  expect(steer.mock.calls[1]).toEqual(steer.mock.calls[0]);
  expect(controller.read().steering).toBe(false);
  await controller.submit("Next task");
  expect(enqueue).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    expect.any(String),
    "Next task"
  );
  controller.disconnect();
});

it("starts a goal only on explicit acceptance and reuses its exact input on retry", async () => {
  const { bridge, controller } = fixture();
  const request = {
    objective: "Prepare the export",
    criteria: ["Verify the output"],
    allowance: { workTurns: 3, inferenceSteps: 32 },
    automatic: false,
  };
  let goalId: string | null = null;
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const observation = await observe(id);
    return {
      ...observation,
      observationId: goalId ? "goal-started" : observation.observationId,
      snapshot: { ...observation.snapshot, sessionRevision: goalId ? 3 : 2 },
    };
  };
  bridge.goal = async () =>
    goalId
      ? {
          observationId: "goal-3",
          goal: {
            ...request,
            goalId,
            state: { status: "active" },
            paused: false,
            progress: "Preparing the export",
            spent: { workTurns: 0, inferenceSteps: 0 },
            remaining: request.allowance,
            reservation: null,
          },
        }
      : { observationId: null, goal: null };
  const start = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>(
    async (sessionId, inputId) => {
      goalId = inputId;
      return {
        sessionId,
        inputId,
        disposition: "queued",
        inputPosition: 1,
        turnId: null,
      };
    }
  );
  start.mockRejectedValueOnce(new Error("fixture lost reply"));
  bridge.startGoal = start;
  await controller.select("chat-a");
  expect(start).not.toHaveBeenCalled();
  expect(await controller.startGoal(request)).toBe(false);
  expect(controller.read().error).toContain("Your draft is still here");
  expect(await controller.startGoal(request)).toBe(true);
  expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
  expect(controller.read().goal?.goal?.state).toEqual({ status: "active" });
  expect(controller.read().observation?.snapshot.pendingGoalId).toBeUndefined();
  expect(controller.canStartGoal).toBe(false);
  controller.disconnect();
});

it("reads the pending goal from a reopened chat and withholds text replacement", async () => {
  const { bridge, controller } = fixture();
  const goalStart = {
    objective: "Prepare the export",
    criteria: ["Verify the output"],
    allowance: { workTurns: 3, inferenceSteps: 32 },
    automatic: false,
  };
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const observation = await observe(id);
    return {
      ...observation,
      snapshot: {
        ...observation.snapshot,
        queuedInputs: 1,
        pendingGoalId: "saved-goal",
      },
    };
  };
  bridge.goal = async () => ({ observationId: null, goal: null });
  bridge.queue = async () => ({
    items: [{ inputId: "saved-goal", preview: goalStart.objective, goalStart }],
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  const queuedText = vi.fn<NonNullable<DesktopNativeChat["queuedText"]>>();
  const edit = vi.fn<NonNullable<DesktopNativeChat["editQueue"]>>();
  const start = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
  bridge.queuedText = queuedText;
  bridge.editQueue = edit;
  bridge.startGoal = start;
  await controller.select("chat-a");
  expect(controller.read().observation?.snapshot.pendingGoalId).toBe(
    "saved-goal"
  );
  await vi.waitFor(() =>
    expect(controller.read().queue?.items[0]?.goalStart).toEqual(goalStart)
  );
  expect(controller.canStartGoal).toBe(false);
  await controller.editQueuedText("saved-goal");
  await controller.editQueue({
    action: "replace",
    inputId: "saved-goal",
    text: "Unrelated.",
  });
  expect(queuedText).not.toHaveBeenCalled();
  expect(edit).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  controller.disconnect();
});

it("keeps side retries exact, parent input independent, and late answers out of the next chat", async () => {
  const { bridge, controller } = fixture();
  const context = {
    sourceRevision: 2,
    compacted: true,
    truncated: false,
    omitted: true,
  };
  const open = vi.fn<NonNullable<DesktopNativeChat["openSideChat"]>>(
    async () => context
  );
  open.mockRejectedValueOnce(new Error("fixture lost open reply"));
  const response = {
    turnId: "side-turn",
    status: "succeeded",
    text: "Side answer.",
    textTruncated: false,
  } as const;
  const ask = vi.fn<NonNullable<DesktopNativeChat["askSideChat"]>>(
    async () => response
  );
  ask.mockRejectedValueOnce(new Error("fixture lost answer"));
  const close = vi.fn<NonNullable<DesktopNativeChat["closeSideChat"]>>(
    async () => {}
  );
  const submit = vi.spyOn(bridge, "submit");
  bridge.openSideChat = open;
  bridge.askSideChat = ask;
  bridge.closeSideChat = close;

  await controller.select("chat-a");
  controller.openSideChat();
  const side = controller.read().sideChat!;
  await side.open();
  expect(side.read().phase).toBe("unavailable");
  await side.open();
  expect(side.read().context).toEqual(context);
  expect(open.mock.calls[0]).toEqual(open.mock.calls[1]);
  side.setDraft("Explain the decision.");
  await side.ask();
  expect(side.read().draft).toBe("Explain the decision.");
  const answer = Promise.withResolvers<typeof response>();
  ask.mockReturnValueOnce(answer.promise);
  const pending = side.ask();
  expect(side.read().asking).toBe(true);
  expect(controller.canSubmit).toBe(true);
  await controller.submit("Continue the parent.");
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    expect.any(String),
    "Continue the parent."
  );
  expect(ask.mock.calls[0]).toEqual(ask.mock.calls[1]);
  answer.resolve(response);
  await pending;
  expect(side.read().exchanges).toEqual([
    { question: "Explain the decision.", answer: response },
  ]);
  expect(controller.read().messages).toEqual([]);

  const late = Promise.withResolvers<typeof response>();
  ask.mockReturnValueOnce(late.promise);
  side.setDraft("Follow up.");
  const unfinished = side.ask();
  await controller.select("chat-b");
  late.resolve(response);
  await unfinished;
  expect(controller.read().sideChat).toBeNull();
  expect(side.read().exchanges).toEqual([]);
  expect(close).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    open.mock.calls[0][1]
  );
  controller.disconnect();
});

it("stages only a selected current side answer and leaves parent actions untouched", async () => {
  const { bridge, controller, running } = fixture();
  bridge.openSideChat = async () => ({
    sourceRevision: 2,
    compacted: false,
    truncated: false,
    omitted: false,
  });
  const ask = vi.fn<NonNullable<DesktopNativeChat["askSideChat"]>>();
  ask
    .mockResolvedValueOnce({
      turnId: "first",
      status: "succeeded",
      text: "A different answer.",
      textTruncated: false,
    })
    .mockResolvedValueOnce({
      turnId: "selected",
      status: "succeeded",
      text: `<literal>\n${"🙂".repeat(10_000)}`,
      textTruncated: false,
    })
    .mockResolvedValueOnce({
      turnId: "failed",
      status: "failed",
      text: "A partial result.",
      textTruncated: false,
    });
  bridge.askSideChat = ask;
  bridge.closeSideChat = async () => {};
  const submit = vi.spyOn(bridge, "submit");
  const steer = vi.fn<NonNullable<DesktopNativeChat["steer"]>>();
  bridge.steer = steer;
  running.add("chat-a");
  await controller.select("chat-a");
  controller.openSideChat();
  const side = controller.read().sideChat!;
  await side.open();
  for (const question of ["First", "Selected", "Failed"]) {
    side.setDraft(question);
    await side.ask();
  }

  let draft = "Existing parent draft.";
  const append = vi.fn<(quote: string) => boolean>((quote) => {
    draft += `\n${quote}`;
    return true;
  });
  controller.stageSideAnswer(side, "unknown", append);
  controller.stageSideAnswer(side, "failed", append);
  controller.toggleSteering();
  expect(controller.read().steering).toBe(true);
  controller.stageSideAnswer(side, "selected", append);
  expect(append).not.toHaveBeenCalled();
  controller.toggleSteering();

  controller.stageSideAnswer(side, "selected", append);
  const quote = append.mock.calls[0]?.[0];
  expect(quote).toMatch(/^Side chat answer \(excerpt\)\n> <literal>\n> 🙂+$/u);
  expect(new TextEncoder().encode(quote).length).toBeLessThan(16_420);
  expect(draft).toBe(`Existing parent draft.\n${quote}`);

  await controller.select("chat-b");
  controller.stageSideAnswer(side, "selected", append);
  expect(append).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
  expect(steer).not.toHaveBeenCalled();
  controller.disconnect();
});

it("reads one summary per observed terminal turn and drops replies after switching chats", async () => {
  const { bridge, controller } = fixture();
  const summaries = new Map<string, NativeChatTurn>();
  const observe = bridge.observe;
  vi.spyOn(bridge, "observe").mockImplementation(async (id) => {
    const observation = await observe(id);
    return {
      observationId: `basis-${id}-${summaries.get(id)?.turnId ?? "idle"}`,
      snapshot: { ...observation.snapshot, latest: summaries.get(id) ?? null },
    };
  });
  const read = vi.fn<NonNullable<DesktopNativeChat["turnSummary"]>>();
  bridge.turnSummary = read;
  await controller.select("chat-a");
  expect(read).not.toHaveBeenCalled();

  const latest = {
    turnId: "finished-one",
    epoch: 1,
    journalPosition: 8,
    historyPosition: 2,
    controlRevision: 1,
    paused: false,
    cancelled: false,
    disposition: "settled",
    status: "succeeded",
  } as const;
  const account = {
    turnId: latest.turnId,
    status: latest.status,
    text: "Completed result.",
    textTruncated: false,
    steps: 2,
    unresolvedOperations: 0,
    toolActivity: { succeeded: 1, failed: 0, cancelled: 0, unresolved: 0 },
    checks: ["allowed"],
  } satisfies NativeChatTurnSummary;
  read.mockResolvedValueOnce(account);
  summaries.set("chat-a", latest);
  await controller.repair();
  expect(controller.read().turnSummary).toEqual(account);
  await controller.repair();
  expect(read).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "basis-chat-a-finished-one"
  );

  const late = Promise.withResolvers<NativeChatTurnSummary>();
  read.mockReturnValueOnce(late.promise);
  summaries.set("chat-a", { ...latest, turnId: "finished-two" });
  await controller.repair();
  expect(controller.read().turnSummary).toBeNull();
  expect(read).toHaveBeenLastCalledWith("chat-a", "basis-chat-a-finished-two");
  await controller.select("chat-b");
  late.resolve({ ...account, turnId: "finished-two" });
  await late.promise;
  expect(controller.read().turnSummary).toBeNull();
  expect(read).toHaveBeenCalledTimes(2);
  controller.disconnect();
});

it("keeps PNG retries exact and drops replaced or navigated file reads", async () => {
  const { bridge, controller, running } = fixture();
  const textSend = vi.spyOn(bridge, "submit");
  const send = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>(
    async (sessionId, input) => ({
      sessionId,
      inputId: input.inputId,
      inputPosition: 2,
      turnId: null,
      disposition: "queued",
    })
  );
  send.mockRejectedValueOnce(new Error("fixture lost image acknowledgement"));
  bridge.acceptsPng = async () => true;
  bridge.submitImage = send;
  bridge.submitInRegime =
    vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>();
  bridge.enqueue = async (id, inputId, text) =>
    bridge.submit(id, inputId, text);
  running.add("chat-a");
  await controller.select("chat-a");
  expect(controller.canAttachPng).toBe(true);
  const scope = controller.read().scope;
  const previous = Promise.withResolvers<ArrayBuffer>();
  const first = controller.pickPng(scope, {
    name: "retired.png",
    size: 8,
    arrayBuffer: () => previous.promise,
  });
  expect(controller.canSubmit).toBe(false);
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
  await controller.pickPng(scope, {
    name: "chosen.png",
    size: png.byteLength,
    arrayBuffer: async () => png,
  });
  previous.resolve(new ArrayBuffer(8));
  await first;
  expect(controller.read().imageDraft?.name).toBe("chosen.png");
  await expect(controller.submit(" ")).rejects.toThrow("native_chat_not_ready");
  expect(send).not.toHaveBeenCalled();
  await expect(controller.submit("Describe it.")).rejects.toThrow(
    "fixture lost image acknowledgement"
  );
  expect(controller.read().imageDraft?.name).toBe("chosen.png");
  controller.selectOperatingRegime("plan");
  await expect(controller.submit("Describe it.")).rejects.toThrow(
    "native_chat_pending_regime_changed"
  );
  expect(send).toHaveBeenCalledTimes(1);
  controller.selectOperatingRegime("act");
  await controller.pickPng(scope, {
    name: "same-bytes.png",
    size: png.byteLength,
    arrayBuffer: async () => png.slice(0),
  });
  await controller.submit("Describe it.");
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  expect(send.mock.calls[1]).toEqual([
    "chat-a",
    {
      action: "enqueue",
      inputId: expect.any(String),
      text: "Describe it.",
      png,
      operatingRegime: "act",
    },
  ]);
  expect(controller.read().imageDraft).toBeNull();
  expect(textSend).not.toHaveBeenCalled();

  const late = Promise.withResolvers<ArrayBuffer>();
  const reading = controller.pickPng(scope, {
    name: "stale.png",
    size: png.byteLength,
    arrayBuffer: () => late.promise,
  });
  await controller.select("chat-b");
  late.resolve(png);
  await reading;
  await controller.pickPng(scope, {
    name: "old-chooser.png",
    size: png.byteLength,
    arrayBuffer: async () => png,
  });
  expect(controller.read().imageDraft).toBeNull();
  expect(controller.read().imageReading).toBe(false);
  controller.disconnect();
});

it("uses the readiness probe and preserves native mode through startup failure", async () => {
  const { bridge } = fixture();
  const availability = vi.spyOn(bridge, "available");
  const publish = vi.fn<(state: string | null) => void>();
  const status = vi.fn<NonNullable<DesktopNativeChat["status"]>>();
  status
    .mockResolvedValueOnce("native-starting")
    .mockResolvedValueOnce("native-unavailable");
  const stop = NativeChatController.watchReadiness(
    { ...bridge, status },
    publish
  );
  await vi.waitFor(() => {
    expect(publish.mock.calls).toEqual([
      ["native-starting"],
      ["native-unavailable"],
    ]);
  });
  expect(status.mock.calls).toEqual([[], [true]]);
  expect(availability).not.toHaveBeenCalled();
  stop();
});

it("keeps the old bridge's legacy selection and drops a disposed startup reply", async () => {
  const { bridge } = fixture();
  const publish = vi.fn<(state: string | null) => void>();
  vi.spyOn(bridge, "available").mockResolvedValue(false);
  const stopLegacy = NativeChatController.watchReadiness(bridge, publish);
  await vi.waitFor(() =>
    expect(publish).toHaveBeenCalledExactlyOnceWith("legacy")
  );
  stopLegacy();
  publish.mockClear();

  const started = Promise.withResolvers<"native-ready">();
  const status = vi.fn<NonNullable<DesktopNativeChat["status"]>>();
  status
    .mockResolvedValueOnce("native-starting")
    .mockReturnValueOnce(started.promise);
  const stopNative = NativeChatController.watchReadiness(
    { ...bridge, status },
    publish
  );
  await vi.waitFor(() => expect(status).toHaveBeenCalledTimes(2));
  stopNative();
  started.resolve("native-ready");
  await started.promise;
  expect(publish).toHaveBeenCalledExactlyOnceWith("native-starting");
});

it("uses catalog membership, retains an exact rename draft on conflict, and ignores a retired mutation reply", async () => {
  const { bridge, running, transcripts } = fixture();
  const entries = new Map<string, NativeChatCatalogEntry>([
    [
      "chat-a",
      { sessionId: "chat-a", revision: 1, title: "First", archived: false },
    ],
    [
      "chat-b",
      {
        sessionId: "chat-b",
        revision: 1,
        title: "Saved archive",
        archived: true,
      },
    ],
  ]);
  const listing = (archived: boolean) => ({
    sessionIds: [...entries.values()]
      .filter((entry) => entry.archived === archived)
      .map((entry) => entry.sessionId),
    nextCursor: null,
  });
  const list = vi.fn<DesktopNativeChat["list"]>(async () => listing(false));
  bridge.list = list;
  bridge.listArchived = async () => listing(true);
  bridge.catalogEntry = async (sessionId) => entries.get(sessionId)!;
  const organize = vi.fn<NonNullable<DesktopNativeChat["organize"]>>(
    async (sessionId, change) => {
      const current = entries.get(sessionId)!;
      if (change.revision !== current.revision)
        throw new Error("session_catalog_revision_changed");
      const next = { ...change, sessionId, revision: current.revision + 1 };
      entries.set(sessionId, next);
      return next;
    }
  );
  bridge.organize = organize;
  const memory = {
    getItem: () =>
      JSON.stringify({ selected: "chat-a", sessions: ["chat-b", "chat-a"] }),
    setItem: () => {},
  };
  const controller = new NativeChatController(bridge, memory, "fixture");
  running.add("chat-a");
  transcripts.set("chat-a", [
    { messageId: "kept", role: "user", text: "Working request." },
  ]);
  controller.connect(null);
  await vi.waitFor(() =>
    expect(controller.read().catalogEntry?.title).toBe("First")
  );
  expect(controller.read().sessions).toEqual(["chat-a"]);
  controller.beginRename();
  controller.changeTitle("My rename");
  entries.set("chat-a", {
    ...entries.get("chat-a")!,
    revision: 2,
    title: "Changed elsewhere",
  });
  await controller.saveTitle();
  expect(controller.chatTitle("chat-a")).toBe("Changed elsewhere");
  expect(controller.read().catalogDraft?.text).toBe("My rename");
  expect(organize).toHaveBeenCalledExactlyOnceWith("chat-a", {
    revision: 1,
    title: "My rename",
    archived: false,
  });
  await controller.saveTitle();
  expect(controller.chatTitle("chat-a")).toBe("My rename");
  expect(organize).toHaveBeenLastCalledWith("chat-a", {
    revision: 2,
    title: "My rename",
    archived: false,
  });
  const stalePage = Promise.withResolvers<NativeChatPage>();
  list.mockReturnValueOnce(stalePage.promise);
  const refresh = controller.listChats();
  await vi.waitFor(() =>
    expect(list.mock.results.at(-1)?.value).toBe(stalePage.promise)
  );
  await controller.setChatArchived(true);
  stalePage.resolve({ sessionIds: ["chat-a"], nextCursor: null });
  await refresh;
  expect(controller.read().sessions).not.toContain("chat-a");
  expect(controller.read().selected).toBe("chat-a");
  expect(controller.read().observation?.snapshot.current?.turnId).toBe(
    "turn-chat-a"
  );
  expect(controller.read().messages[0]?.text).toBe("Working request.");
  await controller.listChats(null, true);
  expect(controller.read().sessions).toContain("chat-a");

  const late = Promise.withResolvers<NativeChatCatalogEntry>();
  organize.mockReturnValueOnce(late.promise);
  const restore = controller.setChatArchived(false);
  await controller.select("chat-b");
  late.resolve({ ...entries.get("chat-a")!, archived: false });
  await restore;
  expect(controller.read().catalogEntry).toMatchObject({
    sessionId: "chat-b",
    title: "Saved archive",
    archived: true,
  });
  controller.disconnect();
});

it("browses saved pages without opening a chat until it is selected", async () => {
  const { bridge } = fixture();
  const load = vi.spyOn(bridge, "load");
  const create = vi.spyOn(bridge, "create");
  const list = vi
    .spyOn(bridge, "list")
    .mockImplementation(async (cursor) =>
      cursor === "older"
        ? { sessionIds: ["old"], nextCursor: null }
        : { sessionIds: ["newest"], nextCursor: "older" }
    );
  const storage = {
    getItem: () => JSON.stringify({ selected: null, sessions: ["recent"] }),
    setItem: vi.fn<Storage["setItem"]>(),
  };
  const controller = new NativeChatController(bridge, storage, "fixture");
  controller.connect(null);
  await vi.waitFor(() => {
    expect(controller.read().sessions).toEqual(["recent", "newest"]);
    expect(controller.read().catalogLoading).toBe(false);
  });
  await controller.listChats(controller.read().nextCatalogCursor);
  expect(list.mock.calls).toEqual([[null], ["older"]]);
  expect(controller.read().sessions).toEqual(["recent", "old"]);
  expect(controller.read().selected).toBeNull();
  expect(load).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();

  await controller.select("old");
  expect(load).toHaveBeenCalledExactlyOnceWith("old");
  await controller.listChats();
  expect(controller.read().sessions).toEqual(["old", "recent", "newest"]);
  expect(storage.setItem).toHaveBeenLastCalledWith(
    "fixture",
    JSON.stringify({ selected: "old", sessions: ["old", "recent"] })
  );
  controller.disconnect();
});

it("drops an obsolete page and serializes the next connection's request", async () => {
  const { bridge, controller } = fixture();
  const old =
    Promise.withResolvers<Awaited<ReturnType<DesktopNativeChat["list"]>>>();
  const list = vi
    .spyOn(bridge, "list")
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ sessionIds: ["current"], nextCursor: null });
  controller.connect(null);
  await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  controller.disconnect();
  controller.connect(null);
  expect(list).toHaveBeenCalledTimes(1);
  old.resolve({ sessionIds: ["obsolete"], nextCursor: "obsolete-cursor" });
  await vi.waitFor(() => {
    expect(controller.read().sessions).toEqual(["current"]);
    expect(controller.read().nextCatalogCursor).toBeNull();
  });
  expect(list).toHaveBeenCalledTimes(2);
  controller.disconnect();
});

function text(
  id: string,
  content: string,
  offsetBytes: number,
  replace = false
): NativeChatUpdate {
  return {
    kind: "text",
    role: "assistant",
    messageId: `message-${id}`,
    turnId: `turn-${id}`,
    text: content,
    offsetBytes,
    replace,
  };
}

function message(id: string, content: string): NativeChatMessage {
  return { messageId: `message-${id}`, role: "assistant", text: content };
}

describe("Native workspace chat controller", () => {
  it("projects UTF-8 offsets, duplicate chunks, and a final replacement without repeating text", async () => {
    const { controller, running, updates } = fixture();
    running.add("a");
    try {
      await controller.select("a");
      updates.get("a")!(text("a", "한", 0));
      updates.get("a")!(text("a", "글", 3));
      updates.get("a")!(text("a", "글", 3));
      expect(controller.read().messages.map((entry) => entry.text)).toEqual([
        "한글",
      ]);
      updates.get("a")!(text("a", "Verified", 0, true));
      expect(controller.read().messages.map((entry) => entry.text)).toEqual([
        "Verified",
      ]);
    } finally {
      controller.disconnect();
    }
  });

  it("replaces a gapped stream with committed text and ignores late provisional chunks", async () => {
    const { controller, running, updates, transcripts } = fixture();
    running.add("a");
    try {
      await controller.select("a");
      updates.get("a")!(text("a", "Part", 0));
      transcripts.set("a", [message("a", "Complete durable text")]);
      updates.get("a")!(text("a", "after a gap", 10));
      expect(controller.read().repairing).toBe(true);
      await vi.waitFor(() =>
        expect(controller.read().messages).toEqual([
          message("a", "Complete durable text"),
        ])
      );
      updates.get("a")!(text("a", "Late", 0, true));
      expect(controller.read().messages).toEqual([
        message("a", "Complete durable text"),
      ]);
    } finally {
      controller.disconnect();
    }
  });

  it("never installs a previous chat's delayed replay or live callback after switching", async () => {
    const { controller, bridge, updates, transcripts } = fixture();
    const detach = vi.spyOn(bridge, "detach");
    let finish: ((value: readonly NativeChatMessage[]) => void) | undefined;
    vi.spyOn(bridge, "transcript").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    transcripts.set("b", [message("b", "Second chat")]);
    try {
      const first = controller.select("a");
      await vi.waitFor(() => expect(finish).toBeDefined());
      const stale = updates.get("a")!;
      await controller.select("b");
      finish!([message("a", "First chat")]);
      await first;
      stale(text("a", "Late first chat", 0));
      expect(controller.read().selected).toBe("b");
      expect(controller.read().messages).toEqual([message("b", "Second chat")]);
      expect(detach).toHaveBeenCalledWith("a");
    } finally {
      controller.disconnect();
    }
  });

  it("keeps the same submission identity when a user retries an unconfirmed send", async () => {
    const { controller, bridge } = fixture();
    const submit = vi
      .spyOn(bridge, "submit")
      .mockRejectedValueOnce(new Error("lost_reply"));
    try {
      await controller.select(null);
      await expect(controller.submit("Fixture prompt")).rejects.toThrow(
        "lost_reply"
      );
      expect(controller.read().error).toContain("draft is still here");
      await controller.submit("Fixture prompt");
      expect(submit.mock.calls).toHaveLength(2);
      expect(submit.mock.calls[0]).toEqual(submit.mock.calls[1]);
      expect(controller.read().selected).toBe("new");
    } finally {
      controller.disconnect();
    }
  });

  it("does not refresh or clear the selected chat when another chat's submission finishes", async () => {
    const { controller, bridge, transcripts } = fixture();
    const submit = bridge.submit.bind(bridge);
    let accept: (() => void) | undefined;
    vi.spyOn(bridge, "submit").mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        accept = resolve;
      });
      return submit(...args);
    });
    transcripts.set("b", [message("b", "Keep this chat")]);
    try {
      await controller.select("a");
      const pending = controller.submit("Old chat prompt");
      await vi.waitFor(() => expect(accept).toBeDefined());
      await controller.select("b");
      accept!();
      await pending;
      expect(controller.read()).toEqual(
        expect.objectContaining({
          selected: "b",
          acting: false,
          messages: [message("b", "Keep this chat")],
        })
      );
    } finally {
      controller.disconnect();
    }
  });
});
