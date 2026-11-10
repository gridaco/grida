// GRIDA-SEC-004 — scoped native chat IPC and observation fixtures.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import type {
  NativeChatSnapshot,
  NativeChatStreamUpdate,
  NativeChatWakeup,
} from "@grida/desktop-bridge";
import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../bridge/contract";
import {
  NativeChatIpc,
  type ActiveNativeChat,
  type ConfigurationReview,
} from "./native-chat-ipc";
import type { NativeChatSession } from "./native-agent-chat";
import type { NativeSavedChatDeletionPreview } from "./native-agent-deletion";
import { NativeEditorSurfaceEndpoints } from "./native-editor-surfaces";

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

it("binds editor observations only to an exact Act text attachment", async () => {
  const { ipc, chat, first, second } = setup();
  const endpoints = new NativeEditorSurfaceEndpoints();
  chat.registerEditorSurfaces = (
    session,
    snapshot,
    current,
    deliver,
    revision
  ) => endpoints.register(session.id, snapshot, current, deliver, revision);
  const submit = vi.spyOn(chat, "submit");
  const enqueue = vi.spyOn(chat, "enqueue");
  const attachment = await ipc.create(first.event);
  const id = attachment.attachmentId;
  const empty = { active: null, open: [], truncated: false };
  expect(() => ipc.publishEditorSurfaces(second.event, id, empty)).toThrow(
    "native_chat_attachment_unavailable"
  );
  expect(() =>
    ipc.publishEditorSurfaces(first.event, id, { ...empty, open: ["/../x"] })
  ).toThrow("native_chat_editor_surfaces_invalid");
  await ipc.submit(first.event, id, "without-snapshot", "Text", "act");
  expect(submit.mock.calls.at(-1)).toHaveLength(4);
  ipc.publishEditorSurfaces(first.event, id, empty);
  await ipc.submit(first.event, id, "act", "Text", "act");
  const selection = submit.mock.calls.at(-1)?.[4];
  const endpointId = selection?.editorEndpointId;
  expect(endpointId).toMatch(/^[a-f0-9-]{36}$/);
  expect(selection).not.toHaveProperty("editorPresentation");
  const read = { sessionId: attachment.sessionId, endpointId };
  expect(endpoints.read(read)).toEqual({ ...read, available: true, ...empty });
  expect(endpoints.read({ ...read, sessionId: "other" })).toMatchObject({
    available: false,
  });
  await ipc.submit(first.event, id, "plan", "Text", "plan");
  expect(submit.mock.calls.at(-1)).toHaveLength(4);
  await ipc.enqueue(first.event, id, "queue", "Text", "act");
  expect(enqueue.mock.calls.at(-1)).toHaveLength(4);
  const unsubscribed = { ...read, callId: randomUUID(), path: "/result.svg" };
  expect(endpoints.open(unsubscribed)).toMatchObject({ requested: false });
  ipc.publishEditorSurfaces(first.event, id, empty, 1);
  await ipc.submit(first.event, id, "act-present", "Text", "act");
  expect(submit.mock.calls.at(-1)?.[4]).toEqual({
    editorEndpointId: endpointId,
    editorPresentation: true,
  });
  expect(endpoints.open(unsubscribed)).toMatchObject({ requested: false });
  const call = { ...read, callId: randomUUID(), path: "/result.svg" };
  const reply = { ...read, callId: call.callId };
  expect(endpoints.open(call)).toEqual({ ...reply, requested: true });
  expect(endpoints.open(call)).toEqual({ ...reply, requested: true });
  expect(endpoints.open({ ...call, path: "/different.svg" })).toEqual({
    ...reply,
    requested: false,
  });
  expect(endpoints.open({ ...call, path: "/../escape" })).toBeNull();
  expect(first.frame.send).toHaveBeenCalledExactlyOnceWith(
    IPC_CHANNELS.NATIVE_CHAT_EDITOR_SURFACE_OPEN,
    {
      attachmentId: id,
      path: "/result.svg",
      revision: 1,
      expiresAtMs: expect.any(Number),
    }
  );
  expect(second.frame.send).not.toHaveBeenCalled();
  ipc.detach(first.event, id);
  expect(endpoints.read(read)).toEqual({ ...read, available: false, ...empty });
  expect(endpoints.open(call)).toEqual({ ...reply, requested: false });
});

it("keeps an edit review on the current frame and latest observed revision", async () => {
  const { ipc, chat, first, second } = setup();
  const a = await ipc.load(first.event, "chat-a");
  const b = await ipc.load(second.event, "chat-a");
  const observe = chat.observe.bind(chat);
  let revision = 4;
  chat.observe = async (session) => ({
    ...(await observe(session)),
    current: null,
    sessionRevision: revision,
  });
  const release = Promise.withResolvers<void>();
  chat.prepareRevision = async (
    _attachment,
    _session,
    snapshot,
    messageId,
    check
  ) => {
    check(snapshot.sessionRevision);
    await release.promise;
    check(snapshot.sessionRevision);
    return {
      reviewId: randomUUID(),
      messageId,
      text: "Original",
      subsequentMessages: 1,
    };
  };
  const observed = await ipc.observe(first.event, a.attachmentId);
  expect(() =>
    ipc.prepareRevision(
      second.event,
      b.attachmentId,
      observed.observationId,
      "message"
    )
  ).toThrow("native_chat_observation_unavailable");
  const waiting = ipc.prepareRevision(
    first.event,
    a.attachmentId,
    observed.observationId,
    "message"
  );
  revision = 5;
  await ipc.observe(first.event, a.attachmentId);
  release.resolve();
  await expect(waiting).rejects.toThrow("stale_session_revision");
});

it("scopes a scheduled check-in and its controls to the attached, observed turn", async () => {
  const { ipc, chat, first, second } = setup();
  const a = await ipc.load(first.event, "chat-a");
  const b = await ipc.load(second.event, "chat-b");
  expect(ipc.acceptsWakeups(first.event)).toBe(false);
  Object.defineProperty(chat, "acceptsWakeups", { value: true });
  chat.submitWithWakeup = vi.fn<NonNullable<typeof chat.submitWithWakeup>>(
    (session, inputId, text) => chat.submit(session, inputId, text)
  );
  let schedule: NativeChatWakeup = {
    turnId: "turn",
    waitId: "wait",
    dueAtMs: 1_800_000_000_000,
    reason: "Check the export",
    status: "waiting",
    armed: true,
  };
  chat.scheduledWakeup = async (session) =>
    session.id === "chat-a" ? schedule : null;
  chat.controlWakeup = vi.fn<NonNullable<typeof chat.controlWakeup>>(
    async (_session, _snapshot, _wait, action) => {
      expect(action).toBe("cancel");
      schedule = { ...schedule, armed: false, status: "cancelled" };
      return schedule;
    }
  );
  const observe = chat.observe.bind(chat);
  chat.observe = async (session) => {
    const snapshot = await observe(session);
    return {
      ...snapshot,
      current: { ...snapshot.current!, disposition: "suspended" },
    };
  };
  const aObserved = await ipc.observe(first.event, a.attachmentId);
  const bObserved = await ipc.observe(second.event, b.attachmentId);
  expect(ipc.acceptsWakeups(first.event)).toBe(true);
  await expect(
    ipc.submitWithWakeup(first.event, a.attachmentId, "input", "Check once")
  ).resolves.toMatchObject({ sessionId: "chat-a", inputId: "input" });
  await expect(
    ipc.scheduledWakeup(first.event, a.attachmentId, aObserved.observationId)
  ).resolves.toEqual(schedule);
  await expect(
    ipc.scheduledWakeup(second.event, b.attachmentId, aObserved.observationId)
  ).rejects.toThrow("native_chat_observation_unavailable");
  await expect(
    ipc.controlWakeup(
      second.event,
      b.attachmentId,
      bObserved.observationId,
      "wait",
      "cancel"
    )
  ).rejects.toThrow("native_chat_wakeup_changed");
  await expect(
    ipc.controlWakeup(
      first.event,
      a.attachmentId,
      aObserved.observationId,
      "other",
      "cancel"
    )
  ).rejects.toThrow("native_chat_wakeup_changed");
  await expect(
    ipc.controlWakeup(
      first.event,
      a.attachmentId,
      aObserved.observationId,
      "wait",
      "cancel"
    )
  ).resolves.toMatchObject({ status: "cancelled", armed: false });
  expect(chat.controlWakeup).toHaveBeenCalledTimes(1);
  const resume = vi.spyOn(chat, "resume");
  await expect(
    ipc.control(first.event, a.attachmentId, {
      action: "resume",
      requestId: "continue",
      observationId: aObserved.observationId,
      cancelledWakeupId: "wait",
    })
  ).resolves.toMatchObject({ action: "resume" });
  expect(resume).toHaveBeenCalledWith(
    expect.objectContaining({ id: "chat-a" }),
    expect.objectContaining({ sessionId: "chat-a" }),
    "continue",
    "wait"
  );
});

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

function setup(
  confirm?: (
    sender: WebContents,
    review: ConfigurationReview
  ) => Promise<boolean>,
  confirmDeletion?: (
    sender: WebContents,
    title: string | null,
    ownedChildren?: number
  ) => Promise<boolean>,
  selectArtifactDestination?: (sender: WebContents) => Promise<string | null>
) {
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
    async catalogEntry(session) {
      return {
        sessionId: session.id,
        revision: 0,
        title: null,
        archived: false,
      };
    },
    async organize(session) {
      return {
        sessionId: session.id,
        revision: 1,
        title: "Fixture",
        archived: false,
      };
    },
    async create() {
      return load(`session-${sessions.size}`);
    },
    async load(id) {
      return load(id);
    },
    async openSideChat(parent, requestId) {
      return {
        id: requestId,
        parent: parent.id,
        context: {
          sourceRevision: 1,
          compacted: false,
          truncated: false,
          omitted: false,
        },
      };
    },
    async askSideChat() {
      return {
        turnId: "side-turn",
        status: "succeeded",
        text: "Side reply",
        textTruncated: false,
      };
    },
    async closeSideChat() {},
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
    acceptsPng: false,
    async inspectContextLimit() {
      return {
        limit: null,
        exactCounting: true,
        source: "active",
        revision: null,
      };
    },
    async updateContextLimit() {},
    async sendConfiguration(session, input) {
      return this.submit(session, input.inputId, input.text);
    },
    async submitImage(session) {
      return this.submit(session, "image-input", "Describe image.");
    },
    async inputReceipt(session, inputId) {
      return this.submit(session, inputId, "Fixture");
    },
    async observe(session) {
      return snapshot(session.id);
    },
    async turnSummary(_session, observed) {
      return {
        turnId: observed.latest!.turnId,
        status: observed.latest!.status!,
        text: "Retained result",
        textTruncated: false,
        steps: 2,
        unresolvedOperations: 1,
        toolActivity: null,
        checks: [],
      };
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
    async goal(session, observed) {
      return {
        sessionId: session.id,
        sessionRevision: observed.sessionRevision,
        stateRevision: 0,
        basis: null,
        goal: null,
      };
    },
    async startGoal(session, inputId) {
      return this.enqueue(session, inputId, "fixture goal");
    },
    async controlGoal(session, observed, change) {
      return {
        sessionId: session.id,
        requestId: change.requestId,
        sessionRevision: observed.sessionRevision + 1,
        stateRevision: observed.stateRevision + 1,
        turnId: null,
        journalPosition: null,
      };
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
    ipc: new NativeChatIpc(
      ORIGIN,
      (sender) => scopes.get(sender) ?? null,
      undefined,
      confirm,
      confirmDeletion,
      selectArtifactDestination
    ),
    emit: (sessionId: string, update: NativeChatStreamUpdate) => {
      for (const listener of listeners.get(sessionId) ?? []) listener(update);
    },
  };
}

describe("native chat IPC", () => {
  it("reviews an exact child count and reuses its basis only for an unverified delete", async () => {
    const confirm = vi.fn<
      (
        sender: WebContents,
        title: string | null,
        count?: number
      ) => Promise<boolean>
    >(async () => true);
    const { first, chat, ipc } = setup(undefined, confirm);
    const observe = chat.observe.bind(chat);
    let sessionRevision = 1;
    chat.observe = async (session) => ({
      ...(await observe(session)),
      current: null,
      sessionRevision,
    });
    Object.defineProperty(chat, "acceptsSavedChatDeletion", { value: true });
    const prior = {
      ownedChildren: 1,
      ownedChildrenBasis: Object.freeze(Array<number>(32).fill(1)),
    };
    const replacement = {
      ownedChildren: 2,
      ownedChildrenBasis: Object.freeze(Array<number>(32).fill(2)),
    };
    const delayed = Promise.withResolvers<NativeSavedChatDeletionPreview>();
    const preview =
      vi.fn<
        (
          session: NativeChatSession
        ) => Promise<NativeSavedChatDeletionPreview | undefined>
      >();
    preview
      .mockReturnValueOnce(delayed.promise)
      .mockResolvedValueOnce(prior)
      .mockResolvedValueOnce(replacement);
    chat.previewSavedChatDeletion = preview;
    const remove =
      vi.fn<
        (
          session: NativeChatSession,
          snapshot: NativeChatSnapshot,
          catalogRevision: number,
          requestId: string,
          expectedOwnedChildren?: readonly number[]
        ) => Promise<void>
      >();
    remove
      .mockRejectedValueOnce(new Error("session_deletion_dependencies_changed"))
      .mockRejectedValueOnce(new Error("native_chat_deletion_unverified"))
      .mockResolvedValueOnce(undefined);
    chat.deleteSavedChat = remove;
    const opened = await ipc.create(first.event);
    const read = () => ipc.observe(first.event, opened.attachmentId);
    const removeAt = (id: string) =>
      ipc.deleteSavedChat(first.event, opened.attachmentId, id, 0);
    const initial = await read();
    const stale = removeAt(initial.observationId).catch(
      (error: unknown) => error
    );
    await vi.waitFor(() => expect(preview).toHaveBeenCalledOnce());
    sessionRevision++;
    const current = await read();
    delayed.resolve(prior);
    expect(await stale).toEqual(
      expect.objectContaining({ message: "stale_session_revision" })
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    await expect(removeAt(current.observationId)).rejects.toThrow(
      "session_deletion_dependencies_changed"
    );
    await expect(removeAt(current.observationId)).rejects.toThrow(
      "native_chat_deletion_unverified"
    );
    await expect(removeAt((await read()).observationId)).resolves.toBe(true);
    expect(preview).toHaveBeenCalledTimes(3);
    expect(confirm.mock.calls).toEqual([
      [first.sender, null, 1],
      [first.sender, null, 2],
    ]);
    expect(remove.mock.calls[0]?.[4]).toBe(prior.ownedChildrenBasis);
    expect(remove.mock.calls[1]?.[4]).toBe(replacement.ownedChildrenBasis);
    expect(remove.mock.calls[0]?.[3]).not.toBe(remove.mock.calls[1]?.[3]);
    expect(remove.mock.calls[2]).toEqual(remove.mock.calls[1]);
  });

  it("keeps a confirmed request through reply loss and retires only exact owner attachments", async () => {
    const confirm = vi.fn<
      (sender: WebContents, title: string | null) => Promise<boolean>
    >(async () => true);
    const { first, second, chat, ipc, listeners, emit } = setup(
      undefined,
      confirm
    );
    const observe = chat.observe.bind(chat);
    chat.observe = async (session) => ({
      ...(await observe(session)),
      current: null,
    });
    Object.defineProperty(chat, "acceptsSavedChatDeletion", { value: true });
    const remove =
      vi.fn<
        (
          session: NativeChatSession,
          snapshot: NativeChatSnapshot,
          catalogRevision: number,
          requestId: string
        ) => Promise<void>
      >();
    remove
      .mockRejectedValueOnce(new Error("native_chat_deletion_unverified"))
      .mockResolvedValueOnce(undefined);
    chat.deleteSavedChat = remove;
    const target = await ipc.create(first.event);
    const peer = await ipc.load(second.event, target.sessionId);
    const unrelated = await ipc.create(second.event);
    const source = await ipc.observe(first.event, target.attachmentId);
    const targetSubscription = randomUUID();
    const peerSubscription = randomUUID();
    ipc.subscribe(first.event, target.attachmentId, targetSubscription);
    ipc.subscribe(second.event, peer.attachmentId, peerSubscription);

    await expect(
      ipc.deleteSavedChat(
        second.event,
        target.attachmentId,
        source.observationId,
        0
      )
    ).rejects.toThrow("native_chat_attachment_unavailable");
    await expect(
      ipc.deleteSavedChat(
        first.event,
        target.attachmentId,
        source.observationId,
        1
      )
    ).rejects.toThrow("session_catalog_revision_changed");
    expect(confirm).not.toHaveBeenCalled();
    await expect(
      ipc.deleteSavedChat(
        first.event,
        target.attachmentId,
        source.observationId,
        0
      )
    ).rejects.toThrow("native_chat_deletion_unverified");
    expect(listeners.get(target.sessionId)?.size).toBe(2);
    expect(first.frame.send).not.toHaveBeenCalled();
    const next = await ipc.observe(first.event, target.attachmentId);
    await expect(
      ipc.deleteSavedChat(
        first.event,
        target.attachmentId,
        next.observationId,
        0
      )
    ).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledExactlyOnceWith(first.sender, null);
    expect(remove.mock.calls[1]).toEqual(remove.mock.calls[0]);
    for (const [window, attachment, subscriptionId] of [
      [first, target, targetSubscription],
      [second, peer, peerSubscription],
    ] as const) {
      expect(window.frame.send).toHaveBeenCalledExactlyOnceWith(
        IPC_CHANNELS.NATIVE_CHAT_UPDATE,
        {
          subscriptionId,
          attachmentId: attachment.attachmentId,
          update: { kind: "closed", reason: "session_deleted" },
        }
      );
      await expect(
        ipc.observe(window.event, attachment.attachmentId)
      ).rejects.toThrow("native_chat_session_deleted");
    }
    emit(target.sessionId, UPDATE);
    expect(first.frame.send).toHaveBeenCalledTimes(1);
    expect(second.frame.send).toHaveBeenCalledTimes(1);
    await expect(
      ipc.observe(second.event, unrelated.attachmentId)
    ).resolves.toBeTruthy();
  });

  it("requires live frame consent before dispatch and fences a late attachment", async () => {
    const approval = Promise.withResolvers<boolean>();
    const confirm = vi.fn<
      (sender: WebContents, title: string | null) => Promise<boolean>
    >(() => approval.promise);
    const { first, second, chat, ipc } = setup(undefined, confirm);
    const observe = chat.observe.bind(chat);
    chat.observe = async (session) => ({
      ...(await observe(session)),
      current: null,
    });
    Object.defineProperty(chat, "acceptsSavedChatDeletion", { value: true });
    chat.deleteSavedChat = vi.fn<
      (
        session: NativeChatSession,
        snapshot: NativeChatSnapshot,
        catalogRevision: number,
        requestId: string
      ) => Promise<void>
    >(async () => {});
    const opened = await ipc.create(first.event);
    const observation = await ipc.observe(first.event, opened.attachmentId);
    const pending = ipc.deleteSavedChat(
      first.event,
      opened.attachmentId,
      observation.observationId,
      0
    );
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    first.contents.emit("did-start-navigation", { isMainFrame: true });
    approval.resolve(true);
    await expect(pending).rejects.toThrow("native_chat_attachment_unavailable");
    expect(chat.deleteSavedChat).not.toHaveBeenCalled();

    const loading = Promise.withResolvers<NativeChatSession>();
    vi.spyOn(chat, "load").mockReturnValueOnce(loading.promise);
    chat.ownsSession = () => false;
    const late = ipc.load(second.event, opened.sessionId);
    loading.resolve({ id: opened.sessionId });
    await expect(late).rejects.toThrow("native_chat_session_deleted");
  });

  it("keeps the revision private and only retries the exact reviewed context update", async () => {
    const confirm = vi.fn<
      (sender: WebContents, review: ConfigurationReview) => Promise<boolean>
    >(async () => true);
    const { ipc, first, second, chat } = setup(confirm);
    const update = vi.spyOn(chat, "updateContextLimit");
    const inspected = await ipc.contextLimit(first.event);
    expect(inspected).toEqual({
      reviewId: expect.any(String),
      limit: null,
      exactCounting: true,
      source: "active",
    });
    await expect(
      ipc.saveContextLimit(second.event, inspected.reviewId, 1024)
    ).rejects.toThrow("native_context_limit_review_unavailable");
    const saved = await ipc.saveContextLimit(
      first.event,
      inspected.reviewId,
      1024
    );
    expect(saved).toEqual({ limit: 1024, disposition: "applied" });
    expect(
      await ipc.saveContextLimit(first.event, inspected.reviewId, 1024)
    ).toEqual(saved);
    await expect(
      ipc.saveContextLimit(first.event, inspected.reviewId, 4096)
    ).rejects.toThrow("native_context_limit_review_reused");
    expect(confirm).toHaveBeenCalledExactlyOnceWith(first.sender, {
      kind: "limit",
      limit: 1024,
    });
    expect(update).toHaveBeenCalledExactlyOnceWith(
      { limit: null, exactCounting: true, source: "active", revision: null },
      1024
    );
  });

  it("allows Automatic recovery on an unsupported provider and labels an observed timeout outcome", async () => {
    const confirm = vi.fn<
      (sender: WebContents, review: ConfigurationReview) => Promise<boolean>
    >(async () => true);
    const { ipc, first, chat } = setup(confirm);
    const inspect = vi.spyOn(chat, "inspectContextLimit").mockResolvedValue({
      limit: 2048,
      exactCounting: false,
      source: "active",
      revision: Array(32).fill(2),
    });
    const update = vi
      .spyOn(chat, "updateContextLimit")
      .mockRejectedValueOnce(new Error("native_agent_request_timeout"));
    const initial = await ipc.contextLimit(first.event);
    await expect(
      ipc.saveContextLimit(first.event, initial.reviewId, 4096)
    ).rejects.toThrow("native_context_limit_unavailable");
    expect(confirm).not.toHaveBeenCalled();
    inspect.mockResolvedValue({
      limit: null,
      exactCounting: false,
      source: "active",
      revision: Array(32).fill(3),
    });
    await expect(
      ipc.saveContextLimit(first.event, initial.reviewId, null)
    ).resolves.toEqual({ limit: null, disposition: "observed" });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("reviews an exact Act input once and refuses a late or rewritten message", async () => {
    const confirm = vi.fn<
      (sender: WebContents, review: ConfigurationReview) => Promise<boolean>
    >(async () => true);
    const { ipc, first, chat } = setup(confirm);
    const opened = await ipc.create(first.event);
    const input = {
      action: "submit",
      inputId: randomUUID(),
      text: "Change the future context limit.",
    } as const;
    const send = vi
      .spyOn(chat, "sendConfiguration")
      .mockRejectedValueOnce(new Error("fixture lost reply"));
    await expect(
      ipc.submitWithConfigurationReview(first.event, opened.attachmentId, input)
    ).rejects.toThrow("fixture lost reply");
    const accepted = await ipc.submitWithConfigurationReview(
      first.event,
      opened.attachmentId,
      input
    );
    expect(accepted.inputId).toBe(input.inputId);
    expect(
      await ipc.submitWithConfigurationReview(
        first.event,
        opened.attachmentId,
        input
      )
    ).toEqual(accepted);
    await expect(
      ipc.submitWithConfigurationReview(first.event, opened.attachmentId, {
        ...input,
        text: "Another message",
      })
    ).rejects.toThrow("native_context_limit_review_reused");
    expect(confirm).toHaveBeenCalledExactlyOnceWith(first.sender, {
      kind: "message",
      text: input.text,
    });
    expect(send).toHaveBeenCalledTimes(2);

    const delayed = Promise.withResolvers<boolean>();
    confirm.mockReturnValueOnce(delayed.promise);
    const later = ipc.submitWithConfigurationReview(
      first.event,
      opened.attachmentId,
      { ...input, inputId: randomUUID() }
    );
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    first.contents.emit("did-start-navigation", { isMainFrame: true });
    delayed.resolve(true);
    await expect(later).rejects.toThrow("native_chat_attachment_unavailable");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("reports PNG capability only in the current workspace and rejects late delivery", async () => {
    const { ipc, first, second, chat, scopes } = setup();
    expect(ipc.acceptsPng(first.event)).toBe(false);
    const capable = { ...chat, acceptsPng: true };
    scopes.set(first.sender, { workspaceId: WORKSPACE, chat: capable });
    expect(ipc.acceptsPng(first.event)).toBe(true);
    expect(ipc.acceptsPng(second.event)).toBe(false);
    const opened = await ipc.create(first.event);
    const payload = {
      action: "submit",
      inputId: "image-input",
      text: "Describe image.",
      png: new ArrayBuffer(16),
      operatingRegime: "act",
    } as const;
    const reply =
      Promise.withResolvers<Awaited<ReturnType<typeof capable.submitImage>>>();
    const submit = vi
      .spyOn(capable, "submitImage")
      .mockReturnValueOnce(reply.promise);
    await expect(
      ipc.submitImage(second.event, opened.attachmentId, payload)
    ).rejects.toThrow("native_chat_attachment_unavailable");
    expect(submit).not.toHaveBeenCalled();
    const pending = ipc.submitImage(first.event, opened.attachmentId, payload);
    expect(submit).toHaveBeenCalledExactlyOnceWith(
      { id: opened.sessionId },
      payload
    );
    first.contents.emit("did-start-navigation", { isMainFrame: true });
    reply.resolve({
      sessionId: opened.sessionId,
      inputId: "image-input",
      inputPosition: 1,
      turnId: "turn",
      disposition: "claimed",
    });
    await expect(pending).rejects.toThrow("native_chat_attachment_unavailable");
  });

  it("keeps archive browsing detached and binds organization to the admitted attachment", async () => {
    const { ipc, first, second, chat } = setup();
    const list = vi.spyOn(chat, "list");
    const load = vi.spyOn(chat, "load");
    const organize = vi.spyOn(chat, "organize");
    await ipc.list(first.event, "archive-page", true);
    expect(list).toHaveBeenCalledExactlyOnceWith("archive-page", true);
    expect(load).not.toHaveBeenCalled();
    const opened = await ipc.load(first.event, "archived-chat");
    const current = await ipc.catalogEntry(first.event, opened.attachmentId);
    const change = {
      revision: current.revision,
      title: "Restored",
      archived: false,
    };
    await expect(
      ipc.organize(second.event, opened.attachmentId, change)
    ).rejects.toThrow("native_chat_attachment_unavailable");
    expect(organize).not.toHaveBeenCalled();
    const late = Promise.withResolvers<typeof current>();
    organize.mockReturnValueOnce(late.promise);
    const pending = ipc.organize(first.event, opened.attachmentId, change);
    expect(organize).toHaveBeenCalledExactlyOnceWith(
      { id: opened.sessionId },
      change
    );
    first.contents.emit("did-start-navigation", { isMainFrame: true });
    late.resolve({ ...current, ...change });
    await expect(pending).rejects.toThrow("native_chat_attachment_unavailable");
  });

  it("reads only the current attached terminal basis and drops a superseded reply", async () => {
    const { ipc, first, second, chat } = setup();
    const parent = await ipc.create(first.event);
    const another = await ipc.load(second.event, parent.sessionId);
    const running = await ipc.observe(first.event, parent.attachmentId);
    const summary = vi.spyOn(chat, "turnSummary");
    await expect(
      ipc.turnSummary(first.event, parent.attachmentId, running.observationId)
    ).rejects.toThrow("native_chat_turn_summary_unavailable");
    expect(summary).not.toHaveBeenCalled();
    const latest = {
      ...running.snapshot.current!,
      disposition: "settled",
      status: "succeeded",
    } as const;
    const observe = vi.spyOn(chat, "observe").mockResolvedValue({
      ...running.snapshot,
      current: null,
      latest,
    });
    const settled = await ipc.observe(first.event, parent.attachmentId);
    await expect(
      ipc.turnSummary(second.event, another.attachmentId, settled.observationId)
    ).rejects.toThrow("native_chat_observation_unavailable");
    const record = await ipc.turnSummary(
      first.event,
      parent.attachmentId,
      settled.observationId
    );
    expect(record.turnId).toBe(latest.turnId);
    const late = Promise.withResolvers<typeof record>();
    summary.mockReturnValueOnce(late.promise);
    const pending = ipc.turnSummary(
      first.event,
      parent.attachmentId,
      settled.observationId
    );
    observe.mockResolvedValue({
      ...settled.snapshot,
      sessionRevision: settled.snapshot.sessionRevision + 1,
      latest: { ...latest, turnId: "newer-turn" },
    });
    const next = await ipc.observe(first.event, parent.attachmentId);
    late.resolve(record);
    await expect(pending).rejects.toThrow(
      "native_chat_turn_summary_unavailable"
    );
    await expect(
      ipc.turnSummary(first.event, parent.attachmentId, next.observationId)
    ).resolves.toMatchObject({ turnId: "newer-turn" });
    first.contents.emit("did-start-navigation", { isMainFrame: true });
    await expect(
      ipc.turnSummary(first.event, parent.attachmentId, next.observationId)
    ).rejects.toThrow("native_chat_attachment_unavailable");
  });

  it("releases only a listed PNG and drops a read when its observed turn changes", async () => {
    const select = vi.fn<(sender: WebContents) => Promise<string | null>>();
    const { ipc, first, second, chat } = setup(undefined, undefined, select);
    const parent = await ipc.create(first.event);
    const another = await ipc.load(second.event, parent.sessionId);
    const running = await ipc.observe(first.event, parent.attachmentId);
    const latest = {
      ...running.snapshot.current!,
      disposition: "settled",
      status: "succeeded",
    } as const;
    const observe = vi.spyOn(chat, "observe").mockResolvedValue({
      ...running.snapshot,
      current: null,
      latest,
    });
    const bytes = new ArrayBuffer(67);
    const artifact = {
      id: "crop",
      kind: "image",
      mimeType: "image/png",
      label: "Cropped PNG",
      width: 1,
      height: 1,
      bytes: bytes.byteLength,
    } as const;
    const summarize = chat.turnSummary;
    vi.spyOn(chat, "turnSummary").mockImplementation(
      async (session, snapshot) => ({
        ...(await summarize(session, snapshot)),
        artifacts: [artifact],
      })
    );
    const read = vi
      .fn<NonNullable<ActiveNativeChat["chat"]["readArtifact"]>>()
      .mockResolvedValueOnce(bytes);
    chat.readArtifact = read;
    const settled = await ipc.observe(first.event, parent.attachmentId);
    const readIn = (id: string = artifact.id) =>
      ipc.readArtifact(
        first.event,
        parent.attachmentId,
        settled.observationId,
        id
      );
    await expect(readIn()).rejects.toThrow("native_chat_artifact_unavailable");
    await ipc.turnSummary(
      first.event,
      parent.attachmentId,
      settled.observationId
    );
    await expect(
      ipc.readArtifact(
        second.event,
        another.attachmentId,
        settled.observationId,
        artifact.id
      )
    ).rejects.toThrow("native_chat_observation_unavailable");
    await expect(readIn("another-crop")).rejects.toThrow(
      "native_chat_artifact_unavailable"
    );
    const saveIn = (id: unknown = artifact.id) =>
      ipc.saveArtifact(
        first.event,
        parent.attachmentId,
        settled.observationId,
        id
      );
    await expect(
      saveIn({ id: artifact.id, path: "/untrusted.png" })
    ).rejects.toThrow("native_chat_artifact_unavailable");
    await expect(
      ipc.saveArtifact(
        second.event,
        parent.attachmentId,
        settled.observationId,
        artifact.id
      )
    ).rejects.toThrow("native_chat_attachment_unavailable");
    expect(select).not.toHaveBeenCalled();
    select.mockResolvedValueOnce(null);
    await expect(saveIn()).resolves.toBe("cancelled");
    expect(read).not.toHaveBeenCalled();
    await expect(readIn()).resolves.toBe(bytes);
    expect(read).toHaveBeenCalledExactlyOnceWith(
      { id: parent.sessionId },
      settled.snapshot,
      artifact
    );

    const late = Promise.withResolvers<ArrayBuffer>();
    const chooser = Promise.withResolvers<string>();
    select.mockReturnValueOnce(chooser.promise);
    const saving = saveIn();
    await expect(saveIn()).rejects.toThrow("native_chat_artifact_busy");
    read.mockReturnValueOnce(late.promise);
    const pending = readIn();
    await expect(readIn()).rejects.toThrow("native_chat_artifact_busy");
    observe.mockResolvedValue({
      ...settled.snapshot,
      current: running.snapshot.current,
    });
    await ipc.observe(first.event, parent.attachmentId);
    chooser.resolve("/not-selected-by-current-frame.png");
    late.resolve(bytes);
    await expect(pending).rejects.toThrow("native_chat_artifact_unavailable");
    await expect(saving).rejects.toThrow("native_chat_artifact_unavailable");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("scopes temporary side chats to each parent attachment and endpoint generation", async () => {
    const { ipc, first, second, chat, scopes } = setup();
    const one = await ipc.create(first.event);
    const two = await ipc.load(second.event, one.sessionId);
    const openId = randomUUID();
    const requestId = randomUUID();
    const open = vi.spyOn(chat, "openSideChat");
    const ask = vi.spyOn(chat, "askSideChat");
    const close = vi.spyOn(chat, "closeSideChat");
    const context = await ipc.openSideChat(
      first.event,
      one.attachmentId,
      openId
    );
    await expect(
      ipc.openSideChat(first.event, one.attachmentId, openId)
    ).resolves.toEqual(context);
    expect(open).toHaveBeenCalledTimes(1);
    await expect(
      ipc.askSideChat(
        second.event,
        two.attachmentId,
        openId,
        requestId,
        "Copied"
      )
    ).rejects.toThrow("native_chat_side_unavailable");
    await ipc.openSideChat(second.event, two.attachmentId, openId);
    expect(open.mock.calls[0][1]).not.toBe(open.mock.calls[1][1]);
    await ipc.askSideChat(
      first.event,
      one.attachmentId,
      openId,
      requestId,
      "Original"
    );
    expect(ask).toHaveBeenCalledExactlyOnceWith(
      { id: one.sessionId },
      expect.objectContaining({ parent: one.sessionId }),
      requestId,
      "Original"
    );

    scopes.set(first.sender, { workspaceId: WORKSPACE, chat: { ...chat } });
    await expect(
      ipc.askSideChat(
        first.event,
        one.attachmentId,
        openId,
        requestId,
        "Original"
      )
    ).rejects.toThrow("native_chat_scope_changed");
    expect(close).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: open.mock.calls[0][1] })
    );
    ipc.detach(second.event, two.attachmentId);
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(2));
  });

  it("retires a side chat that opens after navigation", async () => {
    const { ipc, first, chat } = setup();
    const parent = await ipc.create(first.event);
    const opened =
      Promise.withResolvers<
        Awaited<ReturnType<ActiveNativeChat["chat"]["openSideChat"]>>
      >();
    vi.spyOn(chat, "openSideChat").mockReturnValueOnce(opened.promise);
    const close = vi.spyOn(chat, "closeSideChat");
    const opening = ipc.openSideChat(
      first.event,
      parent.attachmentId,
      randomUUID()
    );
    first.contents.emit("did-start-navigation", { isMainFrame: true });
    const side = {
      id: "late-side",
      parent: parent.sessionId,
      context: {
        sourceRevision: 1,
        compacted: false,
        truncated: false,
        omitted: false,
      },
    };
    opened.resolve(side);
    await expect(opening).rejects.toThrow("native_chat_attachment_unavailable");
    expect(close).toHaveBeenCalledExactlyOnceWith(side);
  });

  it("recovers an unconfirmed open only to close the exact temporary chat", async () => {
    const { ipc, first, chat } = setup();
    const parent = await ipc.create(first.event);
    const openId = randomUUID();
    const open = vi
      .spyOn(chat, "openSideChat")
      .mockRejectedValueOnce(new Error("native_agent_request_timeout"));
    const close = vi.spyOn(chat, "closeSideChat");
    await expect(
      ipc.openSideChat(first.event, parent.attachmentId, openId)
    ).rejects.toThrow("native_agent_request_timeout");
    await ipc.closeSideChat(first.event, parent.attachmentId, openId);
    expect(open.mock.calls[1]).toEqual(open.mock.calls[0]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("issues goal controls only for the attached frame's inspected basis", async () => {
    const { ipc, first, second, chat } = setup();
    const one = await ipc.create(first.event);
    const two = await ipc.load(second.event, one.sessionId);
    const basis = await ipc.observe(first.event, one.attachmentId);
    const inspect = {
      sessionId: one.sessionId,
      sessionRevision: basis.snapshot.sessionRevision,
      stateRevision: 2,
      basis: { goal: "goal", revision: 2 },
      goal: {
        goalId: "goal",
        objective: "Finish the fixture",
        criteria: ["Verify it"],
        allowance: { workTurns: 1, inferenceSteps: 8 },
        automatic: false,
        state: { status: "active" },
        paused: false,
        progress: null,
        spent: { workTurns: 0, inferenceSteps: 0 },
        remaining: { workTurns: 1, inferenceSteps: 8 },
        reservation: null,
      },
    } as const;
    vi.spyOn(chat, "goal").mockResolvedValue(inspect);
    const control = vi.spyOn(chat, "controlGoal");
    const { observationId } = await ipc.goal(
      first.event,
      one.attachmentId,
      basis.observationId
    );
    const pause = { observationId, requestId: "pause-goal", action: "pause" };
    await expect(
      ipc.controlGoal(second.event, two.attachmentId, pause)
    ).rejects.toThrow("native_chat_goal_observation_unavailable");
    await expect(
      ipc.controlGoal(first.event, one.attachmentId, {
        ...pause,
        action: "accept_proposal",
      })
    ).rejects.toThrow("native_chat_goal_control_invalid");
    await ipc.controlGoal(first.event, one.attachmentId, pause);
    expect(control).toHaveBeenCalledExactlyOnceWith(
      { id: one.sessionId },
      inspect,
      pause
    );
    first.contents.emit("did-start-navigation", { isMainFrame: true });
    await expect(
      ipc.controlGoal(first.event, one.attachmentId, pause)
    ).rejects.toThrow("native_chat_attachment_unavailable");
  });

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
      (key) =>
        key.startsWith("NATIVE_CHAT_") &&
        key !== "NATIVE_CHAT_UPDATE" &&
        key !== "NATIVE_CHAT_EDITOR_SURFACE_OPEN"
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
