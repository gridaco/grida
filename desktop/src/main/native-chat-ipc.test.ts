// GRIDA-SEC-004 — scoped native chat IPC and observation fixtures.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import type {
  NativeChatSnapshot,
  NativeChatStreamUpdate,
} from "@grida/desktop-bridge";
import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../bridge/contract";
import { NativeChatIpc, type ActiveNativeChat } from "./native-chat-ipc";
import type { NativeChatSession } from "./native-agent-chat";

const ORIGIN = "https://fixture.invalid";
const WORKSPACE = "workspace";
const WORKSPACE_URL = `${ORIGIN}/desktop/workspace?id=${WORKSPACE}`;
const UPDATE = {
  kind: "text",
  role: "assistant",
  messageId: "message",
  turnId: "turn",
  text: "Visible text",
  offsetBytes: 0,
  replace: true,
} as const;

function windowAt(url = WORKSPACE_URL) {
  let loading = false;
  const frame = {
    url,
    send: vi.fn<(channel: string, payload: unknown) => void>(),
  };
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => loading,
  });
  const sender = contents as unknown as WebContents;
  return {
    frame,
    contents,
    sender,
    setLoading: (value: boolean) => {
      loading = value;
    },
    event: { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent,
  };
}

function setup() {
  const first = windowAt();
  const second = windowAt();
  const scopes = new Map<WebContents, ActiveNativeChat>();
  const listeners = new Map<
    string,
    Set<(update: NativeChatStreamUpdate) => void>
  >();
  const sessions = new Map<string, NativeChatSession>();
  const load = (id: string): NativeChatSession => {
    const session = sessions.get(id) ?? { id };
    sessions.set(id, session);
    return session;
  };
  let position = 1;
  const snapshot = (id: string): NativeChatSnapshot => ({
    sessionId: id,
    sessionRevision: position,
    queuedInputs: 0,
    admissionPaused: false,
    current: {
      turnId: "turn",
      epoch: 1,
      controlRevision: position,
      journalPosition: position,
      historyPosition: 1,
      paused: false,
      cancelled: false,
      disposition: "running",
      status: null,
    },
    latest: null,
  });
  const chat: ActiveNativeChat["chat"] = {
    async list() {
      return { sessionIds: [], nextCursor: null };
    },
    async create() {
      return load(`session-${sessions.size}`);
    },
    async load(id) {
      return load(id);
    },
    async submit(session, inputId) {
      return {
        sessionId: session.id,
        inputId,
        inputPosition: 1,
        turnId: "turn",
        disposition: "claimed",
      };
    },
    async enqueue(session, inputId) {
      return {
        sessionId: session.id,
        inputId,
        inputPosition: 2,
        turnId: null,
        disposition: "queued",
      };
    },
    async inputReceipt(session, inputId) {
      return this.submit(session, inputId, "Fixture");
    },
    async observe(session) {
      return snapshot(session.id);
    },
    async queue(_session, _snapshot, offset) {
      return { items: [], offset, previousOffset: null, nextOffset: null };
    },
    async queuedText() {
      return "Fixture";
    },
    async editQueue(session, observed, change) {
      return {
        sessionId: session.id,
        requestId: change.requestId,
        sessionRevision: observed.sessionRevision + 1,
      };
    },
    async steer(session, observed, input) {
      return this.pause(session, observed, input.requestId);
    },
    async approvals() {
      return [];
    },
    async answerApproval(session, review) {
      return {
        sessionId: session.id,
        turnId: review.turnId,
        requestId: "native-review",
        sessionRevision: review.sessionRevision + 1,
        journalPosition: review.controlRevision + 1,
      };
    },
    async questions() {
      return [];
    },
    async answerQuestion(session, review) {
      return {
        sessionId: session.id,
        turnId: review.task.turnId,
        requestId: review.task.requestId,
        sessionRevision: review.task.expectedSessionRevision + 1,
        journalPosition: review.expectedHistoryPosition + 1,
      };
    },
    async transcript() {
      return [];
    },
    async stop(session, observed, requestId) {
      return this.pause(session, observed, requestId);
    },
    async pause(session, observed, requestId) {
      return {
        sessionId: session.id,
        turnId: observed.current!.turnId,
        requestId,
        sessionRevision: observed.sessionRevision,
        journalPosition: observed.current!.journalPosition,
      };
    },
    async resume(_session, observed) {
      return observed.current!;
    },
    subscribe(session, listener) {
      const active = listeners.get(session.id) ?? new Set();
      listeners.set(session.id, active);
      active.add(listener);
      return () => {
        active.delete(listener);
      };
    },
  };
  scopes.set(first.sender, { workspaceId: WORKSPACE, chat });
  scopes.set(second.sender, { workspaceId: WORKSPACE, chat });
  return {
    first,
    second,
    chat,
    scopes,
    listeners,
    advance: () => {
      position += 1;
    },
    ipc: new NativeChatIpc(ORIGIN, (sender) => scopes.get(sender) ?? null),
    emit: (sessionId: string, update: NativeChatStreamUpdate) => {
      for (const listener of listeners.get(sessionId) ?? []) listener(update);
    },
  };
}

describe("native chat IPC", () => {
  it("rechecks navigation after queued replacement preflight and keeps steering scoped", async () => {
    const { ipc, first, second, chat } = setup();
    const one = await ipc.create(first.event);
    const two = await ipc.load(second.event, one.sessionId);
    const basis = await ipc.observe(first.event, one.attachmentId);
    const change = {
      action: "replace",
      inputId: "queued",
      text: "draft",
      requestId: "replace",
      observationId: basis.observationId,
    };
    const beforeDispatch = Promise.withResolvers<void>();
    let dispatched = false;
    vi.spyOn(chat, "editQueue").mockImplementation(
      async (session, snapshot, edit, revalidate) => {
        await beforeDispatch.promise;
        revalidate?.();
        dispatched = true;
        return {
          sessionId: session.id,
          requestId: edit.requestId,
          sessionRevision: snapshot.sessionRevision,
        };
      }
    );
    await expect(
      ipc.editQueue(first.event, one.attachmentId, {
        ...change,
        inputIds: ["injected"],
      })
    ).rejects.toThrow("native_chat_queue_change_invalid");
    await expect(
      ipc.steer(second.event, two.attachmentId, {
        observationId: basis.observationId,
        requestId: "steer",
        text: "Correction",
      })
    ).rejects.toThrow("native_chat_observation_unavailable");
    const pending = ipc.editQueue(first.event, one.attachmentId, change);
    first.contents.emit("did-start-navigation", { isMainFrame: true });
    beforeDispatch.resolve();
    await expect(pending).rejects.toThrow("native_chat_attachment_unavailable");
    expect(dispatched).toBe(false);
  });

  it("binds question answers to their attachment and rejects approval and malformed inputs", async () => {
    const { ipc, first, second, chat } = setup();
    const one = await ipc.create(first.event);
    const two = await ipc.load(second.event, one.sessionId);
    const observation = await ipc.observe(first.event, one.attachmentId);
    const review = {
      task: {
        sessionId: one.sessionId,
        turnId: "turn",
        requestId: "question-request",
        expectedSessionRevision: observation.snapshot.sessionRevision,
        expectedControlRevision: observation.snapshot.current!.controlRevision,
      },
      expectedHistoryPosition: observation.snapshot.current!.historyPosition,
      waitId: "wait",
      style: "nonblocking",
      question: "Which edition?",
      options: ["Digital", "Print"],
    } as const;
    vi.spyOn(chat, "questions").mockResolvedValue([review]);
    const answer = vi.spyOn(chat, "answerQuestion");
    const [shown] = await ipc.questions(
      first.event,
      one.attachmentId,
      observation.observationId
    );
    expect(shown).toEqual({
      questionId: expect.any(String),
      reviewId: expect.any(String),
      style: "nonblocking",
      question: "Which edition?",
      options: ["Digital", "Print"],
    });
    await expect(
      ipc.answerApproval(
        first.event,
        one.attachmentId,
        shown.reviewId,
        "approve_once"
      )
    ).rejects.toThrow("native_chat_approval_unavailable");
    await expect(
      ipc.answerQuestion(second.event, two.attachmentId, shown.reviewId, {
        kind: "choice",
        index: 1,
      })
    ).rejects.toThrow("native_chat_question_unavailable");
    await expect(
      ipc.answerQuestion(first.event, one.attachmentId, shown.reviewId, {
        kind: "choice",
        index: 2,
      })
    ).rejects.toThrow("native_chat_question_answer_invalid");
    await expect(
      ipc.answerQuestion(first.event, one.attachmentId, shown.reviewId, {
        kind: "text",
        text: "Print",
        waitId: "injected",
      })
    ).rejects.toThrow("native_chat_question_answer_invalid");
    const selected = { kind: "choice", index: 1 } as const;
    await ipc.answerQuestion(
      first.event,
      one.attachmentId,
      shown.reviewId,
      selected
    );
    expect(answer).toHaveBeenCalledExactlyOnceWith(
      { id: one.sessionId },
      review,
      selected
    );
    first.contents.emit("did-start-navigation", { isMainFrame: true });
    await expect(
      ipc.answerQuestion(
        first.event,
        one.attachmentId,
        shown.reviewId,
        selected
      )
    ).rejects.toThrow("native_chat_attachment_unavailable");
  });

  it("issues stable exact approval tokens only to their observing attachment", async () => {
    const { ipc, first, second, chat } = setup();
    const one = await ipc.create(first.event);
    const two = await ipc.load(second.event, one.sessionId);
    const basis = await ipc.observe(first.event, one.attachmentId);
    const review = {
      sessionId: one.sessionId,
      turnId: "turn",
      waitId: "wait",
      sessionRevision: basis.snapshot.sessionRevision,
      controlRevision: basis.snapshot.current!.controlRevision,
      directory: "additional",
      root: "/fixture/chosen",
      tool: "read_file",
      relativePath: "note.txt",
    } as const;
    const list = vi.spyOn(chat, "approvals").mockResolvedValue([review]);
    const answer = vi.spyOn(chat, "answerApproval");
    await expect(
      ipc.approvals(second.event, two.attachmentId, basis.observationId)
    ).rejects.toThrow("native_chat_observation_unavailable");
    const [shown] = await ipc.approvals(
      first.event,
      one.attachmentId,
      basis.observationId
    );
    expect(list).toHaveBeenCalledWith({ id: one.sessionId }, basis.snapshot);
    expect(shown).toEqual({
      reviewId: expect.any(String),
      tool: "read_file",
      root: "/fixture/chosen",
      relativePath: "note.txt",
    });
    await expect(
      ipc.approvals(first.event, one.attachmentId, basis.observationId)
    ).resolves.toEqual([shown]);
    await expect(
      ipc.answerApproval(
        second.event,
        two.attachmentId,
        shown.reviewId,
        "approve_once"
      )
    ).rejects.toThrow("native_chat_approval_unavailable");
    await expect(
      ipc.answerApproval(first.event, one.attachmentId, shown.reviewId, {
        decision: "approve_once",
        root: "/injected",
      })
    ).rejects.toThrow("native_chat_approval_decision_invalid");
    const receipt = await ipc.answerApproval(
      first.event,
      one.attachmentId,
      shown.reviewId,
      "approve_once"
    );
    await expect(
      ipc.answerApproval(
        first.event,
        one.attachmentId,
        shown.reviewId,
        "approve_once"
      )
    ).resolves.toEqual(receipt);
    expect(answer).toHaveBeenLastCalledWith(
      { id: one.sessionId },
      review,
      "approve_once"
    );

    first.contents.emit("did-start-navigation", { isMainFrame: true });
    await expect(
      ipc.answerApproval(
        first.event,
        one.attachmentId,
        shown.reviewId,
        "approve_once"
      )
    ).rejects.toThrow("native_chat_attachment_unavailable");
    expect(answer).toHaveBeenCalledTimes(2);
  });

  it("starts only the admitted route's workspace and shares the pending start", async () => {
    const { first, second, scopes, chat, ipc: legacy } = setup();
    scopes.delete(first.sender);
    await expect(legacy.status(first.event, true)).resolves.toBe("legacy");

    const started = Promise.withResolvers<void>();
    const ensure = vi.fn<(id: string) => Promise<void>>(() => started.promise);
    const ipc = new NativeChatIpc(
      ORIGIN,
      (sender) => scopes.get(sender) ?? null,
      {
        admits: (sender) => sender === first.sender,
        ensure,
      }
    );
    await expect(ipc.status(first.event)).resolves.toBe("native-starting");
    expect(ensure).not.toHaveBeenCalled();
    await expect(
      ipc.status(first.event, { id: "injected" } as unknown as boolean)
    ).rejects.toThrow("native_chat_start_invalid");
    await expect(ipc.status(second.event, true)).rejects.toThrow(
      "native_chat_scope_changed"
    );
    await expect(
      ipc.status(
        {
          ...first.event,
          senderFrame: { ...first.frame },
        } as unknown as IpcMainInvokeEvent,
        true
      )
    ).rejects.toThrow("native_chat_scope_changed");
    first.frame.url = `${WORKSPACE_URL}&id=injected`;
    await expect(ipc.status(first.event, true)).rejects.toThrow(
      "native_chat_scope_changed"
    );
    first.frame.url = WORKSPACE_URL;
    const status = ipc.status(first.event, true);
    const compatible = ipc.available(first.event);
    await vi.waitFor(() =>
      expect(ensure).toHaveBeenCalledExactlyOnceWith(WORKSPACE)
    );
    scopes.set(first.sender, { workspaceId: WORKSPACE, chat });
    started.resolve();
    await expect(status).resolves.toBe("native-ready");
    await expect(compatible).resolves.toBe(true);
    await expect(ipc.status(first.event)).resolves.toBe("native-ready");
  });

  it("reports an unavailable native startup without falling back and can retry", async () => {
    const { first, scopes, chat } = setup();
    scopes.delete(first.sender);
    const ensure = vi.fn<(id: string) => Promise<void>>();
    ensure
      .mockRejectedValueOnce(new Error("private provider error"))
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => {
        scopes.set(first.sender, { workspaceId: WORKSPACE, chat });
      });
    const ipc = new NativeChatIpc(
      ORIGIN,
      (sender) => scopes.get(sender) ?? null,
      {
        admits: () => true,
        ensure,
      }
    );
    await expect(ipc.status(first.event, true)).resolves.toBe(
      "native-unavailable"
    );
    await expect(ipc.available(first.event)).rejects.toThrow(
      "native_chat_unavailable"
    );
    await expect(ipc.status(first.event, true)).resolves.toBe("native-ready");
  });

  it("rejects a startup reply after navigation even if the frame returns to the same URL", async () => {
    const { first, scopes, chat } = setup();
    scopes.delete(first.sender);
    const started = Promise.withResolvers<void>();
    const ensure = vi.fn<(id: string) => Promise<void>>(() => started.promise);
    const ipc = new NativeChatIpc(
      ORIGIN,
      (sender) => scopes.get(sender) ?? null,
      {
        admits: () => true,
        ensure,
      }
    );
    const old = ipc.status(first.event, true);
    await vi.waitFor(() => expect(ensure).toHaveBeenCalledTimes(1));
    first.contents.emit("did-navigate-in-page", {}, WORKSPACE_URL, true);
    scopes.set(first.sender, { workspaceId: WORKSPACE, chat });
    started.resolve();
    await expect(old).rejects.toThrow("native_chat_scope_changed");
    await expect(ipc.status(first.event)).resolves.toBe("native-ready");
  });

  it("lists without attaching and drops replies after the admitted frame changes", async () => {
    const { ipc, first, chat, scopes } = setup();
    const load = vi.spyOn(chat, "load");
    const page = { sessionIds: ["saved-chat"], nextCursor: "opaque-page" };
    const list = vi.spyOn(chat, "list").mockResolvedValue(page);
    await expect(ipc.list(first.event)).resolves.toEqual(page);
    expect(load).not.toHaveBeenCalled();

    const pending = Promise.withResolvers<typeof page>();
    list.mockReturnValueOnce(pending.promise);
    const listing = ipc.list(first.event, page.nextCursor);
    await expect(ipc.list(first.event)).rejects.toThrow(
      "native_chat_catalog_busy"
    );
    expect(list).toHaveBeenLastCalledWith(page.nextCursor);

    first.contents.emit("did-start-navigation", { isMainFrame: true });
    pending.resolve(page);
    await expect(listing).rejects.toThrow("native_chat_attachment_unavailable");
    scopes.set(first.sender, { workspaceId: "other-workspace", chat });
    await expect(ipc.list(first.event)).rejects.toThrow(
      "native_chat_unavailable"
    );
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("requires a current main frame and main-owned workspace with separate sender handles", async () => {
    const { ipc, first, second } = setup();
    expect(ipc.available(first.event)).toBe(true);
    first.setLoading(true);
    await expect(ipc.create(first.event)).rejects.toThrow(
      "native_chat_unavailable"
    );
    first.setLoading(false);
    expect(
      ipc.available({
        ...first.event,
        senderFrame: { ...first.frame },
      } as unknown as IpcMainInvokeEvent)
    ).toBe(false);
    const one = await ipc.create(first.event);
    const iframe = {
      ...first.event,
      senderFrame: { ...first.frame },
    } as unknown as IpcMainInvokeEvent;
    await expect(ipc.create(iframe)).rejects.toThrow("native_chat_unavailable");
    expect(
      (await ipc.observe(first.event, one.attachmentId)).snapshot.sessionId
    ).toBe(one.sessionId);
    const two = await ipc.load(second.event, one.sessionId);
    expect(two.attachmentId).not.toBe(one.attachmentId);
    await expect(ipc.observe(second.event, one.attachmentId)).rejects.toThrow(
      "native_chat_attachment_unavailable"
    );
    first.frame.url = `${ORIGIN}/desktop/workspace?id=other`;
    expect(ipc.available(first.event)).toBe(false);
    await expect(ipc.observe(first.event, one.attachmentId)).rejects.toThrow(
      "native_chat_scope_changed"
    );
    first.frame.url = `${WORKSPACE_URL}&id=other`;
    await expect(ipc.create(first.event)).rejects.toThrow(
      "native_chat_unavailable"
    );
    first.frame.url = WORKSPACE_URL.replace(ORIGIN, "https://other.invalid");
    expect(ipc.available(first.event)).toBe(false);
  });

  it("keeps the exact observed control basis and rejects a copied observation from a different attachment", async () => {
    const { ipc, first, advance } = setup();
    const one = await ipc.create(first.event);
    const two = await ipc.create(first.event);
    const observed = await ipc.observe(first.event, one.attachmentId);
    expect(
      (await ipc.observe(first.event, one.attachmentId)).observationId
    ).toBe(observed.observationId);
    advance();
    const later = await ipc.observe(first.event, one.attachmentId);
    expect(later.observationId).not.toBe(observed.observationId);
    const control = {
      action: "pause",
      requestId: "pause-1",
      observationId: observed.observationId,
    };
    await expect(
      ipc.control(first.event, two.attachmentId, control)
    ).rejects.toThrow("native_chat_observation_unavailable");
    const result = await ipc.control(first.event, one.attachmentId, control);
    expect(result).toEqual({
      action: "pause",
      receipt: {
        sessionId: one.sessionId,
        turnId: "turn",
        requestId: "pause-1",
        sessionRevision: observed.snapshot.sessionRevision,
        journalPosition: 1,
      },
    });
  });

  it("delivers only scoped updates and detaches on top-level navigation without a chat control", async () => {
    const { ipc, first, second, listeners, emit, chat } = setup();
    const pause = vi.spyOn(chat, "pause");
    const one = await ipc.create(first.event);
    const two = await ipc.create(second.event);
    const subscriptionId = randomUUID();
    ipc.subscribe(first.event, one.attachmentId, subscriptionId);
    ipc.subscribe(second.event, two.attachmentId, randomUUID());
    emit(one.sessionId, UPDATE);
    expect(first.frame.send).toHaveBeenCalledWith(
      IPC_CHANNELS.NATIVE_CHAT_UPDATE,
      {
        subscriptionId,
        attachmentId: one.attachmentId,
        update: UPDATE,
      }
    );
    expect(second.frame.send).not.toHaveBeenCalled();
    first.contents.emit("did-start-navigation", { isMainFrame: false });
    emit(one.sessionId, { kind: "resync" });
    expect(first.frame.send).toHaveBeenCalledTimes(2);
    first.contents.emit("did-start-navigation", { isMainFrame: true });
    expect(listeners.get(one.sessionId)?.size).toBe(0);
    emit(one.sessionId, UPDATE);
    expect(first.frame.send).toHaveBeenCalledTimes(2);
    await expect(ipc.observe(first.event, one.attachmentId)).rejects.toThrow(
      "native_chat_attachment_unavailable"
    );
    expect(pause).not.toHaveBeenCalled();
    expect(listeners.get(two.sessionId)?.size).toBe(1);
  });

  it("rejects a late observation after navigation and closes a stream at its delivery bound", async () => {
    const { ipc, first, chat, emit, listeners } = setup();
    const one = await ipc.create(first.event);
    const observe = chat.observe.bind(chat);
    let finish: ((value: NativeChatSnapshot) => void) | undefined;
    const late = vi.spyOn(chat, "observe").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = ipc.observe(first.event, one.attachmentId);
    first.contents.emit("did-navigate-in-page", {}, WORKSPACE_URL, true);
    finish!(await observe({ id: one.sessionId }));
    await expect(pending).rejects.toThrow("native_chat_attachment_unavailable");
    expect(late).toHaveBeenCalledOnce();
    const current = await ipc.load(first.event, one.sessionId);
    const subscriptionId = randomUUID();
    ipc.subscribe(first.event, current.attachmentId, subscriptionId);
    emit(one.sessionId, { ...UPDATE, text: "x".repeat(8193) });
    expect(first.frame.send).not.toHaveBeenCalled();
    for (let i = 0; i < 129; i++)
      emit(one.sessionId, { ...UPDATE, text: "x".repeat(8192) });
    expect(first.frame.send).toHaveBeenLastCalledWith(
      IPC_CHANNELS.NATIVE_CHAT_UPDATE,
      {
        subscriptionId,
        attachmentId: current.attachmentId,
        update: { kind: "closed", reason: "delivery_limit" },
      }
    );
    expect(listeners.get(one.sessionId)?.size).toBe(0);
  });

  it("registers each native chat invoke through the guarded IPC entrypoint", () => {
    const handlers = fs.readFileSync(
      new URL("./ipc-handlers.ts", import.meta.url),
      "utf8"
    );
    for (const key of Object.keys(IPC_CHANNELS).filter(
      (key) => key.startsWith("NATIVE_CHAT_") && key !== "NATIVE_CHAT_UPDATE"
    )) {
      expect(handlers).toMatch(
        new RegExp(`guarded\\(\\s*IPC_CHANNELS\\.${key}\\b`)
      );
      expect(handlers).not.toMatch(
        new RegExp(`ipcMain.handle\\(\\s*IPC_CHANNELS\\.${key}\\b`)
      );
    }
  });
});
