import { describe, expect, it, vi } from "vitest";
import type {
  DesktopNativeChat,
  NativeChatMessage,
  NativeChatObservation,
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
